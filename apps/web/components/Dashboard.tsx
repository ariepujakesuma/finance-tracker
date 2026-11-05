'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import BankPicker from './BankPicker';
import StatementUpload from './StatementUpload';
import {
  active, amountOf, bankOptions, contribMonths, Data, daysSince, Entry, fmtDate, Goal, goalStatus, Holding, holdingValue, idx,
  jakartaToday, key, longL, monthCalc, MonthState, num, remainingDebt, rp, short,
} from '@/lib/finance';

const EMPTY: Data = { entries: [], months: {}, holdings: [], settings: { threshold: 6000000 }, goals: [], banks: [] };

export default function Dashboard() {
  const router = useRouter();
  const today = useMemo(jakartaToday, []);
  const [data, setData] = useState<Data>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState(today.month);
  const [status, setStatus] = useState('Memuat data…');
  const [editingAmt, setEditingAmt] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<Entry | 'new' | null>(null);
  const [assetForm, setAssetForm] = useState<Holding | 'new' | null>(null);
  const [goalForm, setGoalForm] = useState<Goal | 'new' | null>(null);
  const [menu, setMenu] = useState(false);
  const [upload, setUpload] = useState(false);
  const [openBanks, setOpenBanks] = useState<Record<string, boolean>>({});

  const handleErr = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return router.replace('/login');
      setStatus((err as Error).message || 'Gagal menyimpan. Coba lagi.');
    },
    [router],
  );

  const load = useCallback(async (msg?: string) => {
    try {
      const d = await api<Data>('/finance');
      setData(d);
      setLoaded(true);
      setStatus(msg || 'Tersinkron');
    } catch (err) {
      handleErr(err);
    }
  }, [handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!menu) return;
    const close = (ev: Event) => {
      if (ev instanceof KeyboardEvent ? ev.key === 'Escape' : !(ev.target as Element).closest('.actions')) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  /** Optimistic change, then save; reload from server if the save fails. */
  async function mutate(next: (d: Data) => Data, save: () => Promise<unknown>, okMsg = 'Tersimpan') {
    setData((d) => next(d));
    try {
      const msg = await save();
      setStatus(typeof msg === 'string' ? msg : okMsg);
    } catch (err) {
      handleErr(err);
      load();
    }
  }

  function saveMonth(k: string, change: (m: MonthState) => void, msg?: string) {
    const cur = data.months[k] || { paid: {}, amt: {} };
    const m: MonthState = { paid: { ...cur.paid }, amt: { ...cur.amt } };
    change(m);
    mutate(
      (d) => ({ ...d, months: { ...d.months, [k]: m } }),
      async () => {
        // Ticking a linked allocation changes an asset on the server; take the new values back.
        const res = await api<{ holdings?: Holding[] }>(`/months/${k}`, { method: 'PUT', json: m });
        if (res?.holdings?.length) {
          const byId = new Map(res.holdings.map((h) => [h.id, h]));
          setData((d) => ({ ...d, holdings: d.holdings.map((h) => byId.get(h.id) ?? h) }));
          return `${res.holdings.map((h) => h.name).join(', ')} diperbarui`;
        }
      },
      msg,
    );
  }

  /** Saves a bank typed into a picker, so it is offered next time even before anything uses it. */
  function addBank(name: string) {
    const n = name.trim();
    if (!n || data.banks.some((b) => b.toLowerCase() === n.toLowerCase())) return;
    mutate((d) => ({ ...d, banks: [...d.banks, n] }), () => api('/banks', { method: 'POST', json: { name: n } }), `${n} ditambahkan`);
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  }

  const c = monthCalc(data, sel);
  const bills = data.entries.filter((e) => e.flow === 'out' && active(e, sel));
  const paid = data.months[sel]?.paid || {};
  const nPaid = bills.filter((e) => paid[e.id]).length;
  const left = bills.filter((e) => !paid[e.id]).reduce((s, e) => s + amountOf(data, e, sel), 0);
  const byBank = bills.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.bank || 'Lainnya'] ??= []).push(e);
    return acc;
  }, {});
  const incomes = data.entries.filter((e) => e.flow === 'in' && active(e, sel));
  const saves = data.entries.filter((e) => e.flow === 'save' && active(e, sel));
  const ending = bills.filter((e) => e.mode === 'cicilan' && e.months && idx(sel) - idx(e.start) === e.months - 1);
  const holdings = [...data.holdings].sort(
    (a, b) => (a.category || '').localeCompare(b.category || '') || holdingValue(b, today.month, data.entries) - holdingValue(a, today.month, data.entries),
  );
  const totalAssets = holdings.reduce((s, h) => s + holdingValue(h, today.month, data.entries), 0);
  const debt = remainingDebt(data, sel);
  const banks = bankOptions(data);

  function entryRow(e: Entry, check: boolean) {
    const i = idx(sel) - idx(e.start);
    const isPaid = check && !!paid[e.id];
    const ov = typeof data.months[sel]?.amt?.[e.id] === 'number';
    const last = e.mode === 'cicilan' && e.months && i === e.months - 1;
    return (
      <div key={e.id} className={`row${check ? '' : ' nocheck'}${isPaid ? ' paid' : ''}`}>
        {check && (
          <input
            type="checkbox"
            id={`pd-${e.id}`}
            aria-label={`Tandai ${e.name} sudah dibayar`}
            checked={isPaid}
            onChange={(ev) => {
              const on = ev.target.checked;
              saveMonth(sel, (m) => { if (on) m.paid[e.id] = true; else delete m.paid[e.id]; });
            }}
          />
        )}
        <div className="name">
          <b>{e.name}</b>
          <div className="meta">
            {e.mode === 'cicilan' && e.months ? (
              <>
                <span className={`chip${last ? ' last' : ''}`}>{last ? 'terakhir' : `${i + 1}/${e.months}`}</span>
                <span>s.d. {short(key(idx(e.start) + e.months - 1))}</span>
              </>
            ) : (
              <span className="chip">{e.mode}</span>
            )}
            {ov && <span className="chip ov">diubah</span>}
            {e.flow === 'save' && e.holdingId && (
              <span className="chip last">→ {data.holdings.find((h) => h.id === e.holdingId)?.name ?? 'aset'}</span>
            )}
            {e.note && <span>{e.note}</span>}
            {e.flow === 'in' && e.bank && <span>{e.bank}</span>}
          </div>
        </div>
        <div className="right">
          {editingAmt === e.id ? (
            <AmountInput
              id={`ov-${e.id}`}
              initial={amountOf(data, e, sel)}
              onDone={(v) => {
                setEditingAmt(null);
                if (v === null) return;
                saveMonth(sel, (m) => { if (v === e.amount) delete m.amt[e.id]; else m.amt[e.id] = v; });
              }}
            />
          ) : (
            <button className="amt num" title="Ubah nominal khusus bulan ini" onClick={() => setEditingAmt(e.id)}>
              {rp(amountOf(data, e, sel))}
            </button>
          )}
          <button className="edit" aria-label={`Edit ${e.name}`} onClick={() => setEntryForm(e)}>Edit</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="appbar glass">
        <div className="appbar-top">
          <div className="brand">
            <span className="brand-dot" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <h1>Finance Tracker</h1>
              <div className="status" aria-live="polite">{status}</div>
            </div>
          </div>
          <div className="actions">
            <button className="primary add-desktop" onClick={() => setEntryForm('new')}>+ Tambah</button>
            <button className="round" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>⋯</button>
            {menu && (
              <div className="menu glass" role="menu" onClick={() => setMenu(false)}>
                <button role="menuitem" onClick={() => setUpload(true)}>Upload tagihan PDF</button>
                <button role="menuitem" onClick={() => setAssetForm('new')}>Tambah aset</button>
                <button role="menuitem" onClick={() => setGoalForm('new')}>Tambah target</button>
                <Link role="menuitem" href="/pin">Ganti PIN</Link>
                <button role="menuitem" onClick={logout}>Keluar</button>
              </div>
            )}
          </div>
        </div>
        <nav className="monthbar" aria-label="Pilih bulan">
          <button className="round" aria-label="Bulan sebelumnya" onClick={() => setSel(key(idx(sel) - 1))}>‹</button>
          <div className="monthlabel">{longL(sel)}</div>
          {sel !== today.month && <button className="pill on" onClick={() => setSel(today.month)}>Kini</button>}
          <button className="round" aria-label="Bulan berikutnya" onClick={() => setSel(key(idx(sel) + 1))}>›</button>
        </nav>
      </header>

      <section className="glass panel hero">
        <div className="hero-main">
          <span className="label">Sisa bersih {longL(sel)}</span>
          <span className={`big num${c.net < 0 ? ' neg' : ''}`}>{rp(c.net)}</span>
          <span className="sub">setelah tagihan dan alokasi</span>
        </div>
        <div className="stats">
          <Stat label="Pemasukan" value={c.inc} />
          <Stat label="Tagihan" value={c.out} />
          <Stat label="Selisih" value={c.diff} />
          <Stat label="Alokasi" value={c.save} />
        </div>
        <div className="progress">
          <div className="progress-row">
            <span>{nPaid} dari {bills.length} tagihan dibayar</span>
            <span className="num">{left ? 'sisa ' + rp(left) : 'lunas semua'}</span>
          </div>
          <div className="track"><i style={{ width: bills.length ? `${(nPaid / bills.length) * 100}%` : 0 }} /></div>
        </div>
      </section>

      <section className="glass panel">
        <div className="panel-head">
          <h2>Aset saat ini</h2>
          <button className="pill" onClick={() => setAssetForm('new')}>+ Aset</button>
        </div>
        <div className="stats three">
          <Stat label="Total aset" value={totalAssets} />
          <Stat label="Sisa cicilan" value={debt} title={`Cicilan yang belum dibayar mulai ${longL(sel)}`} />
          <Stat label="Aset − cicilan" value={totalAssets - debt} />
        </div>
        <div style={{ marginTop: 10 }}>
          {holdings.length ? (
            holdings.map((h) => {
              const ds = daysSince(h.priceDate);
              return (
                <div key={h.id} className="row nocheck">
                  <div className="name">
                    <b>{h.name}</b>
                    <div className="meta">
                      <span className="chip">{h.category || 'Aset'}</span>
                      {h.estimate && <span className="chip ov">estimasi</span>}
                      {h.place && <span className="chip">{h.place}</span>}
                      {h.owner && <span>{h.owner}</span>}
                      {h.purpose && <span>· {h.purpose}</span>}
                      {h.unit === 'gram' && (
                        <>
                          <span className="num">· {Number(h.grams).toLocaleString('id-ID')} gr × {rp(h.price || 0)}</span>
                          {h.priceDate && <span>· harga per {fmtDate(h.priceDate)}{h.priceSource ? ` (${h.priceSource})` : ''}</span>}
                          {ds !== null && ds > 2 && <span className="chip ov">harga {ds} hari lalu</span>}
                        </>
                      )}
                      {!!h.monthly && h.since && (
                        <span className="num">
                          · awal {rp(h.value || 0)} + {rp(h.monthly)}/bln sejak {short(h.since)} ({contribMonths(h, today.month, data.entries)}×)
                        </span>
                      )}
                      {h.note && <span>· {h.note}</span>}
                      {h.updated && h.unit !== 'gram' && <span>· diperbarui {fmtDate(h.updated)}</span>}
                    </div>
                  </div>
                  <div className="right">
                    <span className="num" style={{ fontWeight: 500 }}>{rp(holdingValue(h, today.month, data.entries))}</span>
                    <button className="edit" aria-label={`Edit ${h.name}`} onClick={() => setAssetForm(h)}>Edit</button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty">{loaded ? 'Belum ada aset. Pakai + Aset untuk mencatat tabungan haji, emas, atau reksadana.' : 'Memuat aset…'}</div>
          )}
        </div>
      </section>

      <section className="glass panel">
        <div className="panel-head">
          <h2>Target tabungan</h2>
          <button className="pill" onClick={() => setGoalForm('new')}>+ Target</button>
        </div>
        {data.goals.length ? (
          data.goals.map((g) => {
            const st = goalStatus(g, data, today.month);
            const done = st.gap === 0;
            return (
              <div key={g.id} className="goal">
                <div className="goal-head">
                  <div className="name">
                    <b>{g.name}</b>
                    <div className="meta">
                      {done ? (
                        <span className="chip last">tercapai</span>
                      ) : st.monthsLeft !== null && st.monthsLeft <= 0 ? (
                        <span className="chip ov">lewat tenggat</span>
                      ) : st.late ? (
                        <span className="chip ov">belum terkejar</span>
                      ) : g.deadline ? (
                        <span className="chip last">sesuai jadwal</span>
                      ) : null}
                      {g.deadline && <span>target {short(g.deadline)}</span>}
                      {st.linked.length > 0 && <span>· dari {st.linked.map((h) => h.name).join(', ')}</span>}
                      {g.note && <span>· {g.note}</span>}
                    </div>
                  </div>
                  <div className="right">
                    <span className="num" style={{ fontWeight: 500 }}>{Math.floor(st.pct)}%</span>
                    <button className="edit" aria-label={`Edit ${g.name}`} onClick={() => setGoalForm(g)}>Edit</button>
                  </div>
                </div>
                <div className="track" role="progressbar" aria-label={`Progres ${g.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(st.pct)}>
                  <i style={{ width: `${st.pct}%` }} />
                </div>
                <div className="goal-foot">
                  <span className="num">{rp(st.saved)} dari {rp(g.target)}</span>
                  {!done && <span className="num">kurang {rp(st.gap)}</span>}
                </div>
                {!done && (
                  <div className="meta">
                    {st.needPerMonth !== null && <span className="num">Perlu {rp(st.needPerMonth)}/bln selama {st.monthsLeft} bln</span>}
                    {st.monthly > 0 ? (
                      <span className="num">· setoran sekarang {rp(st.monthly)}/bln → tercapai ±{st.eta ? short(st.eta) : '–'}</span>
                    ) : (
                      st.linked.length > 0 && <span>· belum ada alokasi rutin ke aset ini</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="empty">{loaded ? 'Belum ada target. Pakai + Target untuk dana darurat, DP rumah, atau pendidikan anak.' : 'Memuat target…'}</div>
        )}
      </section>

      <section className="glass panel">
        <div className="panel-head">
          <h2>Proyeksi tagihan 14 bulan</h2>
          <ThresholdInput
            value={data.settings.threshold}
            onSave={(v) =>
              mutate((d) => ({ ...d, settings: { threshold: v } }), () => api('/settings', { method: 'PUT', json: { threshold: v } }))
            }
          />
        </div>
        <Chart data={data} startMonth={today.month} sel={sel} onPick={setSel} />
        <div className="hint">Batang = total tagihan · garis pendek = pemasukan · garis putus = batas cicilan baru. Klik batang untuk membuka bulannya.</div>
      </section>

      <div className="cols">
        <section className="glass panel">
          <div className="panel-head">
            <h2>Tagihan bulan ini</h2>
            <button className="pill on" onClick={() => setUpload(true)}>Upload PDF</button>
          </div>
          <p className="hint" style={{ margin: '-6px 0 10px' }}>Ketuk nominal untuk ubah bulan ini saja.</p>
          {!loaded ? (
            <div className="empty">Memuat tagihan…</div>
          ) : Object.keys(byBank).length ? (
            Object.keys(byBank).sort().map((b) => {
              const list = byBank[b].sort((x, y) => amountOf(data, y, sel) - amountOf(data, x, sel));
              const sub = list.reduce((s, e) => s + amountOf(data, e, sel), 0);
              const allPaid = list.every((e) => paid[e.id]);
              const showRows = !allPaid || openBanks[`${sel}:${b}`];
              return (
                <div className="bank" key={b}>
                  <div className="bankhead">
                    <span className="bankname">
                      {b} {allPaid && <span className="chip last">lunas</span>}
                      {allPaid && (
                        <button className="edit" aria-expanded={!!showRows} onClick={() => setOpenBanks((o) => ({ ...o, [`${sel}:${b}`]: !showRows }))}>
                          {showRows ? 'Sembunyikan' : `Lihat ${list.length}`}
                        </button>
                      )}
                    </span>
                    <span className="bankr">
                      <span className="num">{rp(sub)}</span>
                      <button
                        className={`banklunas${allPaid ? ' undo' : ''}`}
                        onClick={() =>
                          saveMonth(
                            sel,
                            (m) => list.forEach((e) => { if (allPaid) delete m.paid[e.id]; else m.paid[e.id] = true; }),
                            `${b} ${allPaid ? 'dibatalkan' : 'ditandai lunas'} untuk ${longL(sel)}`,
                          )
                        }
                      >
                        {allPaid ? 'Batalkan' : 'Tandai lunas'}
                      </button>
                    </span>
                  </div>
                  {showRows && list.map((e) => entryRow(e, true))}
                </div>
              );
            })
          ) : (
            <div className="empty">Belum ada tagihan di {longL(sel)}. Pakai + Tambah untuk mencatat cicilan, langganan, atau tagihan sekali bayar.</div>
          )}
        </section>
        <div className="stack">
          <section className="glass panel">
            <div className="panel-head"><h2>Pemasukan</h2></div>
            {incomes.length ? incomes.map((e) => entryRow(e, false)) : <div className="empty">Belum ada pemasukan di bulan ini.</div>}
          </section>
          <section className="glass panel">
            <div className="panel-head"><h2>Alokasi / tabungan</h2></div>
            {saves.length ? saves.map((e) => entryRow(e, true)) : <div className="empty">Tidak ada alokasi di bulan ini.</div>}
          </section>
          <section className="glass panel ending">
            <div className="panel-head"><h2>Cicilan yang lunas bulan ini</h2></div>
            <ul>
              {ending.length ? (
                ending.map((e) => (
                  <li key={e.id}><span>{e.name} <span className="hint">{e.bank}</span></span><span className="num">{rp(e.amount)}/bln</span></li>
                ))
              ) : (
                <li><span className="hint">Tidak ada cicilan yang selesai bulan ini.</span></li>
              )}
            </ul>
          </section>
        </div>
      </div>

      <button className="fab" aria-label="Tambah entri" onClick={() => setEntryForm('new')}>+</button>

      {upload && (
        <StatementUpload
          data={data}
          defaultMonth={sel}
          onClose={() => setUpload(false)}
          onSaved={(msg) => load(msg)}
        />
      )}

      {entryForm && (
        <EntryDialog
          entry={entryForm === 'new' ? null : entryForm}
          holdings={data.holdings}
          banks={banks}
          onAddBank={addBank}
          defaultStart={sel}
          onClose={() => setEntryForm(null)}
          onSave={async (body, id) => {
            setEntryForm(null);
            try {
              if (id) {
                const saved = await api<Entry>(`/entries/${id}`, { method: 'PUT', json: body });
                setData((d) => ({ ...d, entries: d.entries.map((x) => (x.id === id ? saved : x)) }));
              } else {
                const saved = await api<Entry>('/entries', { method: 'POST', json: body });
                setData((d) => ({ ...d, entries: [...d.entries, saved] }));
              }
              setStatus('Tersimpan');
            } catch (err) {
              handleErr(err);
            }
          }}
          onDelete={(id) => {
            setEntryForm(null);
            mutate((d) => ({ ...d, entries: d.entries.filter((x) => x.id !== id) }), () => api(`/entries/${id}`, { method: 'DELETE' }), 'Dihapus');
          }}
        />
      )}

      {assetForm && (
        <AssetDialog
          holding={assetForm === 'new' ? null : assetForm}
          today={today.iso}
          banks={banks}
          onAddBank={addBank}
          onClose={() => setAssetForm(null)}
          onSave={async (body, id) => {
            setAssetForm(null);
            try {
              if (id) {
                const saved = await api<Holding>(`/holdings/${id}`, { method: 'PUT', json: body });
                setData((d) => ({ ...d, holdings: d.holdings.map((x) => (x.id === id ? saved : x)) }));
              } else {
                const saved = await api<Holding>('/holdings', { method: 'POST', json: body });
                setData((d) => ({ ...d, holdings: [...d.holdings, saved] }));
              }
              setStatus('Tersimpan');
            } catch (err) {
              handleErr(err);
            }
          }}
          onDelete={(id) => {
            setAssetForm(null);
            mutate((d) => ({ ...d, holdings: d.holdings.filter((x) => x.id !== id) }), () => api(`/holdings/${id}`, { method: 'DELETE' }), 'Dihapus');
          }}
        />
      )}
      {goalForm && (
        <GoalDialog
          goal={goalForm === 'new' ? null : goalForm}
          holdings={data.holdings}
          valueOf={(h) => holdingValue(h, today.month, data.entries)}
          onClose={() => setGoalForm(null)}
          onSave={async (body, id) => {
            setGoalForm(null);
            try {
              if (id) {
                const saved = await api<Goal>(`/goals/${id}`, { method: 'PUT', json: body });
                setData((d) => ({ ...d, goals: d.goals.map((x) => (x.id === id ? saved : x)) }));
              } else {
                const saved = await api<Goal>('/goals', { method: 'POST', json: body });
                setData((d) => ({ ...d, goals: [...d.goals, saved] }));
              }
              setStatus('Tersimpan');
            } catch (err) {
              handleErr(err);
            }
          }}
          onDelete={(id) => {
            setGoalForm(null);
            mutate((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== id) }), () => api(`/goals/${id}`, { method: 'DELETE' }), 'Dihapus');
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <div className="stat" title={title}>
      <span className="label">{label}</span>
      <span className={`val num${value < 0 ? ' neg' : ''}`}>{rp(value)}</span>
    </div>
  );
}

function AmountInput({ id, initial, onDone }: { id: string; initial: number; onDone: (v: number | null) => void }) {
  const [v, setV] = useState(String(initial));
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(commit && v.trim() ? num(v) : commit ? initial : null);
  };
  return (
    <input
      id={id}
      className="amtin"
      inputMode="numeric"
      autoFocus
      value={v}
      aria-label="Nominal bulan ini"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }}
      onBlur={() => finish(true)}
    />
  );
}

function ThresholdInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value.toLocaleString('id-ID'));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setV(value.toLocaleString('id-ID')); }, [value, focus]);
  return (
    <label className="thr" htmlFor="thr">
      Batas cicilan baru
      <input
        id="thr"
        className="num"
        inputMode="numeric"
        value={v}
        onFocus={() => setFocus(true)}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { setFocus(false); const n = num(v); if (n !== value) onSave(n); }}
      />
    </label>
  );
}

function Chart({ data, startMonth, sel, onPick }: { data: Data; startMonth: string; sel: string; onPick: (k: string) => void }) {
  const W = 720, H = 230, L = 56, R = 8, T = 12, B = 28, N = 14;
  const cw = (W - L - R) / N;
  const rows = Array.from({ length: N }, (_, j) => { const k = key(idx(startMonth) + j); return { k, ...monthCalc(data, k) }; });
  const thr = data.settings.threshold || 0;
  const maxV = Math.max(1, thr, ...rows.map((d) => Math.max(d.out, d.inc)));
  const step = [1e6, 2e6, 5e6, 1e7, 2e7, 5e7].find((s) => maxV / s <= 5) || 1e8;
  const top = Math.ceil(maxV / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Grafik tagihan per bulan">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end">{v / 1e6}jt</text>
          </g>
        ))}
        {rows.map((d, j) => {
          const x = L + j * cw + cw * 0.18, w = cw * 0.64, isSel = d.k === sel;
          return (
            <g key={d.k} className="bar" onClick={() => onPick(d.k)}>
              <rect x={L + j * cw} y={T} width={cw} height={H - T - B} fill="transparent" />
              <rect x={x} y={y(d.out)} width={w} height={Math.max(0, y(0) - y(d.out))} rx={3} fill={isSel ? 'var(--bar-sel)' : 'var(--bar)'}>
                <title>{`${longL(d.k)}: tagihan ${rp(d.out)}, pemasukan ${rp(d.inc)}`}</title>
              </rect>
              {d.inc > 0 && <line x1={x - 2} x2={x + w + 2} y1={y(d.inc)} y2={y(d.inc)} stroke="var(--ink)" strokeWidth={2} />}
              <text x={L + j * cw + cw / 2} y={H - 10} textAnchor="middle" style={isSel ? { fill: 'var(--ink)', fontWeight: 600 } : undefined}>
                {short(d.k)}
              </text>
            </g>
          );
        })}
        {thr > 0 && <line x1={L} x2={W - R} y1={y(thr)} y2={y(thr)} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="5 4" />}
      </svg>
    </div>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const close = () => onClose();
    d?.addEventListener('close', close);
    return () => d?.removeEventListener('close', close);
  }, [onClose]);
  return ref;
}

type EntryBody = Omit<Entry, 'id'>;

function EntryDialog({
  entry, holdings, banks, onAddBank, defaultStart, onClose, onSave, onDelete,
}: {
  entry: Entry | null; holdings: Holding[]; banks: string[]; onAddBank: (n: string) => void; defaultStart: string; onClose: () => void;
  onSave: (b: EntryBody, id?: string) => void; onDelete: (id: string) => void;
}) {
  const ref = useDialog(onClose);
  const [f, setF] = useState({
    name: entry?.name || '', flow: entry?.flow || 'out', bank: entry?.bank || '', mode: entry?.mode || 'cicilan',
    amount: entry ? String(entry.amount) : '', start: entry?.start || defaultStart,
    months: entry?.months ? String(entry.months) : '', note: entry?.note || '', holdingId: entry?.holdingId || '',
  });
  const [arm, setArm] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const linkable = holdings.filter((h) => h.unit === 'rp');

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(
      {
        name: f.name.trim(), flow: f.flow as Entry['flow'], bank: f.bank.trim(), mode: f.mode as Entry['mode'],
        amount: num(f.amount), start: f.start, months: f.mode === 'sekali' ? null : Number(f.months) || null, note: f.note.trim(),
        holdingId: f.flow === 'save' ? f.holdingId || null : null,
      },
      entry?.id,
    );
  }

  return (
    <dialog ref={ref}>
      <form className="f" onSubmit={submit}>
        <div className="grab" aria-hidden="true" />
        <h2>{entry ? 'Edit entri' : 'Tambah entri'}</h2>
        <label htmlFor="fName">Nama<input id="fName" required value={f.name} onChange={set('name')} placeholder="mis. Kulkas BCA" /></label>
        <div className="two">
          <label htmlFor="fFlow">Kategori
            <select id="fFlow" value={f.flow} onChange={set('flow')}>
              <option value="out">Tagihan</option><option value="in">Pemasukan</option><option value="save">Alokasi / tabungan</option>
            </select>
          </label>
          <label htmlFor="fBank">Bank / sumber
            <BankPicker id="fBank" value={f.bank} options={banks} onChange={(v) => setF((x) => ({ ...x, bank: v }))} onAdd={onAddBank} />
          </label>
        </div>
        <div className="two">
          <label htmlFor="fMode">Jenis
            <select id="fMode" value={f.mode} onChange={set('mode')}>
              <option value="cicilan">Cicilan (n bulan)</option><option value="rutin">Rutin tiap bulan</option><option value="sekali">Sekali</option>
            </select>
          </label>
          <label htmlFor="fAmt">Nominal (Rp)<input id="fAmt" inputMode="numeric" required value={f.amount} onChange={set('amount')} placeholder="750000" /></label>
        </div>
        <div className="two">
          <label htmlFor="fStart">Mulai bulan<input id="fStart" type="month" required value={f.start} onChange={set('start')} /></label>
          {f.mode !== 'sekali' && (
            <label htmlFor="fMonths">{f.mode === 'rutin' ? 'Berapa bulan (kosong = terus)' : 'Sisa bulan'}
              <input id="fMonths" type="number" min={1} required={f.mode === 'cicilan'} value={f.months} onChange={set('months')} />
            </label>
          )}
        </div>
        {f.flow === 'save' && (
          <label htmlFor="fHolding">Masuk ke aset
            <select id="fHolding" value={f.holdingId} onChange={set('holdingId')}>
              <option value="">– tidak menambah aset –</option>
              {linkable.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <span className="hint">Saat dicentang, nominalnya ditambahkan ke aset ini. Lepas centang untuk membatalkan.</span>
          </label>
        )}
        <label htmlFor="fNote">Catatan<input id="fNote" value={f.note} onChange={set('note')} placeholder="opsional" /></label>
        {f.mode === 'cicilan' && <div className="hint">Mulai bulan = cicilan pertama yang masih harus dibayar, lalu isi jumlah bulan yang tersisa.</div>}
        <div className="actions">
          {entry && (
            <button type="button" className="ghost danger" onClick={() => (arm ? onDelete(entry.id) : setArm(true))}>
              {arm ? 'Yakin hapus?' : 'Hapus'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="primary">Simpan</button>
        </div>
      </form>
    </dialog>
  );
}

type HoldingBody = Omit<Holding, 'id'>;

function AssetDialog({
  holding, today, banks, onAddBank, onClose, onSave, onDelete,
}: {
  holding: Holding | null; today: string; banks: string[]; onAddBank: (n: string) => void; onClose: () => void;
  onSave: (b: HoldingBody, id?: string) => void; onDelete: (id: string) => void;
}) {
  const ref = useDialog(onClose);
  const h = holding;
  const [f, setF] = useState({
    name: h?.name || '', category: h?.category || '', owner: h?.owner || '', purpose: h?.purpose || '', place: h?.place || '',
    unit: h?.unit || 'rp', value: h?.value != null ? String(h.value) : '', grams: h?.grams != null ? String(h.grams) : '',
    price: h?.price != null ? String(h.price) : '', monthly: h?.monthly ? String(h.monthly) : '', since: h?.since || '',
    note: h?.note || '', estimate: !!h?.estimate,
  });
  const [arm, setArm] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const gram = f.unit === 'gram';

  function submit(e: FormEvent) {
    e.preventDefault();
    const price = gram ? num(f.price) : null;
    const priceChanged = price !== (h?.price ?? null);
    onSave(
      {
        name: f.name.trim(), category: f.category.trim(), owner: f.owner.trim(), purpose: f.purpose.trim(), place: f.place.trim(),
        unit: f.unit as Holding['unit'], value: gram ? null : num(f.value),
        grams: gram ? Number(f.grams.replace(',', '.')) || 0 : null, price,
        monthly: gram ? null : num(f.monthly) || null, since: gram ? null : f.since || null,
        estimate: f.estimate, note: f.note.trim(),
        priceDate: gram ? (priceChanged || !h?.priceDate ? today : h.priceDate) : null,
        priceSource: gram ? (priceChanged || !h?.priceSource ? 'manual' : h.priceSource) : null,
        updated: today,
      },
      h?.id,
    );
  }

  return (
    <dialog ref={ref}>
      <form className="f" onSubmit={submit}>
        <div className="grab" aria-hidden="true" />
        <h2>{h ? 'Edit aset' : 'Tambah aset'}</h2>
        <label htmlFor="aName">Nama<input id="aName" required value={f.name} onChange={set('name')} placeholder="mis. Tabungan Haji Arie" /></label>
        <div className="two">
          <label htmlFor="aCat">Kategori<input id="aCat" list="acats" value={f.category} onChange={set('category')} placeholder="Haji" /></label>
          <label htmlFor="aOwner">Pemilik<input id="aOwner" value={f.owner} onChange={set('owner')} placeholder="Arie" /></label>
        </div>
        <datalist id="acats"><option value="Haji" /><option value="Emas" /><option value="Reksadana" /><option value="Tabungan" /><option value="Deposito" /><option value="Saham" /></datalist>
        <div className="two">
          <label htmlFor="aPurpose">Tujuan<input id="aPurpose" value={f.purpose} onChange={set('purpose')} placeholder="mis. Pendidikan anak" /></label>
          <label htmlFor="aPlace">Nabung di
            <BankPicker id="aPlace" value={f.place} options={banks} onChange={(v) => setF((x) => ({ ...x, place: v }))} onAdd={onAddBank} />
          </label>
        </div>
        <div className="two">
          <label htmlFor="aUnit">Satuan
            <select id="aUnit" value={f.unit} onChange={set('unit')}><option value="rp">Rupiah</option><option value="gram">Gram emas</option></select>
          </label>
          {!gram && (
            <label htmlFor="aValue">Nilai / setoran awal (Rp)<input id="aValue" inputMode="numeric" required value={f.value} onChange={set('value')} /></label>
          )}
        </div>
        {gram ? (
          <div className="two">
            <label htmlFor="aGrams">Berat (gram)<input id="aGrams" inputMode="decimal" required value={f.grams} onChange={set('grams')} /></label>
            <label htmlFor="aPrice">Harga per gram (Rp)<input id="aPrice" inputMode="numeric" required value={f.price} onChange={set('price')} /></label>
          </div>
        ) : (
          <div className="two">
            <label htmlFor="aMonthly">Setoran rutin/bln (Rp)<input id="aMonthly" inputMode="numeric" value={f.monthly} onChange={set('monthly')} placeholder="opsional" /></label>
            <label htmlFor="aSince">Sejak bulan<input id="aSince" type="month" value={f.since} onChange={set('since')} /></label>
          </div>
        )}
        <label htmlFor="aNote">Catatan<input id="aNote" value={f.note} onChange={set('note')} placeholder="opsional" /></label>
        <label htmlFor="aEst" className="check">
          <input id="aEst" type="checkbox" checked={f.estimate} onChange={(e) => setF({ ...f, estimate: e.target.checked })} /> Nilai ini estimasi
        </label>
        <div className="actions">
          {h && (
            <button type="button" className="ghost danger" onClick={() => (arm ? onDelete(h.id) : setArm(true))}>
              {arm ? 'Yakin hapus?' : 'Hapus'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="primary">Simpan</button>
        </div>
      </form>
    </dialog>
  );
}

type GoalBody = Omit<Goal, 'id'>;

function GoalDialog({
  goal, holdings, valueOf, onClose, onSave, onDelete,
}: {
  goal: Goal | null; holdings: Holding[]; valueOf: (h: Holding) => number; onClose: () => void;
  onSave: (b: GoalBody, id?: string) => void; onDelete: (id: string) => void;
}) {
  const ref = useDialog(onClose);
  const [f, setF] = useState({
    name: goal?.name || '', target: goal ? String(goal.target) : '', saved: goal?.saved ? String(goal.saved) : '',
    deadline: goal?.deadline || '', note: goal?.note || '',
  });
  const [ids, setIds] = useState<string[]>(goal?.holdingIds.filter((id) => holdings.some((h) => h.id === id)) ?? []);
  const [arm, setArm] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const linkedTotal = holdings.filter((h) => ids.includes(h.id)).reduce((s, h) => s + valueOf(h), 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(
      {
        name: f.name.trim(), target: num(f.target), saved: ids.length ? 0 : num(f.saved),
        deadline: f.deadline || null, holdingIds: ids, note: f.note.trim(),
      },
      goal?.id,
    );
  }

  return (
    <dialog ref={ref}>
      <form className="f" onSubmit={submit}>
        <div className="grab" aria-hidden="true" />
        <h2>{goal ? 'Edit target' : 'Tambah target'}</h2>
        <label htmlFor="gName">Nama<input id="gName" required value={f.name} onChange={set('name')} placeholder="mis. Dana darurat" /></label>
        <div className="two">
          <label htmlFor="gTarget">Target (Rp)<input id="gTarget" inputMode="numeric" required value={f.target} onChange={set('target')} placeholder="50000000" /></label>
          <label htmlFor="gDeadline">Tercapai bulan<input id="gDeadline" type="month" value={f.deadline} onChange={set('deadline')} /></label>
        </div>
        <fieldset className="pick">
          <legend>Dihitung dari aset</legend>
          {holdings.length ? (
            holdings.map((h) => (
              <label key={h.id} htmlFor={`gh-${h.id}`} className="check">
                <input
                  id={`gh-${h.id}`}
                  type="checkbox"
                  checked={ids.includes(h.id)}
                  onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, h.id] : cur.filter((x) => x !== h.id)))}
                />
                <span className="pick-name">{h.name}{h.place && <span className="hint"> · {h.place}</span>}</span>
                <span className="num hint">{rp(valueOf(h))}</span>
              </label>
            ))
          ) : (
            <span className="hint">Belum ada aset. Isi jumlah terkumpul manual di bawah.</span>
          )}
          {ids.length > 0 && <span className="hint">Terkumpul otomatis: <b className="num">{rp(linkedTotal)}</b>. Alokasi yang masuk ke aset ini ikut menambah progres.</span>}
        </fieldset>
        {!ids.length && (
          <label htmlFor="gSaved">Sudah terkumpul (Rp)<input id="gSaved" inputMode="numeric" value={f.saved} onChange={set('saved')} placeholder="0" /></label>
        )}
        <label htmlFor="gNote">Catatan<input id="gNote" value={f.note} onChange={set('note')} placeholder="opsional" /></label>
        <div className="actions">
          {goal && (
            <button type="button" className="ghost danger" onClick={() => (arm ? onDelete(goal.id) : setArm(true))}>
              {arm ? 'Yakin hapus?' : 'Hapus'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="primary">Simpan</button>
        </div>
      </form>
    </dialog>
  );
}
