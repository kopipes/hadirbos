'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Calendar, Clock, CheckCircle2, XCircle, Ban, X, Save, AlertCircle } from 'lucide-react';
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
  reviewedBy?: { id: string; name: string } | null;
}

const LEAVE_TYPES = [
  { value: 'ANNUAL',     label: 'Cuti Tahunan',     desc: 'Cuti rutin tahunan' },
  { value: 'SICK',       label: 'Cuti Sakit',        desc: 'Sakit dengan/tanpa surat dokter' },
  { value: 'MATERNITY',  label: 'Cuti Melahirkan',   desc: 'Cuti untuk ibu melahirkan' },
  { value: 'PATERNITY',  label: 'Cuti Ayah',         desc: 'Cuti untuk ayah' },
  { value: 'PERMISSION', label: 'Izin',              desc: 'Izin keperluan mendadak' },
  { value: 'OTHER',      label: 'Lainnya',           desc: 'Jenis cuti lainnya' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING:   { label: 'Menunggu',   color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  APPROVED:  { label: 'Disetujui',  color: 'bg-green-50 text-green-700 border-green-200',   icon: CheckCircle2 },
  REJECTED:  { label: 'Ditolak',    color: 'bg-red-50 text-red-700 border-red-200',         icon: XCircle },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-gray-100 text-gray-500 border-gray-200',     icon: Ban },
};

function countWorkDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  const endD = new Date(end);
  while (cur <= endD) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function LeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState({
    type: 'ANNUAL',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave');
      const data = await res.json();
      if (data.success) setRequests(data.data);
      else toast.error('Gagal memuat data cuti.');
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    filterStatus ? requests.filter(r => r.status === filterStatus) : requests,
    [requests, filterStatus]
  );

  const workDays = useMemo(() =>
    countWorkDays(form.startDate, form.endDate),
    [form.startDate, form.endDate]
  );

  async function handleSubmit() {
    if (!form.startDate || !form.endDate) { toast.error('Tanggal wajib diisi.'); return; }
    if (!form.reason.trim()) { toast.error('Alasan wajib diisi.'); return; }
    if (workDays === 0) { toast.error('Tidak ada hari kerja dalam rentang tanggal ini.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Pengajuan cuti berhasil dikirim!');
        setShowModal(false);
        setForm({ type: 'ANNUAL', startDate: '', endDate: '', reason: '' });
        await load();
      } else {
        toast.error(data.error || 'Gagal mengajukan cuti.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    setCancelling(id);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Pengajuan cuti dibatalkan.');
        await load();
      } else {
        toast.error(data.error || 'Gagal membatalkan.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Pengajuan Cuti</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {requests.filter(r => r.status === 'PENDING').length > 0
              ? `${requests.filter(r => r.status === 'PENDING').length} pengajuan menunggu`
              : 'Riwayat permohonan cuti Anda'}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> Ajukan Cuti
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit flex-wrap">
        {[
          { value: '', label: 'Semua' },
          { value: 'PENDING', label: 'Menunggu' },
          { value: 'APPROVED', label: 'Disetujui' },
          { value: 'REJECTED', label: 'Ditolak' },
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
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Calendar size={36} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">Belum ada pengajuan cuti</p>
          <p className="text-sm mt-1">Tap "Ajukan Cuti" untuk memulai</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING;
            const typeLabel = LEAVE_TYPES.find(t => t.value === req.type)?.label || req.type;
            return (
              <div key={req.id} className="card">
                <div className="flex items-start gap-3">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    req.status === 'APPROVED' ? 'bg-green-50' :
                    req.status === 'REJECTED' ? 'bg-red-50' :
                    req.status === 'CANCELLED' ? 'bg-gray-100' : 'bg-yellow-50')}>
                    <cfg.icon size={18} className={
                      req.status === 'APPROVED' ? 'text-green-500' :
                      req.status === 'REJECTED' ? 'text-red-500' :
                      req.status === 'CANCELLED' ? 'text-gray-400' : 'text-yellow-500'
                    } />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{typeLabel}</p>
                      <span className={cn('badge', cfg.color)}>{cfg.label}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-sm text-slate-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} className="text-slate-400" />
                        {req.startDate === req.endDate
                          ? formatDate(req.startDate, 'dd MMM yyyy')
                          : `${formatDate(req.startDate, 'dd MMM')} – ${formatDate(req.endDate, 'dd MMM yyyy')}`}
                      </span>
                      <span className="text-slate-500">{req.totalDays} hari kerja</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1 truncate">{req.reason}</p>
                    {req.reviewNote && (
                      <p className="text-xs text-slate-400 mt-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg">
                        Catatan: {req.reviewNote}
                      </p>
                    )}
                    {req.reviewedBy && (
                      <p className="text-xs text-slate-400 mt-1">Diproses oleh: {req.reviewedBy.name}</p>
                    )}
                  </div>
                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      disabled={cancelling === req.id}
                      className="btn-ghost btn-sm text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                      title="Batalkan pengajuan"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <h2 className="text-lg font-bold text-slate-900">Ajukan Cuti</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5" aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Type */}
              <div>
                <label className="label">Jenis Cuti *</label>
                <div className="grid grid-cols-2 gap-2">
                  {LEAVE_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all',
                        form.type === t.value
                          ? 'border-sky-500 bg-sky-50 text-sky-700'
                          : 'border-gray-200 hover:border-sky-200 text-slate-700'
                      )}
                    >
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="text-xs opacity-70 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tanggal Mulai *</label>
                  <input
                    type="date"
                    className="input"
                    min={today}
                    value={form.startDate}
                    onChange={e => setForm(f => ({
                      ...f,
                      startDate: e.target.value,
                      endDate: f.endDate < e.target.value ? e.target.value : f.endDate,
                    }))}
                  />
                </div>
                <div>
                  <label className="label">Tanggal Selesai *</label>
                  <input
                    type="date"
                    className="input"
                    min={form.startDate || today}
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* Work days preview */}
              {form.startDate && form.endDate && (
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
                  workDays > 0 ? 'bg-sky-50 text-sky-700' : 'bg-yellow-50 text-yellow-700'
                )}>
                  {workDays > 0 ? (
                    <><CheckCircle2 size={15} /> {workDays} hari kerja</>
                  ) : (
                    <><AlertCircle size={15} /> Tidak ada hari kerja dalam rentang ini</>
                  )}
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="label">Alasan *</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Jelaskan keperluan cuti Anda..."
                  maxLength={500}
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{form.reason.length}/500</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Batal</button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || workDays === 0 || !form.reason.trim()}
                  className="btn-primary flex-1"
                >
                  <Save size={15} /> {saving ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
