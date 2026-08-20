'use client';

import { useEffect, useState } from 'react';
import { Download, Search, BarChart3, Filter, TrendingUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatDate, formatTime, getStatusBadgeColor, getStatusLabel } from '@/lib/utils';
import type { Attendance } from '@/types';

interface Stats {
  total: number; present: number; absent: number;
  leave: number; late: number; overtime: number; outOfRadius: number;
}

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function loadReport() {
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    if (department) params.set('department', department);
    const res = await fetch(`/api/reports?${params}`);
    const data = await res.json();
    if (data.success) {
      setAttendances(data.data.attendances);
      setStats(data.data.stats);
    } else {
      toast.error(data.error || 'Gagal memuat laporan.');
    }
    setLoading(false);
  }

  useEffect(() => { loadReport(); }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ startDate, endDate, format: 'xlsx' });
      if (department) params.set('department', department);
      const res = await fetch(`/api/reports?${params}`);
      if (!res.ok) { toast.error('Gagal mengekspor.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-absensi-${startDate}-${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Laporan berhasil diexport!');
    } catch {
      toast.error('Gagal mengekspor laporan.');
    } finally {
      setExporting(false);
    }
  }

  const filtered = attendances.filter((a) =>
    !search ||
    a.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.user?.nik?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Laporan Absensi</h1>
        <button onClick={handleExport} disabled={exporting || !attendances.length} className="btn-primary btn-sm">
          <Download size={14} />
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="label">Dari Tanggal</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Sampai Tanggal</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Departemen</label>
            <input type="text" className="input" placeholder="Semua" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <button onClick={loadReport} disabled={loading} className="btn-primary self-end">
            <Filter size={15} /> {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Records', value: stats.total, color: 'text-slate-700 bg-gray-100' },
            { label: 'Hadir', value: stats.present, color: 'text-green-700 bg-green-50' },
            { label: 'Terlambat', value: stats.late, color: 'text-yellow-700 bg-yellow-50' },
            { label: 'Tidak Hadir', value: stats.absent, color: 'text-red-700 bg-red-50' },
            { label: 'Cuti', value: stats.leave, color: 'text-blue-700 bg-blue-50' },
            { label: 'Lembur', value: stats.overtime, color: 'text-purple-700 bg-purple-50' },
            { label: 'Luar Radius', value: stats.outOfRadius, color: 'text-orange-700 bg-orange-50' },
            { label: '% Kehadiran', value: stats.total ? Math.round((stats.present / stats.total) * 100) + '%' : '-', color: 'text-brand-700 bg-brand-50' },
          ].map((s) => (
            <div key={s.label} className={cn('rounded-xl px-4 py-3', s.color)}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs font-medium opacity-75">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Cari nama atau NIK..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="space-y-0.5 p-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <BarChart3 size={36} className="mx-auto mb-2 opacity-40" />
            <p>Tidak ada data untuk filter yang dipilih.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Karyawan</th>
                  <th className="text-left px-4 py-3">Tanggal</th>
                  <th className="text-left px-4 py-3">Masuk</th>
                  <th className="text-left px-4 py-3">Pulang</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Keterlambatan</th>
                  <th className="text-left px-4 py-3">Lembur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5">
                      <p className="font-semibold text-slate-800">{a.user?.name}</p>
                      <p className="text-xs text-slate-400">{a.user?.nik} · {a.user?.department}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {formatDate(a.date, 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      {a.checkIn ? formatTime(a.checkIn) : '-'}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      {a.checkOut ? formatTime(a.checkOut) : '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('badge', getStatusBadgeColor(a.status))}>
                        {getStatusLabel(a.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {a.isLate ? (
                        <span className="text-yellow-700 font-semibold">{a.lateMinutes} mnt</span>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.isOvertime ? (
                        <span className="text-purple-700 font-semibold">{a.overtimeMinutes} mnt</span>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
