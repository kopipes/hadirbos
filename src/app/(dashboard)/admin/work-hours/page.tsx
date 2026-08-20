'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Clock, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import type { WorkSchedule } from '@/types';

interface ScheduleForm {
  name: string; checkInTime: string; checkOutTime: string;
  gracePeriod: string; overtimeAfter: string; workDays: string; officeId: string;
}
const emptyForm: ScheduleForm = {
  name: '', checkInTime: '08:00', checkOutTime: '17:00',
  gracePeriod: '15', overtimeAfter: '30', workDays: '1,2,3,4,5', officeId: '',
};

const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function AdminWorkHoursPage() {
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch('/api/work-schedules');
    const data = await res.json();
    if (data.success) setSchedules(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function toggleDay(day: string) {
    const days = form.workDays.split(',').filter(Boolean);
    const updated = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
    setForm(f => ({ ...f, workDays: updated.join(',') }));
  }

  async function handleSave() {
    if (!form.name || !form.checkInTime || !form.checkOutTime) {
      toast.error('Nama, jam masuk, dan jam pulang wajib diisi.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/work-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        gracePeriod: parseInt(form.gracePeriod) || 15,
        overtimeAfter: parseInt(form.overtimeAfter) || 30,
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success('Jadwal ditambahkan.');
      setShowModal(false);
      setForm(emptyForm);
      await load();
    } else {
      toast.error(data.error || 'Gagal.');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Jadwal Kerja</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> Tambah Jadwal
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const days = s.workDays.split(',').filter(Boolean);
            return (
              <div key={s.id} className="card">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Clock size={22} className="text-brand-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800">{s.name}</h3>
                      <span className={`badge ${s.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {s.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1.5 text-sm text-slate-600">
                      <span>Masuk: <strong>{s.checkInTime}</strong></span>
                      <span>Pulang: <strong>{s.checkOutTime}</strong></span>
                      <span>Toleransi: <strong>{s.gracePeriod} mnt</strong></span>
                      <span>Lembur setelah: <strong>{s.overtimeAfter} mnt</strong></span>
                    </div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {[1,2,3,4,5,6,7].map((d) => (
                        <span key={d} className={`text-xs px-2 py-0.5 rounded-full font-medium ${days.includes(d.toString()) ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
                          {dayNames[d]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {schedules.length === 0 && (
            <div className="card text-center py-12 text-slate-400">
              <Clock size={36} className="mx-auto mb-2 opacity-40" />
              <p>Belum ada jadwal kerja.</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl">
              <h2 className="text-lg font-bold">Tambah Jadwal Kerja</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nama Jadwal *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Reguler (08:00–17:00)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Jam Masuk *</label>
                  <input className="input" type="time" value={form.checkInTime} onChange={e => setForm(f => ({ ...f, checkInTime: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Jam Pulang *</label>
                  <input className="input" type="time" value={form.checkOutTime} onChange={e => setForm(f => ({ ...f, checkOutTime: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Toleransi Terlambat (mnt)</label>
                  <input className="input" type="number" value={form.gracePeriod} onChange={e => setForm(f => ({ ...f, gracePeriod: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Lembur Setelah (mnt)</label>
                  <input className="input" type="number" value={form.overtimeAfter} onChange={e => setForm(f => ({ ...f, overtimeAfter: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Hari Kerja</label>
                <div className="flex gap-2 flex-wrap">
                  {[1,2,3,4,5,6,7].map((d) => {
                    const active = form.workDays.split(',').includes(d.toString());
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d.toString())}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${active ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-gray-200 hover:border-brand-300'}`}
                      >
                        {dayNames[d]}
                      </button>
                    );
                  })}
                </div>
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
