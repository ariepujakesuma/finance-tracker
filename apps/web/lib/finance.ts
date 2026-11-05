export type Flow = 'out' | 'in' | 'save';
export type Mode = 'cicilan' | 'rutin' | 'sekali';

export type Entry = {
  id: string; name: string; flow: Flow; bank: string; mode: Mode;
  amount: number; start: string; months: number | null; note: string;
  /** allocations only: the asset that grows when this is ticked */
  holdingId?: string | null;
};
export type MonthState = { paid: Record<string, boolean>; amt: Record<string, number> };
export type Holding = {
  id: string; name: string; category: string; owner: string; purpose: string; place: string; unit: 'rp' | 'gram';
  value: number | null; grams: number | null; price: number | null; monthly: number | null; since: string | null;
  estimate: boolean; note: string; priceDate: string | null; priceSource: string | null; updated: string | null;
};
/** Savings target. Progress comes from linked assets; with none linked, from `saved` (typed in by hand). */
export type Goal = {
  id: string; name: string; target: number; saved: number; deadline: string | null; holdingIds: string[]; note: string;
};
export type Data = {
  entries: Entry[]; months: Record<string, MonthState>; holdings: Holding[]; settings: { threshold: number };
  goals: Goal[]; banks: string[];
};

/** Built-in choices for "bank / tempat menabung". Banks the user adds are stored on the server. */
export const DEFAULT_BANKS = [
  'BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'Jenius', 'SeaBank', 'Bank Jago', 'blu by BCA', 'CIMB Niaga',
  'Permata', 'Danamon', 'OCBC', 'Ajaib', 'Bibit', 'Bareksa', 'Pegadaian', 'Antam / fisik', 'Cash',
];

/** Defaults + added banks + every bank/place already used, without case-insensitive duplicates. */
export function bankOptions(d: Data) {
  const seen = new Map<string, string>();
  for (const b of [...DEFAULT_BANKS, ...d.banks, ...d.holdings.map((h) => h.place), ...d.entries.map((e) => e.bank)]) {
    const t = b?.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'id'));
}

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const idx = (k: string) => { const [y, m] = k.split('-').map(Number); return y * 12 + m - 1; };
export const key = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
export const short = (k: string) => { const i = idx(k); return MON[i % 12] + ' ' + String(Math.floor(i / 12)).slice(2); };
export const longL = (k: string) => { const i = idx(k); return MONL[i % 12] + ' ' + Math.floor(i / 12); };
export const rp = (n: number) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
export const num = (s: string | number) => Number(String(s).replace(/[^\d]/g, '')) || 0;
export const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number);
  return `${dd} ${MON[m - 1]} ${y}`;
};

/** Month key in Asia/Jakarta, regardless of the viewer's device timezone. */
export function jakartaToday() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { iso: s, month: s.slice(0, 7) };
}

export function active(e: Entry, k: string) {
  const i = idx(k) - idx(e.start);
  if (i < 0) return false;
  if (e.mode === 'sekali') return i === 0;
  if (e.months) return i < e.months;
  return true;
}

export function amountOf(d: Data, e: Entry, k: string) {
  const o = d.months[k]?.amt?.[e.id];
  return typeof o === 'number' ? o : e.amount;
}

export function monthCalc(d: Data, k: string) {
  let inc = 0, out = 0, save = 0;
  for (const e of d.entries) {
    if (!active(e, k)) continue;
    const a = amountOf(d, e, k);
    if (e.flow === 'in') inc += a; else if (e.flow === 'save') save += a; else out += a;
  }
  return { inc, out, save, diff: inc - out, net: inc - out - save };
}

/**
 * Months of automatic "setoran rutin" counted into an asset's value.
 * Once an allocation is linked to the asset, ticking it adds the deposit for real,
 * so the automatic estimate stops the month before that allocation starts.
 */
export function contribMonths(h: Holding, thisMonth: string, entries: Entry[] = []) {
  if (!h.monthly || !h.since) return 0;
  const linked = entries.filter((e) => e.flow === 'save' && e.holdingId === h.id).map((e) => idx(e.start));
  const last = linked.length ? Math.min(idx(thisMonth), Math.min(...linked) - 1) : idx(thisMonth);
  return Math.max(0, last - idx(h.since) + 1);
}

export const holdingValue = (h: Holding, thisMonth: string, entries: Entry[] = []) =>
  h.unit === 'gram'
    ? Math.round((h.grams || 0) * (h.price || 0))
    : (h.value || 0) + (h.monthly || 0) * contribMonths(h, thisMonth, entries);

/** Unpaid installment total from month k onward. */
export function remainingDebt(d: Data, k: string) {
  const paid = d.months[k]?.paid || {};
  let t = 0;
  for (const e of d.entries) {
    if (e.flow !== 'out' || e.mode !== 'cicilan' || !e.months) continue;
    const done = Math.max(0, idx(k) - idx(e.start));
    const left = e.months - done;
    if (left <= 0) continue;
    t += left * e.amount;
    if (idx(k) >= idx(e.start) && paid[e.id]) t -= amountOf(d, e, k);
  }
  return t;
}

export const daysSince = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00+07:00').getTime()) / 864e5) : null;

/** Where a goal stands this month: collected amount, monthly inflow, and when it finishes at that pace. */
export function goalStatus(g: Goal, d: Data, thisMonth: string) {
  const linked = d.holdings.filter((h) => g.holdingIds.includes(h.id));
  const saved = linked.length ? linked.reduce((s, h) => s + holdingValue(h, thisMonth, d.entries), 0) : g.saved;
  // Monthly inflow: allocations into the linked assets, plus automatic "setoran rutin" still being estimated.
  const allocs = d.entries.filter((e) => e.flow === 'save' && e.holdingId && g.holdingIds.includes(e.holdingId) && active(e, thisMonth));
  const auto = linked
    .filter((h) => h.unit === 'rp' && h.monthly && !d.entries.some((e) => e.flow === 'save' && e.holdingId === h.id))
    .reduce((s, h) => s + (h.monthly || 0), 0);
  const monthly = allocs.reduce((s, e) => s + amountOf(d, e, thisMonth), 0) + auto;
  const gap = Math.max(0, g.target - saved);
  const pct = g.target > 0 ? Math.min(100, (saved / g.target) * 100) : 0;
  const monthsLeft = g.deadline ? idx(g.deadline) - idx(thisMonth) + 1 : null; // includes this month
  const needPerMonth = gap && monthsLeft && monthsLeft > 0 ? Math.ceil(gap / monthsLeft) : null;
  const eta = gap === 0 ? thisMonth : monthly > 0 ? key(idx(thisMonth) + Math.ceil(gap / monthly) - 1) : null;
  const late = !!(gap && g.deadline && (eta === null ? true : idx(eta) > idx(g.deadline)));
  return { saved, monthly, gap, pct, monthsLeft, needPerMonth, eta, late, linked };
}
