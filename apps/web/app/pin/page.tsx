'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import PinField from '@/components/PinField';
import { api, AuthStatus } from '@/lib/api';

type Tab = 'change' | 'reset';

export default function PinPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('change');
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [hint, setHint] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'reset') setTab('reset');
    api<AuthStatus>('/auth/status')
      .then((s) => {
        if (!s.hasPin) router.replace('/login');
        setStatus(s);
        setHint(s.hint);
      })
      .catch(() => setError('Server tidak bisa dihubungi.'));
  }, [router]);

  function switchTab(t: Tab) {
    setTab(t);
    setError('');
    setDone('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    if (newPin.length < 4) return setError('PIN baru minimal 4 angka.');
    if (newPin !== newPin2) return setError('PIN baru dan ulangi PIN belum sama.');
    setBusy(true);
    try {
      if (tab === 'change') {
        await api('/auth/change', { method: 'POST', json: { oldPin, newPin, hint } });
      } else {
        await api('/auth/reset', { method: 'POST', json: { setupKey, newPin, hint } });
      }
      setDone('PIN baru tersimpan. Perangkat lain perlu masuk ulang.');
      setTimeout(() => router.replace('/'), 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <form className="gatecard" onSubmit={submit}>
        <h1>{tab === 'change' ? 'Ganti PIN' : 'Buat PIN baru'}</h1>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'change'} onClick={() => switchTab('change')}>Ganti PIN</button>
          <button type="button" role="tab" aria-selected={tab === 'reset'} onClick={() => switchTab('reset')}>Lupa PIN</button>
        </div>

        {tab === 'change' ? (
          <PinField id="oldPin" label="PIN lama" value={oldPin} onChange={setOldPin} autoFocus />
        ) : (
          <>
            <p className="lead">
              Kalau lupa PIN, buat PIN baru memakai setup key, yaitu nilai <b>SETUP_KEY</b> di environment variable server API.
            </p>
            {status && !status.setupKeyRequired && (
              <p className="err">SETUP_KEY belum diset di server, jadi reset belum bisa dipakai.</p>
            )}
            <label htmlFor="setupKey" className="hint" style={{ display: 'grid', gap: 6 }}>
              Setup key
              <input id="setupKey" className="ghost" type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} />
            </label>
          </>
        )}
        <PinField id="newPin" label="PIN baru" value={newPin} onChange={setNewPin} />
        <PinField id="newPin2" label="Ulangi PIN baru" value={newPin2} onChange={setNewPin2} />
        <label htmlFor="hint" className="hint" style={{ display: 'grid', gap: 6 }}>
          Petunjuk di layar masuk
          <input id="hint" className="ghost" value={hint} maxLength={160} onChange={(e) => setHint(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        {done && <p className="ok" role="status">{done}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan PIN baru'}</button>
        <div className="links"><Link href="/">Kembali ke dashboard</Link></div>
      </form>
    </main>
  );
}
