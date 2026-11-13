'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, RefreshCw, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate, formatDateTime } from '@/lib/utils';
import { sessionStatus, toDateTimeInput } from '@/lib/attendance-time';

interface HistoricalRecord {
  id: string; date: string; checkIn: string | null; checkOut: string | null; checkoutState: string; needsReview: boolean;
  overtimeMinutes: number; overtimeStatus: string;
  user: { name: string; nik: string; department: string | null };
  _count: { corrections: number };
  reviewActions: { id: string; actorName: string; action: string; reason: string; createdAt: string; newCheckOut: string | null }[];
}

export default function HistoricalAttendanceReviewPage() {
  const [records, setRecords] = useState<HistoricalRecord[]>([]);
  const [scope, setScope] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<HistoricalRecord | null>(null);
  const [action, setAction] = useState('KNOWN_CHECKOUT');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/admin/attendance-review?${new URLSearchParams({ scope, page: String(page), search })}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Gagal memuat catatan.');
      setRecords(data.data.records); setTotal(data.data.total);
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal memuat catatan.'); }
    finally { setLoading(false); }
  }, [scope, page, search]);
  useEffect(() => { load(); }, [load]);

  function open(record: HistoricalRecord, selectedAction: string) {
    setTarget(record); setAction(selectedAction); setCheckOut(''); setReason('');
  }
  async function submit() {
    if (!target || !reason.trim() || (action === 'KNOWN_CHECKOUT' && !checkOut)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/attendance-review/${target.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action, reason: reason.trim(), checkOut: action === 'KNOWN_CHECKOUT' ? new Date(`${checkOut}:00+07:00`).toISOString() : null,
      }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Gagal menyimpan pemeriksaan.');
      toast.success(data.message); setTarget(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Gagal menyimpan pemeriksaan.'); }
    finally { setSaving(false); }
  }

  return <div className="max-w-5xl mx-auto space-y-5">
    <div className="flex justify-between items-start gap-3">
      <div><h1 className="page-title">Tinjau Absen Lama</h1><p className="text-sm text-slate-500 mt-1">Selesaikan catatan historis tanpa jam pulang berdasarkan konfirmasi karyawan atau atasan.</p></div>
      <button className="btn-secondary btn-sm" onClick={load}><RefreshCw size={14} /> Muat Ulang</button>
    </div>
    <div className="card bg-sky-50 border-sky-200 text-sm text-sky-800">Catatan historis tidak menghambat absen harian. Jika jam pulang tidak dapat dipastikan, tandai selesai ditinjau tanpa mengisi jam. Setiap tindakan menyimpan nama Admin, waktu, dan alasan.</div>
    <div className="card flex gap-3 flex-wrap">
      <select aria-label="Status pemeriksaan" className="input w-auto" value={scope} onChange={e => { setScope(e.target.value); setPage(1); }}>
        <option value="pending">Belum selesai ditinjau</option><option value="unknown">Sudah ditinjau — jam tidak diketahui</option><option value="closed">Jam pulang sudah dikoreksi</option><option value="all">Semua catatan historis</option>
      </select>
      <input aria-label="Cari karyawan" className="input flex-1 min-w-40" placeholder="Cari nama atau NIK" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
    </div>
    {error && <div className="card bg-red-50 text-red-700">{error}</div>}
    <p className="text-sm text-slate-500">{total} catatan • Semua waktu dalam WIB</p>
    {loading ? <div className="card animate-pulse">Memuat data...</div> : !records.length ? <div className="card text-center py-10 text-slate-500">Tidak ada catatan untuk filter ini.</div> : records.map(record => <div key={record.id} className="card space-y-3">
      <div className="flex justify-between gap-3 flex-wrap"><div><p className="font-semibold text-slate-800">{record.user.name}</p><p className="text-xs text-slate-500">{record.user.nik} • {record.user.department || '-'}</p></div><span className="text-sm font-medium text-sky-700">{sessionStatus(record)}</span></div>
      <div className="grid sm:grid-cols-3 gap-2 text-sm"><p>Tanggal kerja: <strong>{formatDate(record.date, 'dd MMM yyyy')}</strong></p><p>Masuk: <strong>{formatDateTime(record.checkIn)}</strong></p><p>Pulang: <strong>{record.checkOut ? formatDateTime(record.checkOut) : 'Belum diketahui'}</strong></p></div>
      {record.overtimeMinutes > 0 && <p className="text-xs text-slate-500">Lembur yang sudah disetujui: {record.overtimeMinutes} menit. Persetujuan ini tetap dipertahankan.</p>}
      {record._count.corrections > 0 ? <p className="text-sm text-yellow-700">Ada koreksi menunggu persetujuan. <Link className="underline" href="/corrections">Proses koreksi terlebih dahulu</Link>.</p> : !record.checkOut && <div className="flex gap-2 flex-wrap">
        <button className="btn-primary btn-sm" onClick={() => open(record, 'KNOWN_CHECKOUT')}><Clock size={14} /> {record.checkoutState === 'REVIEWED_UNKNOWN' ? 'Tambahkan Jam yang Sudah Dikonfirmasi' : 'Isi Jam Pulang Sebenarnya'}</button>
        {record.checkoutState !== 'REVIEWED_UNKNOWN' && <button className="btn-secondary btn-sm" onClick={() => open(record, 'UNKNOWN_CHECKOUT')}>Selesai Ditinjau — Jam Tidak Diketahui</button>}
      </div>}
      {record.reviewActions.length > 0 && <details className="text-sm border-t border-gray-100 pt-3"><summary className="cursor-pointer font-semibold text-slate-600">Riwayat Pemeriksaan ({record.reviewActions.length})</summary><div className="space-y-3 mt-3">{record.reviewActions.map(entry => <div key={entry.id} className="rounded-xl bg-slate-50 p-3"><p className="font-medium">{entry.actorName} • {formatDateTime(entry.createdAt)} WIB</p><p>{entry.action === 'UNKNOWN_CHECKOUT' ? 'Selesai ditinjau; jam pulang tidak diketahui.' : `Jam pulang dikoreksi: ${formatDateTime(entry.newCheckOut)} WIB.`}</p><p className="text-slate-600 mt-1">Alasan/sumber: {entry.reason}</p></div>)}</div></details>}
    </div>)}
    <div className="flex justify-between items-center"><button className="btn-secondary btn-sm" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Sebelumnya</button><span className="text-sm">Halaman {page} / {Math.max(1, Math.ceil(total / 25))}</span><button className="btn-secondary btn-sm" disabled={page * 25 >= total || loading} onClick={() => setPage(p => p + 1)}>Berikutnya</button></div>
    {target && <div className="fixed inset-0 z-[60] bg-black/50 p-4 flex items-center justify-center"><div className="bg-white rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
      <div className="flex justify-between items-center"><h2 className="text-lg font-bold">{action === 'KNOWN_CHECKOUT' ? 'Koreksi Jam Pulang Historis' : 'Selesaikan Pemeriksaan'}</h2><button aria-label="Tutup" disabled={saving} onClick={() => setTarget(null)} className="btn-ghost p-1"><X size={18} /></button></div>
      <p className="text-sm">{target.user.name} • Tanggal kerja {formatDate(target.date, 'dd MMM yyyy')}<br />Masuk {formatDateTime(target.checkIn)} WIB</p>
      {action === 'KNOWN_CHECKOUT' ? <label className="label block">Tanggal & Jam Pulang Sebenarnya (WIB)<input className="input mt-1" type="datetime-local" value={checkOut} min={toDateTimeInput(target.checkIn)} max={toDateTimeInput(new Date())} onChange={e => setCheckOut(e.target.value)} /></label> : <p className="bg-yellow-50 text-yellow-800 rounded-xl p-3 text-sm">Jam pulang tetap kosong. Catatan selesai diperiksa tanpa menetapkan durasi kerja atau membuat lembur otomatis. Persetujuan lembur yang sudah ada tetap dipertahankan.</p>}
      <label className="label block">Alasan & Sumber Konfirmasi *<textarea className="input mt-1" rows={4} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder={action === 'KNOWN_CHECKOUT' ? 'Contoh: Dikonfirmasi karyawan dan atasan pada tanggal ...' : 'Contoh: Sudah dikonfirmasi ke atasan; jam pulang tanggal tersebut tidak dapat dipastikan.'} /></label>
      <div className="flex gap-3"><button disabled={saving} className="btn-secondary flex-1" onClick={() => setTarget(null)}>Batal</button><button className="btn-primary flex-1" disabled={saving || !reason.trim() || (action === 'KNOWN_CHECKOUT' && !checkOut)} onClick={submit}><Save size={15} />{saving ? 'Menyimpan...' : 'Simpan Pemeriksaan'}</button></div>
    </div></div>}
  </div>;
}
