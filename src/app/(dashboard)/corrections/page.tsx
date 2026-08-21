'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Edit2, CheckCircle2, XCircle, RefreshCw, Clock, X, Save, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatDate, formatTime } from '@/lib/utils';

interface CorrectionRequest {
  id: string;
  reason: string;
  status: string;
  oldCheckIn?: string | null;
  newCheckIn?: string | null;
  oldCheckOut?: string | null;
  newCheckOut?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string; nik: string; department?: string | null; position?: string | null };
  approvedBy?: { id: string; name: string } | null;
  attendance: { id: string; date: string; checkIn?: string | null; checkOut?: string | null; status: string };
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: 'Menunggu',   color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  APPROVED: { label: 'Disetujui',  color: 'bg-green-50 text-green-700 border-green-200' },
  REJECTED: { label: 'Ditolak',    color: 'bg-red-50 text-red-700 border-red-200' },
};

export default function CorrectionsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [reviewTarget, setReviewTarget] = useState<CorrectionRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/attendances/corrections?${params}`);
      const data = await res.json();
      if (data.success) setRequests(data.data);
      else toast.error('Gagal memuat data.');
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => requests.filter(r => r.status === 'PENDING').length, [requests]);

  function openReview(req: CorrectionRequest, action: 'APPROVED' | 'REJECTED') {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewNote('');
  }

  async function handleReview() {
    if (!reviewTarget || !reviewAction) return;
    if (reviewAction === 'REJECTED' && !reviewNote.trim()) {
      toast.error('Catatan wajib diisi saat menolak koreksi.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/attendances/corrections/${reviewTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: reviewAction }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(reviewAction === 'APPROVED' ? 'Koreksi disetujui.' : 'Koreksi ditolak.');
        setReviewTarget(null);
        setReviewAction(null);
        await load();
      } else {
        toast.error(data.error || 'Gagal memproses.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Koreksi Absen</h1>
          {pending > 0 && filterStatus === 'PENDING' && (
            <p className="text-sm text-yellow-600 font-medium mt-0.5">
              {pending} permintaan koreksi menunggu persetujuan
            </p>
          )}
        </div>
        <button onClick={load} className="btn-secondary btn-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {[
          { value: 'PENDING',  label: 'Menunggu' },
          { value: 'APPROVED', label: 'Disetujui' },
          { value: 'REJECTED', label: 'Ditolak' },
          { value: '',         label: 'Semua' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={cn('px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              filterStatus === f.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Edit2 size={36} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">Tidak ada permintaan koreksi</p>
          <p className="text-sm mt-1">{filterStatus === 'PENDING' ? 'Semua sudah diproses.' : 'Belum ada data.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING;
            return (
              <div key={req.id} className={cn('card', req.status === 'PENDING' && 'border-yellow-200 bg-yellow-50/20')}>
                <div className="flex items-start gap-4">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    req.status === 'PENDING' ? 'bg-yellow-50' : req.status === 'APPROVED' ? 'bg-green-50' : 'bg-red-50')}>
                    <Edit2 size={18} className={
                      req.status === 'PENDING' ? 'text-yellow-500' :
                      req.status === 'APPROVED' ? 'text-green-500' : 'text-red-500'
                    } />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{req.requestedBy.name}</p>
                      <span className={cn('badge', cfg.color)}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {req.requestedBy.nik} · {req.requestedBy.department || '-'}
                    </p>

                    {/* Date */}
                    <div className="flex items-center gap-1 mt-2 text-sm text-slate-600">
                      <Clock size={13} className="text-slate-400" />
                      {formatDate(req.attendance.date, 'dd MMM yyyy')}
                    </div>

                    {/* Before/After comparison */}
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="bg-red-50 rounded-xl p-2.5 text-xs">
                        <p className="text-red-500 font-semibold mb-1">Sebelum</p>
                        <p>Masuk: <strong>{formatTime(req.oldCheckIn)}</strong></p>
                        <p>Pulang: <strong>{formatTime(req.oldCheckOut)}</strong></p>
                      </div>
                      <div className="bg-green-50 rounded-xl p-2.5 text-xs">
                        <p className="text-green-600 font-semibold mb-1">Koreksi</p>
                        <p>Masuk: <strong>{req.newCheckIn ? formatTime(req.newCheckIn) : '(tidak diubah)'}</strong></p>
                        <p>Pulang: <strong>{req.newCheckOut ? formatTime(req.newCheckOut) : '(tidak diubah)'}</strong></p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 mt-2 font-medium">Alasan: {req.reason}</p>

                    {req.approvedBy && (
                      <p className="text-xs text-slate-400 mt-1">Diproses oleh: {req.approvedBy.name}</p>
                    )}
                  </div>

                  {req.status === 'PENDING' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => openReview(req, 'APPROVED')} className="btn-success btn-sm">
                        <CheckCircle2 size={14} /> Setuju
                      </button>
                      <button onClick={() => openReview(req, 'REJECTED')} className="btn-danger btn-sm">
                        <XCircle size={14} /> Tolak
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewTarget && reviewAction && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="p-6">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4',
                reviewAction === 'APPROVED' ? 'bg-green-50' : 'bg-red-50')}>
                {reviewAction === 'APPROVED'
                  ? <CheckCircle2 size={22} className="text-green-500" />
                  : <XCircle size={22} className="text-red-500" />}
              </div>

              <h2 className="text-lg font-bold text-slate-900 text-center">
                {reviewAction === 'APPROVED' ? 'Setujui Koreksi?' : 'Tolak Koreksi?'}
              </h2>

              <div className="mt-3 bg-gray-50 rounded-2xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Karyawan</span>
                  <span className="font-semibold text-slate-800">{reviewTarget.requestedBy.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal</span>
                  <span className="font-semibold text-slate-800">{formatDate(reviewTarget.attendance.date, 'dd MMM yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Masuk lama → baru</span>
                  <span className="font-semibold text-slate-800">
                    {formatTime(reviewTarget.oldCheckIn)} → {reviewTarget.newCheckIn ? formatTime(reviewTarget.newCheckIn) : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pulang lama → baru</span>
                  <span className="font-semibold text-slate-800">
                    {formatTime(reviewTarget.oldCheckOut)} → {reviewTarget.newCheckOut ? formatTime(reviewTarget.newCheckOut) : '-'}
                  </span>
                </div>
                <div className="pt-1 border-t border-gray-200">
                  <span className="text-slate-500">Alasan</span>
                  <p className="font-medium text-slate-800 mt-0.5">{reviewTarget.reason}</p>
                </div>
              </div>

              {reviewAction === 'APPROVED' && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-green-50 rounded-xl text-sm text-green-700">
                  <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                  <p>Data absen akan diperbarui sesuai koreksi yang diajukan.</p>
                </div>
              )}

              <div className="mt-4">
                <label className="label">
                  Catatan {reviewAction === 'REJECTED' ? '(wajib)' : '(opsional)'}
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder={reviewAction === 'APPROVED' ? 'Catatan...' : 'Alasan penolakan...'}
                />
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setReviewTarget(null); setReviewAction(null); }}
                  className="btn-secondary flex-1"
                  disabled={submitting}
                >Batal</button>
                <button
                  onClick={handleReview}
                  disabled={submitting || (reviewAction === 'REJECTED' && !reviewNote.trim())}
                  className={cn('flex-1', reviewAction === 'APPROVED' ? 'btn-success' : 'btn-danger')}
                >
                  {submitting ? 'Memproses...' : reviewAction === 'APPROVED' ? 'Ya, Setujui' : 'Ya, Tolak'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
