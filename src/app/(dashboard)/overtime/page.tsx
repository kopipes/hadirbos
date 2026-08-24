'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, XCircle, Filter, RefreshCw, Timer } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatDate, formatTime, formatMinutes } from '@/lib/utils';

interface OvertimeRequest {
  id: string;
  overtimeMinutes: number;
  reason?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  requestedBy: {
    id: string; name: string; nik: string;
    department?: string | null; position?: string | null;
  };
  reviewedBy?: { id: string; name: string } | null;
  attendance: {
    id: string; date: string;
    checkIn?: string | null; checkOut?: string | null;
  };
}

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING:  { label: 'Menunggu',  color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  APPROVED: { label: 'Disetujui', color: 'bg-green-50 text-green-700 border-green-200' },
  REJECTED: { label: 'Ditolak',   color: 'bg-red-50 text-red-700 border-red-200' },
};

export default function OvertimePage() {
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [reviewTarget, setReviewTarget] = useState<OvertimeRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    const res = await fetch(`/api/overtime?${params}`);
    const data = await res.json();
    if (data.success) setRequests(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filterStatus]);

  function openReview(req: OvertimeRequest, action: 'APPROVED' | 'REJECTED') {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewNotes('');
  }

  async function handleReview() {
    if (!reviewTarget || !reviewAction) return;
    setSubmitting(true);
    const res = await fetch(`/api/overtime/${reviewTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: reviewAction, notes: reviewNotes }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(reviewAction === 'APPROVED' ? 'Lembur disetujui.' : 'Lembur ditolak.');
      setReviewTarget(null);
      setReviewAction(null);
      await load();
    } else {
      toast.error(data.error || 'Gagal memproses.');
    }
    setSubmitting(false);
  }

  const pending = requests.filter(r => r.status === 'PENDING').length;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Persetujuan Lembur</h1>
          {pending > 0 && filterStatus === 'PENDING' && (
            <p className="text-sm text-yellow-600 font-medium mt-0.5">
              {pending} pengajuan menunggu persetujuan
            </p>
          )}
        </div>
        <button onClick={load} className="btn-secondary btn-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex bg-gray-100 p-1 rounded-2xl w-fit">
        {[
          { value: 'PENDING', label: 'Menunggu' },
          { value: 'APPROVED', label: 'Disetujui' },
          { value: 'REJECTED', label: 'Ditolak' },
          { value: '', label: 'Semua' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              filterStatus === f.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Timer size={36} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">Tidak ada pengajuan lembur</p>
          <p className="text-sm mt-1">
            {filterStatus === 'PENDING' ? 'Semua lembur sudah diproses.' : 'Belum ada data lembur.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const cfg = statusConfig[req.status] || statusConfig.PENDING;
            return (
              <div key={req.id} className="card">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-bold flex-shrink-0">
                    {req.requestedBy.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{req.requestedBy.name}</p>
                      <span className={cn('badge', cfg.color)}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {req.requestedBy.nik} · {req.requestedBy.department || '-'} · {req.requestedBy.position || '-'}
                    </p>

                    <div className="flex gap-4 mt-2 text-sm text-slate-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-slate-400" />
                        {formatDate(req.attendance.date, 'dd MMM yyyy')}
                      </span>
                      <span>
                        Masuk: <strong>{req.attendance.checkIn ? formatTime(req.attendance.checkIn) : '-'}</strong>
                      </span>
                      <span>
                        Pulang: <strong>{req.attendance.checkOut ? formatTime(req.attendance.checkOut) : '-'}</strong>
                      </span>
                      <span className="text-purple-700 font-semibold">
                        Lembur: {formatMinutes(req.overtimeMinutes)}
                      </span>
                    </div>

                    {req.notes && (
                      <p className="text-xs text-slate-500 mt-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg">
                        Catatan reviewer: {req.notes}
                      </p>
                    )}
                    {req.reason && (
                      <p className="text-xs text-purple-600 mt-1.5 bg-purple-50 px-2.5 py-1.5 rounded-lg">
                        Alasan lembur: {req.reason}
                      </p>
                    )}
                    {req.reviewedBy && (
                      <p className="text-xs text-slate-400 mt-1">
                        Diproses oleh: {req.reviewedBy.name}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {req.status === 'PENDING' ? (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => openReview(req, 'APPROVED')}
                        className="btn-success btn-sm"
                      >
                        <CheckCircle2 size={14} /> Setuju
                      </button>
                      <button
                        onClick={() => openReview(req, 'REJECTED')}
                        className="btn-danger btn-sm"
                      >
                        <XCircle size={14} /> Tolak
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => openReview(req, req.status === 'APPROVED' ? 'REJECTED' : 'APPROVED')}
                        className="btn-secondary btn-sm text-xs"
                        title="Override keputusan (hanya ADMIN)"
                      >
                        Override
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review modal */}
      {reviewTarget && reviewAction && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="p-6">
              <div className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4',
                reviewAction === 'APPROVED' ? 'bg-green-50' : 'bg-red-50'
              )}>
                {reviewAction === 'APPROVED'
                  ? <CheckCircle2 size={22} className="text-green-500" />
                  : <XCircle size={22} className="text-red-500" />}
              </div>
              <h2 className="text-lg font-bold text-slate-900 text-center">
                {reviewTarget.status !== 'PENDING'
                  ? `Override → ${reviewAction === 'APPROVED' ? 'Setujui' : 'Tolak'}?`
                  : reviewAction === 'APPROVED' ? 'Setujui Lembur?' : 'Tolak Lembur?'}
              </h2>
              <p className="text-slate-500 text-sm text-center mt-2">
                <strong className="text-slate-800">{reviewTarget.requestedBy.name}</strong> —{' '}
                {formatDate(reviewTarget.attendance.date, 'dd MMM yyyy')} ({formatMinutes(reviewTarget.overtimeMinutes)})
              </p>

              <div className="mt-4">
                <label className="label">
                  Catatan {reviewAction === 'REJECTED' ? '(wajib untuk penolakan)' : '(opsional)'}
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder={reviewAction === 'APPROVED' ? 'Catatan persetujuan...' : 'Alasan penolakan...'}
                />
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setReviewTarget(null); setReviewAction(null); }}
                  className="btn-secondary flex-1"
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  onClick={handleReview}
                  disabled={submitting || (reviewAction === 'REJECTED' && !reviewNotes.trim())}
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
