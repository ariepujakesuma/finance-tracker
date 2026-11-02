// Matches parsed statement lines against the bills already in the tracker for one month.
import type { Statement, Txn } from './statement-parse';
import { niceName } from './statement-parse';

export type EntryLike = {
  id: string; name: string; flow: string; bank: string; mode: string;
  amount: number; start: string; months: number | null;
};

export type Proposal = {
  key: string;
  txn: Txn;
  include: boolean;
  /** match = already in the tracker; override = in the tracker but this month's amount differs; new = create */
  action: 'match' | 'override' | 'new';
  entryId?: string;
  entryName?: string;
  entryAmount?: number;
  name: string;
  mode: 'cicilan' | 'sekali';
  months: number | null;
};

const STOP = new Set(['mandiri', 'jenius', 'cicilan', 'bulan', 'tagihan', 'cirebon', 'jakarta', 'store', 'arie']);
const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));

const near = (a: number, b: number) => Math.abs(a - b) <= 5; // statements round installments by a rupiah or two

export function propose(st: Statement, entries: EntryLike[], bank: string, activeIn: (e: EntryLike) => boolean): Proposal[] {
  const pool = entries.filter((e) => e.flow === 'out' && e.bank.toLowerCase() === bank.toLowerCase() && activeIn(e));
  const used = new Set<string>();
  const out: (Proposal | null)[] = st.items.map(() => null);

  const nameHit = (e: EntryLike, t: Txn) => words(e.name).some((w) => t.desc.toLowerCase().includes(w));
  const pick = (test: (e: EntryLike, t: Txn) => boolean) => {
    st.items.forEach((t, i) => {
      if (out[i]) return;
      const e = pool.find((x) => !used.has(x.id) && test(x, t));
      if (!e) return;
      used.add(e.id);
      const same = near(e.amount, t.amount);
      out[i] = {
        key: `t${i}`, txn: t, include: !same, action: same ? 'match' : 'override',
        entryId: e.id, entryName: e.name, entryAmount: e.amount,
        name: e.name, mode: e.mode === 'cicilan' ? 'cicilan' : 'sekali', months: e.months,
      };
    });
  };
  pick((e, t) => nameHit(e, t) && near(e.amount, t.amount)); // 1. same name and amount
  pick((e, t) => near(e.amount, t.amount) && (!!t.inst === (e.mode === 'cicilan'))); // 2. same amount and kind
  pick((e, t) => nameHit(e, t)); // 3. same name, amount changed this month
  pick((e, t) => near(e.amount, t.amount)); // 4. same amount only

  return st.items.map((t, i) => out[i] ?? {
    key: `t${i}`, txn: t, include: true, action: 'new',
    name: niceName(t.desc),
    mode: t.inst ? 'cicilan' : 'sekali',
    months: t.inst ? Math.max(1, t.inst.total - t.inst.no + 1) : null,
  });
}
