'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, CalendarDays, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/utils';
import type { Holiday } from '@/types';

export default function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', isNational: true });
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear().toString();

  async function load() {
    const res = await fetch(`/api/holidays?year=${year}`);
    const data = await res.json();
    if (data.success) setHolidays(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.name || !form.date) { toast.error('Nama dan tanggal wajib diisi.'); return; }
    setSaving(true);
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) {
      toast.success('Hari libur ditambahkan.');
      setShowModal(false);
      setForm({ name: '', date: '', isNational: true });
      await load();
    } else {
      toast.error(data.error || 'Gagal.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus hari libur ini?')) return;
    const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('Dihapus.'); await load(); }
    else toast.error(data.error || 'Gagal menghapus.');
  }

  const byMonth = holidays.reduce<Record<string, Holiday[]>>((acc, h) => {
    const m = h.date.slice(0, 7);
    if (!acc[m]) acc[m] = [];
    acc[m].push(h);
    return acc;
  }, {});

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Hari Libur {year}</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> Tambah
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.keys(byMonth).sort().map((month) => (
            <div key={month}>
              <h2 className="text-sm font-semibold text-slate-500 uppercase mb-2 px-1">
                {new Date(month + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="space-y-2">
                {byMonth[month].map((h) => (
                  <div key={h.id} className="card flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                      <CalendarDays size={18} className="text-red-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{h.name}</p>
                      <p className="text-sm text-slate-500">{formatDate(h.date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {h.isNational && <span className="badge bg-red-50 text-red-600 border-red-200">Nasional</span>}
                      <button onClick={() => handleDelete(h.id)} className="btn-ghost btn-sm p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {holidays.length === 0 && (
            <div className="card text-center py-12 text-slate-400">
              <CalendarDays size={36} className="mx-auto mb-2 opacity-40" />
              <p>Belum ada hari libur terdaftar.</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Tambah Hari Libur</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nama Hari Libur *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Hari Kemerdekaan RI" />
              </div>
              <div>
                <label className="label">Tanggal *</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <input
                  type="checkbox"
                  id="national"
                  checked={form.isNational}
                  onChange={e => setForm(f => ({ ...f, isNational: e.target.checked }))}
                  className="w-4 h-4 accent-brand-500"
                />
                <label htmlFor="national" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Hari Libur Nasional
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  <Save size={15} /> {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
