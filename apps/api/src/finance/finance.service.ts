import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BankDto, EntryDto, GoalDto, GoldPriceDto, HoldingDto, MonthDto, SettingsDto } from './finance.dto';

const strip = <T extends { createdAt?: Date; updatedAt?: Date }>(r: T) => {
  const { createdAt, updatedAt, ...rest } = r;
  return rest;
};

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async all() {
    const [entries, months, holdings, setting, goals, banks] = await Promise.all([
      this.prisma.entry.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.monthState.findMany(),
      this.prisma.holding.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.setting.findUnique({ where: { id: 1 } }),
      this.prisma.goal.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.bank.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return {
      entries: entries.map(strip),
      months: Object.fromEntries(months.map((m) => [m.key, { paid: m.paid ?? {}, amt: m.amt ?? {} }])),
      holdings: holdings.map(strip),
      settings: { threshold: setting?.threshold ?? 6000000 },
      goals: goals.map(strip),
      banks: banks.map((b) => b.name),
    };
  }

  createEntry(dto: EntryDto) {
    return this.prisma.entry.create({ data: this.entryData(dto) }).then(strip);
  }

  /** All or nothing: used when saving lines from an uploaded statement. */
  async createEntries(list: EntryDto[]) {
    const rows = await this.prisma.$transaction(list.map((dto) => this.prisma.entry.create({ data: this.entryData(dto) })));
    return rows.map(strip);
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
      holdingId: dto.flow === 'save' ? dto.holdingId || null : null,
    };
  }

  async saveMonth(key: string, dto: MonthDto) {
    const paid = Object.fromEntries(Object.entries(dto.paid).filter(([, v]) => v === true));
    const amt = Object.fromEntries(
      Object.entries(dto.amt).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0),
    );
    // Ticking an allocation linked to an asset adds its amount to that asset; unticking takes it back.
    // Done here, against the stored month, so the change happens exactly once per tick.
    const changed = await this.prisma.$transaction(async (tx) => {
      const before = await tx.monthState.findUnique({ where: { key } });
      const oldPaid = (before?.paid ?? {}) as Record<string, boolean>;
      const oldAmt = (before?.amt ?? {}) as Record<string, number>;
      const ids = [...new Set([...Object.keys(oldPaid), ...Object.keys(paid)])];
      const linked = ids.length
        ? await tx.entry.findMany({ where: { id: { in: ids }, flow: 'save', NOT: { holdingId: null } } })
        : [];
      const delta = new Map<string, number>();
      for (const e of linked) {
        const was = oldPaid[e.id] === true;
        const now = paid[e.id] === true;
        if (was === now) continue;
        const value = now ? (amt[e.id] ?? e.amount) : -(oldAmt[e.id] ?? e.amount);
        delta.set(e.holdingId!, (delta.get(e.holdingId!) ?? 0) + value);
      }
      const updated = [];
      for (const [holdingId, d] of delta) {
        const h = await tx.holding.findUnique({ where: { id: holdingId } });
        if (!h || h.unit !== 'rp' || d === 0) continue;
        const next = (h.value ?? BigInt(0)) + BigInt(d);
        updated.push(
          await tx.holding.update({
            where: { id: holdingId },
            data: { value: next < 0 ? BigInt(0) : next, updated: new Date().toISOString().slice(0, 10) },
          }),
        );
      }
      await tx.monthState.upsert({ where: { key }, create: { key, paid, amt }, update: { paid, amt } });
      return updated;
    });
    return { key, paid, amt, holdings: changed.map(strip) };
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
      place: dto.place?.trim() ?? '',
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

  createGoal(dto: GoalDto) {
    return this.prisma.goal.create({ data: this.goalData(dto) }).then(strip);
  }

  async updateGoal(id: string, dto: GoalDto) {
    const found = await this.prisma.goal.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Data tidak ditemukan. Muat ulang halaman.');
    return this.prisma.goal.update({ where: { id }, data: this.goalData(dto) }).then(strip);
  }

  async deleteGoal(id: string) {
    await this.prisma.goal.deleteMany({ where: { id } });
    return { ok: true };
  }

  private goalData(dto: GoalDto) {
    const holdingIds = [...new Set(dto.holdingIds)];
    return {
      name: dto.name.trim(),
      target: BigInt(dto.target),
      saved: holdingIds.length ? BigInt(0) : BigInt(dto.saved ?? 0),
      deadline: dto.deadline ?? null,
      holdingIds,
      note: dto.note?.trim() ?? '',
    };
  }

  /** Adds a bank to the picker list; adding one that already exists is a no-op. */
  async addBank(dto: BankDto) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Nama bank kosong.');
    await this.prisma.bank.upsert({ where: { name }, create: { name }, update: {} });
    return { name };
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
