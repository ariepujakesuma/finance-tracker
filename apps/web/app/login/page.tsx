'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import PinField from '@/components/PinField';
import { api, AuthStatus } from '@/lib/api';

const DEFAULT_HINT = '';

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [hint, setHint] = useState(DEFAULT_HINT);
  const [setupKey, setSetupKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AuthStatus>('/auth/status')
      .then((s) => (s.authenticated ? router.replace('/') : setStatus(s)))
      .catch(() => setError('Server tidak bisa dihubungi. Coba muat ulang.'));
  }, [router]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (pin.length < 4) return setError('Masukkan PIN dulu.');
    setBusy(true);
    try {
      await api('/auth/login', { method: 'POST', json: { pin } });
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  async function setup(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (pin.length < 4) return setError('PIN minimal 4 angka.');
    if (pin !== pin2) return setError('PIN dan ulangi PIN belum sama.');
    setBusy(true);
    try {
      await api('/auth/setup', { method: 'POST', json: { pin, hint, setupKey: setupKey || undefined } });
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <main className="gate">
        <div className="gatecard glass">
          <h1>Finance Tracker</h1>
          {error ? <p className="err">{error}</p> : <p className="lead">Memeriksa sesi…</p>}
        </div>
      </main>
    );
  }

  if (!status.hasPin) {
    return (
      <main className="gate">
        <form className="gatecard glass" onSubmit={setup}>
          <h1>Buat PIN</h1>
          <p className="lead">PIN ini dipakai untuk membuka dashboard di semua perangkat.</p>
          <PinField id="pin" label="PIN baru" value={pin} onChange={setPin} autoFocus />
          <PinField id="pin2" label="Ulangi PIN" value={pin2} onChange={setPin2} />
          <label htmlFor="hint" className="hint" style={{ display: 'grid', gap: 6 }}>
            Petunjuk yang tampil di layar masuk
            <input id="hint" className="field" value={hint} maxLength={160} placeholder="mis. Masukkan tanggal penting (DDMMYYYY)" onChange={(e) => setHint(e.target.value)} />
          </label>
          {status.setupKeyRequired && (
            <label htmlFor="setupKey" className="hint" style={{ display: 'grid', gap: 6 }}>
              Setup key (dari env SETUP_KEY di server)
              <input id="setupKey" className="field" type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} />
            </label>
          )}
          {error && <p className="err" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Buat PIN & masuk'}</button>
        </form>
      </main>
    );
  }

  const locked = status.lockedUntil && new Date(status.lockedUntil) > new Date();

  return (
    <main className="gate">
      <form className="gatecard glass" onSubmit={login}>
        <h1>Finance Tracker</h1>
        <div className="hintbox">{status.hint}</div>
        <PinField id="pin" label="PIN" value={pin} onChange={setPin} autoFocus />
        {locked && !error && (
          <p className="err">Akses dikunci sementara sampai {new Date(status.lockedUntil!).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.</p>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
        <div className="links">
          <Link href="/pin">Ganti PIN</Link>
          <Link href="/pin?tab=reset">Lupa PIN</Link>
        </div>
      </form>
    </main>
  );
}
