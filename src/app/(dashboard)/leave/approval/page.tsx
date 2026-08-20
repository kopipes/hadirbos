'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Calendar, CheckCircle2, XCircle, Clock, RefreshCw, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatDate } from '@/lib/utils';

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
  user: { id: string; name: string; nik: string; department?: string | null; position?: string | null };
  reviewedBy?: { id: string; name: string } | null;
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'Cuti Tahunan', SICK: 'Cuti Sakit', MATERNITY: 'Cuti Melahirkan',
  PATERNITY: 'Cuti Ayah', PERMISSION: 'Izin', OTHER: 'Cuti Lainnya',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:   { label: 'Menunggu',   color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  APPROVED:  { label: 'Disetujui',  color: 'bg-green-50 text-green-700 border-green-200' },
  REJECTED:  { label: 'Ditolak',    color: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-gray-100 text-gray-500 border-gray-200' },
};

export default function LeaveApprovalPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/leave?${params}`);
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

  function openReview(req: LeaveRequest, action: 'APPROVED' | 'REJECTED') {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewNote('');
  }

  async function handleReview() {
    if (!reviewTarget || !reviewAction) return;
    if (reviewAction === 'REJECTED' && !reviewNote.trim()) {
      toast.error('Catatan wajib diisi saat menolak cuti.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/leave/${reviewTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: reviewAction, reviewNote }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(reviewAction === 'APPROVED' ? 'Cuti disetujui.' : 'Cuti ditolak.');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Persetujuan Cuti</h1>
          {pending > 0 && filterStatus === 'PENDING' && (
            <p className="text-sm text-yellow-600 font-medium mt-0.5">
              {pending} pengajuan menunggu persetujuan
            </p>
          )}
        </div>
        <button onClick={load} className="btn-secondary btn-sm" aria-label="Muat ulang">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit flex-wrap">
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
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Calendar size={36} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">Tidak ada pengajuan cuti</p>
          <p className="text-sm mt-1">{filterStatus === 'PENDING' ? 'Semua cuti sudah diproses.' : 'Belum ada data.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING;
            const typeLabel = LEAVE_TYPE_LABEL[req.type] || req.type;
            return (
              <div key={req.id} className="card">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-bold flex-shrink-0">
                    {req.user.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{req.user.name}</p>
                      <span className={cn('badge', cfg.color)}>{cfg.label}</span>
                      <span className="badge bg-blue-50 text-blue-700 border-blue-200">{typeLabel}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {req.user.nik} · {req.user.department || '-'} · {req.user.position || '-'}
                    </p>

                    <div className="flex gap-4 mt-2 text-sm text-slate-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} className="text-slate-400" />
                        {req.startDate === req.endDate
                          ? formatDate(req.startDate, 'dd MMM yyyy')
                          : `${formatDate(req.startDate, 'dd MMM')} – ${formatDate(req.endDate, 'dd MMM yyyy')}`}
                      </span>
                      <span className="font-semibold text-slate-700">{req.totalDays} hari kerja</span>
                    </div>

                    <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{req.reason}</p>

                    {req.reviewNote && (
                      <p className="text-xs text-slate-500 mt-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg">
                        Catatan: {req.reviewNote}
                      </p>
                    )}
                    {req.reviewedBy && (
                      <p className="text-xs text-slate-400 mt-1">Diproses oleh: {req.reviewedBy.name}</p>
                    )}
                  </div>

                  {/* Actions */}
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

      {/* Review modal */}
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
                {reviewAction === 'APPROVED' ? 'Setujui Cuti?' : 'Tolak Cuti?'}
              </h2>

              <div className="mt-3 bg-gray-50 rounded-2xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Karyawan</span>
                  <span className="font-semibold text-slate-800">{reviewTarget.user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Jenis</span>
                  <span className="font-semibold text-slate-800">{LEAVE_TYPE_LABEL[reviewTarget.type]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal</span>
                  <span className="font-semibold text-slate-800">
                    {reviewTarget.startDate === reviewTarget.endDate
                      ? formatDate(reviewTarget.startDate, 'dd MMM yyyy')
                      : `${formatDate(reviewTarget.startDate, 'dd MMM')} – ${formatDate(reviewTarget.endDate, 'dd MMM yyyy')}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold text-slate-800">{reviewTarget.totalDays} hari kerja</span>
                </div>
              </div>

              {reviewAction === 'APPROVED' && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-green-50 rounded-xl text-sm text-green-700">
                  <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                  <p>Status kehadiran akan otomatis diset menjadi <strong>Cuti</strong> pada tanggal-tanggal tersebut.</p>
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
                  placeholder={reviewAction === 'APPROVED' ? 'Pesan untuk karyawan...' : 'Alasan penolakan...'}
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
