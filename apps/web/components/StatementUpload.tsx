'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { active, Data, Entry, longL, MonthState, rp } from '@/lib/finance';
import { PdfPasswordError, pdfLines } from '@/lib/statement-pdf';
import { Bank, parseStatement, Statement } from '@/lib/statement-parse';
import { propose, Proposal } from '@/lib/statement-match';

type Props = {
  data: Data;
  defaultMonth: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
};

let pdfjsPromise: Promise<any> | null = null;
function loadPdfJs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m: any) => {
    m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';

export default function StatementUpload({ data, defaultMonth, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [bankChoice, setBankChoice] = useState<'' | Bank>('');
  const [st, setSt] = useState<Statement | null>(null);
  const [bank, setBank] = useState<Bank>('Mandiri');
  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState<Proposal[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const close = () => onClose();
    d?.addEventListener('close', close);
    return () => d?.removeEventListener('close', close);
  }, [onClose]);

  // Re-match whenever the statement, bank or target month changes.
  useEffect(() => {
    if (!st) return;
    setRows(propose(st, data.entries, bank, (e) => active(e as Entry, month)));
  }, [st, bank, month, data.entries]);

  async function read(e?: FormEvent) {
    e?.preventDefault();
    if (!file) return setError('Pilih file PDF dulu.');
    setError('');
    setBusy(true);
    try {
      const pdfjs = await loadPdfJs();
      const lines = await pdfLines(pdfjs, new Uint8Array(await file.arrayBuffer()), password);
      const parsed = parseStatement(lines, bankChoice || null);
      if (!parsed.bank) throw new Error('Bank tidak dikenali. Pilih bank secara manual lalu baca ulang.');
      if (!parsed.items.length) throw new Error('Tidak ada transaksi yang terbaca. Pastikan ini PDF lembar tagihan kartu kredit, bukan hasil scan atau foto.');
      setBank(parsed.bank);
      if (parsed.dueDate) setMonth(parsed.dueDate.slice(0, 7));
      setSt(parsed);
      setNeedPassword(false);
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setNeedPassword(true);
        setError(err.wrong ? 'Password salah. Coba lagi.' : 'PDF ini dikunci. Masukkan password-nya, atau lepas dulu password-nya (lihat panduan di bawah).');
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  const sum = st?.items.reduce((s, t) => s + t.amount, 0) ?? 0;
  const totalOk = st?.total != null && Math.abs(st.total - sum) <= 10;
  const counts = useMemo(() => ({
    match: rows.filter((r) => r.action === 'match').length,
    override: rows.filter((r) => r.action === 'override' && r.include).length,
    add: rows.filter((r) => r.action === 'new' && r.include).length,
  }), [rows]);
  const toSave = counts.override + counts.add;

  const setRow = (key: string, patch: Partial<Proposal>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const fresh = rows.filter((r) => r.action === 'new' && r.include);
      if (fresh.length) {
        await api('/entries/bulk', {
          method: 'POST',
          json: {
            entries: fresh.map((r) => ({
              name: r.name.trim() || 'Transaksi', flow: 'out', bank, mode: r.mode, amount: r.txn.amount,
              start: month, months: r.mode === 'cicilan' ? r.months || 1 : null,
              note: `dari statement ${bank} ${fmtDay(st?.statementDate ?? null)}`,
            })),
          },
        });
      }
      const ov = rows.filter((r) => r.action === 'override' && r.include && r.entryId);
      if (ov.length) {
        const cur = data.months[month] || { paid: {}, amt: {} };
        const m: MonthState = { paid: { ...cur.paid }, amt: { ...cur.amt } };
        ov.forEach((r) => (m.amt[r.entryId!] = r.txn.amount));
        await api(`/months/${month}`, { method: 'PUT', json: m });
      }
      onSaved(`${bank}: ${fresh.length} tagihan baru, ${ov.length} nominal diperbarui di ${longL(month)}`);
      ref.current?.close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="wide">
      <div className="f">
        <div className="grab" aria-hidden="true" />
        <h2>Upload tagihan kartu kredit</h2>

        {!st ? (
          <form onSubmit={read} style={{ display: 'grid', gap: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              Mandiri, BCA, atau Jenius. PDF dibaca di perangkat ini saja; yang dikirim ke server hanya baris tagihan yang kamu simpan.
            </p>
            <label htmlFor="stFile">File PDF
              <input id="stFile" type="file" accept="application/pdf,.pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
            </label>
            <div className="two">
              <label htmlFor="stBank">Bank
                <select id="stBank" value={bankChoice} onChange={(e) => setBankChoice(e.target.value as '' | Bank)}>
                  <option value="">Deteksi otomatis</option><option>Mandiri</option><option>BCA</option><option>Jenius</option>
                </select>
              </label>
              <label htmlFor="stPass">Password PDF {needPassword ? '' : '(kalau ada)'}
                <input id="stPass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            </div>
            <details className="help">
              <summary>Cara melepas password PDF</summary>
              <div>
                <p><b>Paling mudah:</b> isi password di kolom di atas. Password hanya dipakai untuk membuka file di browser ini dan tidak disimpan.</p>
                <p><b>Mac (Preview):</b> buka PDF → masukkan password → menu <b>File → Export as PDF…</b> → simpan. File hasil export sudah tanpa password.</p>
                <p><b>iPhone:</b> buka PDF di app <b>Files</b> → masukkan password → tombol <b>Share → Print</b> → cubit-perbesar pratinjau → <b>Share → Save to Files</b>.</p>
                <p><b>Windows / Android (Chrome):</b> buka PDF di Chrome → masukkan password → <b>Print → Save as PDF</b>.</p>
                <p>Password-nya biasanya dijelaskan di email pengiriman e-statement dari bank (umumnya gabungan tanggal lahir dan digit nomor kartu).</p>
              </div>
            </details>
            {error && <p className="err" role="alert">{error}</p>}
            <div className="actions">
              <span style={{ flex: 1 }} />
              <button type="button" className="ghost" onClick={() => ref.current?.close()}>Batal</button>
              <button className="primary" disabled={busy || !file}>{busy ? 'Membaca…' : 'Baca PDF'}</button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="stsum">
              <div><span className="label">Bank</span><b>{bank}</b></div>
              <div><span className="label">Tgl cetak</span><b>{fmtDay(st.statementDate)}</b></div>
              <div><span className="label">Jatuh tempo</span><b>{fmtDay(st.dueDate)}</b></div>
              <div><span className="label">Total PDF</span><b className="num">{st.total != null ? rp(st.total) : '–'}</b></div>
            </div>
            <p className={totalOk ? 'ok' : 'err'} style={{ fontSize: 13 }}>
              {totalOk
                ? `Total ${st.items.length} transaksi yang terbaca (${rp(sum)}) sama dengan total tagihan di PDF.`
                : `Total transaksi terbaca ${rp(sum)}${st.total != null ? `, beda ${rp(Math.abs((st.total ?? 0) - sum))} dari total di PDF` : ''}. Cek lagi daftar di bawah sebelum menyimpan.`}
              {!st.tested && ' Format statement bank ini belum pernah diuji, jadi periksa setiap baris.'}
            </p>
            <label htmlFor="stMonth" className="hint" style={{ display: 'grid', gap: 4 }}>
              Masukkan ke tagihan bulan
              <input id="stMonth" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </label>
            <p className="hint" style={{ margin: 0 }}>
              {counts.match} sudah ada di tracker · {counts.override} nominal berubah · {counts.add} tagihan baru
            </p>

            <div className="stlist">
              {rows.map((r) => (
                <div key={r.key} className={`row${r.action === 'match' ? ' nocheck dim' : ''}`}>
                  {r.action !== 'match' && (
                    <input type="checkbox" id={`st-${r.key}`} checked={r.include} aria-label={`Simpan ${r.name}`} onChange={(e) => setRow(r.key, { include: e.target.checked })} />
                  )}
                  <div className="name">
                    {r.action === 'new' ? (
                      <input className="rowname" id={`stn-${r.key}`} value={r.name} aria-label="Nama tagihan" onChange={(e) => setRow(r.key, { name: e.target.value })} />
                    ) : (
                      <b>{r.name}</b>
                    )}
                    <div className="meta">
                      {r.action === 'match' && <span className="chip last">sudah ada</span>}
                      {r.action === 'override' && <span className="chip ov">ubah dari {rp(r.entryAmount || 0)}</span>}
                      {r.action === 'new' && <span className="chip">baru · {r.mode === 'cicilan' ? `cicilan ${r.txn.inst?.no}/${r.txn.inst?.total}` : 'sekali'}</span>}
                      <span>{r.txn.date} · {r.txn.desc}</span>
                      {r.action === 'new' && r.mode === 'cicilan' && <span>sisa {r.months} bln mulai {longL(month)}</span>}
                    </div>
                  </div>
                  <span className="num" style={{ fontWeight: 500 }}>{rp(r.txn.amount)}</span>
                </div>
              ))}
            </div>
            {st.skipped.length > 0 && (
              <details className="help">
                <summary>{st.skipped.length} baris dilewati (pembayaran, pembatalan, nominal 0)</summary>
                <ul>{st.skipped.map((t, i) => <li key={i}>{t.date} · {t.desc} · {rp(t.amount)}{t.credit ? ' CR' : ''}</li>)}</ul>
              </details>
            )}
            {error && <p className="err" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="ghost" onClick={() => { setSt(null); setRows([]); }}>Ganti file</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="ghost" onClick={() => ref.current?.close()}>Batal</button>
              <button type="button" className="primary" disabled={busy || !toSave} onClick={save}>
                {busy ? 'Menyimpan…' : toSave ? `Simpan ${toSave} ke ${longL(month)}` : 'Semua sudah ada'}
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

