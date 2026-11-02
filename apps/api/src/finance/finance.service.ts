import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EntryDto, GoldPriceDto, HoldingDto, MonthDto, SettingsDto } from './finance.dto';

const strip = <T extends { createdAt?: Date; updatedAt?: Date }>(r: T) => {
  const { createdAt, updatedAt, ...rest } = r;
  return rest;
};

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async all() {
    const [entries, months, holdings, setting] = await Promise.all([
      this.prisma.entry.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.monthState.findMany(),
      this.prisma.holding.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.setting.findUnique({ where: { id: 1 } }),
    ]);
    return {
      entries: entries.map(strip),
      months: Object.fromEntries(months.map((m) => [m.key, { paid: m.paid ?? {}, amt: m.amt ?? {} }])),
      holdings: holdings.map(strip),
      settings: { threshold: setting?.threshold ?? 6000000 },
    };
  }

  createEntry(dto: EntryDto) {
    return this.prisma.entry.create({ data: this.entryData(dto) }).then(strip);
  }

  async updateEntry(id: string, dto: EntryDto) {
    await this.exists('entry', id);
    return this.prisma.entry.update({ where: { id }, data: this.entryData(dto) }).then(strip);
  }

  async deleteEntry(id: string) {
    await this.prisma.entry.deleteMany({ where: { id } });
    return { ok: true };
  }

  private entryData(dto: EntryDto) {
    return {
      name: dto.name.trim(),
      flow: dto.flow,
      bank: dto.bank?.trim() ?? '',
      mode: dto.mode,
      amount: dto.amount,
      start: dto.start,
      months: dto.mode === 'sekali' ? null : (dto.months ?? null),
      note: dto.note?.trim() ?? '',
    };
  }

  async saveMonth(key: string, dto: MonthDto) {
    const paid = Object.fromEntries(Object.entries(dto.paid).filter(([, v]) => v === true));
    const amt = Object.fromEntries(
      Object.entries(dto.amt).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0),
    );
    await this.prisma.monthState.upsert({ where: { key }, create: { key, paid, amt }, update: { paid, amt } });
    return { key, paid, amt };
  }

  createHolding(dto: HoldingDto) {
    return this.prisma.holding.create({ data: this.holdingData(dto) }).then(strip);
  }

  async updateHolding(id: string, dto: HoldingDto) {
    await this.exists('holding', id);
    return this.prisma.holding.update({ where: { id }, data: this.holdingData(dto) }).then(strip);
  }

  async deleteHolding(id: string) {
    await this.prisma.holding.deleteMany({ where: { id } });
    return { ok: true };
  }

  private holdingData(dto: HoldingDto) {
    const gram = dto.unit === 'gram';
    return {
      name: dto.name.trim(),
      category: dto.category?.trim() ?? '',
      owner: dto.owner?.trim() ?? '',
      purpose: dto.purpose?.trim() ?? '',
      unit: dto.unit,
      value: gram || dto.value == null ? null : BigInt(dto.value),
      grams: gram ? (dto.grams ?? 0) : null,
      price: gram ? (dto.price ?? 0) : null,
      monthly: gram ? null : (dto.monthly ?? null),
      since: gram ? null : (dto.since ?? null),
      estimate: !!dto.estimate,
      note: dto.note?.trim() ?? '',
      priceDate: gram ? (dto.priceDate ?? null) : null,
      priceSource: gram ? (dto.priceSource ?? null) : null,
      updated: dto.updated ?? new Date().toISOString().slice(0, 10),
    };
  }

  async saveSettings(dto: SettingsDto) {
    await this.prisma.setting.upsert({
      where: { id: 1 },
      create: { id: 1, threshold: dto.threshold },
      update: { threshold: dto.threshold },
    });
    return dto;
  }

  /** Updates the price of every gold holding (unit = gram). */
  async setGoldPrice(dto: GoldPriceDto) {
    const r = await this.prisma.holding.updateMany({
      where: { unit: 'gram' },
      data: { price: dto.price, priceDate: dto.priceDate, priceSource: dto.priceSource ?? 'buyback Antam' },
    });
    return { updated: r.count };
  }

  private async exists(kind: 'entry' | 'holding', id: string) {
    const found =
      kind === 'entry'
        ? await this.prisma.entry.findUnique({ where: { id }, select: { id: true } })
        : await this.prisma.holding.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Data tidak ditemukan. Muat ulang halaman.');
  }
}
