// Turns the text lines of a credit-card statement into bill items.
// Pure functions only (no DOM, no pdf.js) so they can be tested on their own.

export type Bank = 'Mandiri' | 'BCA' | 'Jenius';

export type Txn = {
  date: string; // as printed on the statement
  desc: string;
  amount: number; // rupiah, positive
  credit: boolean;
  inst: { no: number; total: number } | null;
};

export type Statement = {
  bank: Bank | null;
  dueDate: string | null; // YYYY-MM-DD
  statementDate: string | null;
  total: number | null; // total tagihan printed on the statement
  items: Txn[]; // debits to record, after removing payments and reversals
  skipped: Txn[]; // payments, reversals and zero lines, shown for transparency
  tested: boolean; // false when the bank layout has no tested parser yet
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8,
  sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
  januari: 1, februari: 2, maret: 3, april: 4, juni: 6, juli: 7, agustus: 8, september: 9,
  oktober: 10, november: 11, desember: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
const monthNum = (s: string) => MONTHS[s.toLowerCase()] ?? MONTHS[s.toLowerCase().slice(0, 3)];

/** "6,869,400.00" (Mandiri) or "4.586.879" (BCA) → 6869400 / 4586879. */
export function parseAmount(raw: string): number {
  const s = raw.trim();
  if (/^\d{1,3}(,\d{3})*\.\d{2}$/.test(s)) return Math.round(Number(s.replace(/,/g, '')));
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) return Math.round(Number(s.replace(/\./g, '').replace(',', '.')));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ''));
  return Number(s.replace(/[^\d]/g, '')) || 0;
}

export function detectBank(text: string): Bank | null {
  const t = text.toLowerCase();
  if (t.includes('jenius') || t.includes('smbc indonesia') || t.includes('btpn')) return 'Jenius';
  if (t.includes('mandiri')) return 'Mandiri';
  if (t.includes('bank central asia') || t.includes('halo bca') || /rekening kartu kredit/.test(t)) return 'BCA';
  return null;
}

/** "07-Nov-26", "19 OKTOBER 2026", "07/11/2026", "07 Nov 2026" → "2026-11-07". */
export function toIso(s: string): string | null {
  let m = s.match(/(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{2,4})/);
  if (m) {
    const mo = monthNum(m[2]);
    if (!mo) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(mo)}-${pad(Number(m[1]))}`;
  }
  m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  return null;
}

const AMOUNT = String.raw`(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)`;
const SKIP_DESC = /^(tagihan bulan lalu|saldo sebelumnya|sub-?total|total\b|subtotal transaksi)/i;
const PAYMENT = /(payment|pembayaran)/i;

function finish(bank: Bank | null, head: Omit<Statement, 'items' | 'skipped' | 'bank' | 'tested'>, raw: Txn[], tested: boolean): Statement {
  const items: Txn[] = [];
  const skipped: Txn[] = [];
  const debits = raw.filter((t) => !t.credit);
  // A non-payment credit (e.g. "Convert to IPP KLINIK X") cancels the matching debit.
  for (const c of raw.filter((t) => t.credit)) {
    skipped.push(c);
    if (PAYMENT.test(c.desc)) continue;
    const i = debits.findIndex((d) => d.amount === c.amount && !d.inst);
    if (i >= 0) skipped.push(...debits.splice(i, 1));
  }
  for (const d of debits) (d.amount > 0 ? items : skipped).push(d);
  return { bank, ...head, items, skipped, tested };
}

// ---------- Mandiri ----------
// 20-Sep-26  20-Sep-26  FITNES PLUS CIREBON 009/012   125,000.00
// 09-Oct-26  10-Oct-26  Convert to IPP KLINIK CASADIENTA   751,500.00  CR
function parseMandiri(lines: string[]): Statement {
  const text = lines.join('\n');
  const dates = text.match(/(\d{2}-[A-Za-z]{3}-\d{2})\s+(\d{2}-[A-Za-z]{3}-\d{2})/);
  const totalM = text.match(/MANDIRI[A-Z ]*?\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/) || text.match(/SUB-TOTAL\s+([\d,]+\.\d{2})/);
  const raw: Txn[] = [];
  const re = new RegExp(String.raw`^(\d{2}-[A-Za-z]{3}-\d{2})\s+\d{2}-[A-Za-z]{3}-\d{2}\s+(.+?)\s+${AMOUNT}(\s+CR)?$`);
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    let desc = m[2].trim();
    let inst: Txn['inst'] = null;
    const im = desc.match(/\s(\d{3})\/(\d{3})$/);
    if (im) {
      inst = { no: Number(im[1]), total: Number(im[2]) };
      desc = desc.slice(0, im.index).trim();
    }
    if (SKIP_DESC.test(desc)) continue;
    raw.push({ date: m[1], desc, amount: parseAmount(m[3]), credit: !!m[4], inst });
  }
  return finish('Mandiri', {
    statementDate: dates ? toIso(dates[1]) : null,
    dueDate: dates ? toIso(dates[2]) : null,
    total: totalM ? parseAmount(totalM[1]) : null,
  }, raw, true);
}

// ---------- BCA ----------
// 25-SEP  25-SEP  CICILAN BCA KE 08 DARI 12, GTN BLIBLI CI   766.583
// 04-SEP  04-SEP  PEMBAYARAN - MYBCA   766.583 CR
function parseBCA(lines: string[]): Statement {
  const text = lines.join('\n');
  const stmt = text.match(/TANGGAL REKENING\s*:\s*(\d{1,2}\s+[A-Z]+\s+\d{4})/i);
  const due = text.match(/TANGGAL JATUH TEMPO\s*:\s*(\d{1,2}\s+[A-Z]+\s+\d{4})/i);
  const total = text.match(/TAGIHAN BARU\s*:\s*RP\s*([\d.]+)/i);
  const raw: Txn[] = [];
  const re = new RegExp(String.raw`^(\d{2}-[A-Z]{3})\s+\d{2}-[A-Z]{3}\s+(.+?)\s+${AMOUNT}(\s*CR)?$`, 'i');
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    let desc = m[2].trim();
    let inst: Txn['inst'] = null;
    const im = desc.match(/^CICILAN BCA KE (\d+) DARI (\d+),?\s*(.*)$/i);
    if (im) {
      inst = { no: Number(im[1]), total: Number(im[2]) };
      desc = im[3].trim() || 'Cicilan BCA';
    }
    if (SKIP_DESC.test(desc)) continue;
    raw.push({ date: m[1], desc, amount: parseAmount(m[3]), credit: !!m[4], inst });
  }
  return finish('BCA', {
    statementDate: stmt ? toIso(stmt[1]) : null,
    dueDate: due ? toIso(due[1]) : null,
    total: total ? parseAmount(total[1]) : null,
  }, raw, true);
}

// ---------- Jenius and anything else ----------
// No sample has been tested yet, so this reads any line shaped like
// "<date> [<date>] <description> <amount> [CR]" and lets the person review it.
function parseGeneric(bank: Bank | null, lines: string[]): Statement {
  const text = lines.join('\n');
  const DATE = String.raw`(\d{1,2}[-/\s](?:[A-Za-z]{3,9}|\d{1,2})(?:[-/\s]\d{2,4})?)`;
  const due = text.match(/(?:jatuh tempo|due date)[^\d]{0,40}(\d{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s]\d{2,4})/i);
  const stmt = text.match(/(?:tanggal (?:cetak|tagihan|statement)|statement date)[^\d]{0,40}(\d{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s]\d{2,4})/i);
  const total = text.match(/(?:total tagihan|tagihan baru|total (?:amount )?due|new balance)[^\d]{0,30}(?:rp|idr)?\s*([\d.,]+)/i);
  const re = new RegExp(String.raw`^${DATE}\s+(?:${DATE}\s+)?(.+?)\s+(?:-?\s*(?:rp|idr)\s*)?${AMOUNT}\s*(CR|DB)?$`, 'i');
  const raw: Txn[] = [];
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    let desc = m[3].trim();
    if (SKIP_DESC.test(desc)) continue;
    let inst: Txn['inst'] = null;
    const im = desc.match(/(?:cicilan|installment|ke)?\s*(\d{1,2})\s*(?:\/|dari|of)\s*(\d{1,2})\b/i);
    if (im && Number(im[2]) >= Number(im[1]) && Number(im[2]) <= 60) {
      inst = { no: Number(im[1]), total: Number(im[2]) };
      desc = desc.replace(im[0], ' ').replace(/\s+/g, ' ').trim();
    }
    const credit = (m[5] || '').toUpperCase() === 'CR' || PAYMENT.test(desc);
    raw.push({ date: m[1], desc, amount: parseAmount(m[4]), credit, inst });
  }
  return finish(bank, {
    statementDate: stmt ? toIso(stmt[1]) : null,
    dueDate: due ? toIso(due[1]) : null,
    total: total ? parseAmount(total[1]) : null,
  }, raw, false);
}

export function parseStatement(lines: string[], forceBank?: Bank | null): Statement {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const bank = forceBank || detectBank(clean.join('\n'));
  if (bank === 'Mandiri') return parseMandiri(clean);
  if (bank === 'BCA') return parseBCA(clean);
  return parseGeneric(bank, clean);
}

/** "GTN BLIBLI STORE - CIREBOCireb" → "Gtn Blibli Store - Cirebocireb" for a readable default name. */
export function niceName(desc: string) {
  return desc
    .replace(/\s*\((kota|kab)\)\s*id$/i, '')
    .replace(/\s+id$/i, '')
    .replace(/\s+(cirebon|jakarta selat|jakarta|bekasi)\b.*$/i, '')
    .replace(/\*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .slice(0, 120);
}
