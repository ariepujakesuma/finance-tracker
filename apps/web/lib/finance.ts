export type Flow = 'out' | 'in' | 'save';
export type Mode = 'cicilan' | 'rutin' | 'sekali';

export type Entry = {
  id: string; name: string; flow: Flow; bank: string; mode: Mode;
  amount: number; start: string; months: number | null; note: string;
};
export type MonthState = { paid: Record<string, boolean>; amt: Record<string, number> };
export type Holding = {
  id: string; name: string; category: string; owner: string; purpose: string; unit: 'rp' | 'gram';
  value: number | null; grams: number | null; price: number | null; monthly: number | null; since: string | null;
  estimate: boolean; note: string; priceDate: string | null; priceSource: string | null; updated: string | null;
};
export type Data = {
  entries: Entry[]; months: Record<string, MonthState>; holdings: Holding[]; settings: { threshold: number };
};

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

export const contribMonths = (h: Holding, thisMonth: string) =>
  h.monthly && h.since ? Math.max(0, idx(thisMonth) - idx(h.since) + 1) : 0;

export const holdingValue = (h: Holding, thisMonth: string) =>
  h.unit === 'gram'
    ? Math.round((h.grams || 0) * (h.price || 0))
    : (h.value || 0) + (h.monthly || 0) * contribMonths(h, thisMonth);

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
