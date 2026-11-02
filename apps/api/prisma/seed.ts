// Mengisi database. Memakai prisma/seed-data.json kalau ada (data pribadi, tidak di-commit),
// kalau tidak ada memakai seed-data.example.json (data contoh). Aman diulang: data di-upsert.
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const privatePath = join(__dirname, 'seed-data.json');
const file = existsSync(privatePath) ? privatePath : join(__dirname, 'seed-data.example.json');
const seed = JSON.parse(readFileSync(file, 'utf8'));

async function main() {
  console.log(`Seed dari ${file.endsWith('example.json') ? 'data CONTOH' : 'seed-data.json'}`);
  for (const e of seed.entries) {
    const data = {
      name: e.name, flow: e.flow, bank: e.bank ?? '', mode: e.mode, amount: e.amount,
      start: e.start, months: e.months ?? null, note: e.note ?? '',
    };
    await prisma.entry.upsert({ where: { id: e.id }, create: { id: e.id, ...data }, update: data });
  }
  for (const m of seed.months) {
    await prisma.monthState.upsert({
      where: { key: m.key },
      create: { key: m.key, paid: m.paid, amt: m.amt },
      update: { paid: m.paid, amt: m.amt },
    });
  }
  for (const h of seed.holdings) {
    const data = {
      name: h.name, category: h.category ?? '', owner: h.owner ?? '', purpose: h.purpose ?? '',
      unit: h.unit, value: h.value == null ? null : BigInt(h.value), grams: h.grams ?? null,
      price: h.price ?? null, monthly: h.monthly ?? null, since: h.since ?? null,
      estimate: !!h.estimate, note: h.note ?? '', priceDate: h.priceDate ?? null,
      priceSource: h.priceSource ?? null, updated: h.updated ?? null,
    };
    await prisma.holding.upsert({ where: { id: h.id }, create: { id: h.id, ...data }, update: data });
  }
  await prisma.setting.upsert({
    where: { id: 1 },
    create: { id: 1, threshold: seed.settings.threshold },
    update: { threshold: seed.settings.threshold },
  });
  console.log(`Selesai: ${seed.entries.length} entri, ${seed.holdings.length} aset.`);
}

main().finally(() => prisma.$disconnect());
