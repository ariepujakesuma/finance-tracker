import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma.service';

export const COOKIE = 'ft_session';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_DAYS = 30;
export const DEFAULT_HINT = 'Masukkan PIN';

/** Accept "12-05-2020", "12/05/2020" or "12052020" — only the digits count. */
export function normalizePin(pin: unknown): string {
  const digits = String(pin ?? '').replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 8) {
    throw new BadRequestException('PIN harus 4–8 angka.');
  }
  return digits;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  private secret() {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 32) throw new Error('JWT_SECRET belum diset (minimal 32 karakter).');
    return s;
  }

  private config() {
    return this.prisma.authConfig.findUnique({ where: { id: 1 } });
  }

  sign(tokenVersion: number) {
    return jwt.sign({ v: tokenVersion }, this.secret(), { expiresIn: `${SESSION_DAYS}d` });
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    };
  }

  async verifyToken(token?: string): Promise<boolean> {
    if (!token) return false;
    try {
      const payload = jwt.verify(token, this.secret()) as { v: number };
      const cfg = await this.config();
      return !!cfg && cfg.tokenVersion === payload.v;
    } catch {
      return false;
    }
  }

  async status(token?: string) {
    const cfg = await this.config();
    return {
      hasPin: !!cfg,
      hint: cfg?.hint ?? DEFAULT_HINT,
      authenticated: await this.verifyToken(token),
      lockedUntil: cfg?.lockedUntil && cfg.lockedUntil > new Date() ? cfg.lockedUntil : null,
      setupKeyRequired: !!process.env.SETUP_KEY,
    };
  }

  private checkSetupKey(key?: string) {
    const expected = process.env.SETUP_KEY;
    if (expected && key !== expected) throw new ForbiddenException('Setup key salah.');
  }

  async setup(pin: string, hint: string | undefined, setupKey?: string) {
    if (await this.config()) throw new ForbiddenException('PIN sudah dibuat. Gunakan ganti PIN.');
    this.checkSetupKey(setupKey);
    const pinHash = await bcrypt.hash(normalizePin(pin), 10);
    const cfg = await this.prisma.authConfig.create({
      data: { id: 1, pinHash, hint: hint?.trim() || DEFAULT_HINT },
    });
    return this.sign(cfg.tokenVersion);
  }

  /** Throws when locked or wrong; resets the counter on success. */
  private async checkPin(pin: string) {
    const cfg = await this.config();
    if (!cfg) throw new BadRequestException('PIN belum dibuat.');
    const now = new Date();
    if (cfg.lockedUntil && cfg.lockedUntil > now) {
      const mins = Math.ceil((cfg.lockedUntil.getTime() - now.getTime()) / 60000);
      throw new HttpException(`Terlalu banyak percobaan. Coba lagi dalam ${mins} menit.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const ok = await bcrypt.compare(normalizePin(pin), cfg.pinHash);
    if (!ok) {
      const failed = cfg.failedCount + 1;
      const lock = failed >= MAX_ATTEMPTS;
      await this.prisma.authConfig.update({
        where: { id: 1 },
        data: {
          failedCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null,
        },
      });
      throw new UnauthorizedException(
        lock
          ? `PIN salah ${MAX_ATTEMPTS} kali. Akses dikunci ${LOCK_MINUTES} menit.`
          : `PIN salah. Sisa ${MAX_ATTEMPTS - failed} percobaan.`,
      );
    }
    if (cfg.failedCount || cfg.lockedUntil) {
      await this.prisma.authConfig.update({ where: { id: 1 }, data: { failedCount: 0, lockedUntil: null } });
    }
    return cfg;
  }

  async login(pin: string) {
    const cfg = await this.checkPin(pin);
    return this.sign(cfg.tokenVersion);
  }

  /** Changing the PIN signs out every other device. */
  async change(oldPin: string, newPin: string, hint?: string) {
    await this.checkPin(oldPin);
    const pinHash = await bcrypt.hash(normalizePin(newPin), 10);
    const cfg = await this.prisma.authConfig.update({
      where: { id: 1 },
      data: { pinHash, tokenVersion: { increment: 1 }, ...(hint?.trim() ? { hint: hint.trim() } : {}) },
    });
    return this.sign(cfg.tokenVersion);
  }

  /** Forgot PIN: only possible when SETUP_KEY is configured on the server. */
  async reset(setupKey: string, newPin: string, hint?: string) {
    if (!process.env.SETUP_KEY) throw new ForbiddenException('Reset PIN tidak aktif (SETUP_KEY belum diset).');
    this.checkSetupKey(setupKey);
    const pinHash = await bcrypt.hash(normalizePin(newPin), 10);
    const cfg = await this.prisma.authConfig.upsert({
      where: { id: 1 },
      create: { id: 1, pinHash, hint: hint?.trim() || DEFAULT_HINT },
      update: {
        pinHash,
        failedCount: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
        ...(hint?.trim() ? { hint: hint.trim() } : {}),
      },
    });
    return this.sign(cfg.tokenVersion);
  }
}
