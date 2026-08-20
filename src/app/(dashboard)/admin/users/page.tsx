'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight, X, Save, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, getRoleBadgeColor, getRoleLabel } from '@/lib/utils';
import type { UserProfile, Office, WorkSchedule } from '@/types';

interface UserForm {
  nik: string; name: string; email: string; phone: string;
  position: string; department: string; role: string;
  password: string; managerId: string; officeId: string; workScheduleId: string;
}

const emptyForm: UserForm = {
  nik: '', name: '', email: '', phone: '', position: '',
  department: '', role: 'USER', password: '', managerId: '', officeId: '', workScheduleId: '',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [uRes, oRes, sRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/offices'),
      fetch('/api/work-schedules'),
    ]);
    const [uData, oData, sData] = await Promise.all([uRes.json(), oRes.json(), sRes.json()]);
    if (uData.success) {
      setUsers(uData.data);
      setManagers(uData.data.filter((u: UserProfile) => ['ADMIN', 'MANAGER', 'SPV'].includes(u.role)));
    }
    if (oData.success) setOffices(oData.data);
    if (sData.success) setSchedules(sData.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(user: UserProfile) {
    setEditing(user);
    setForm({
      nik: user.nik, name: user.name, email: user.email || '',
      phone: user.phone || '', position: user.position || '',
      department: user.department || '', role: user.role,
      password: '', managerId: user.managerId || '',
      officeId: user.officeId || '', workScheduleId: user.workScheduleId || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.nik || !form.name || (!editing && !form.password)) {
      toast.error('NIK, nama, dan password (baru) wajib diisi.');
      return;
    }
    setSaving(true);
    const url = editing ? `/api/users/${editing.id}` : '/api/users';
    const method = editing ? 'PUT' : 'POST';
    const body = editing ? { ...form } : form;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(editing ? 'Karyawan diperbarui.' : 'Karyawan ditambahkan.');
      setShowModal(false);
      await load();
    } else {
      toast.error(data.error || 'Gagal menyimpan.');
    }
    setSaving(false);
  }

  async function handleToggle(user: UserProfile) {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(user.isActive ? 'Karyawan dinonaktifkan.' : 'Karyawan diaktifkan.');
      await load();
    } else {
      toast.error(data.error || 'Gagal.');
    }
  }

  const filtered = users.filter((u) =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.nik.toLowerCase().includes(search.toLowerCase()) ||
    u.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Kelola Karyawan</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} karyawan terdaftar</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Tambah Karyawan
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" className="input pl-9" placeholder="Cari nama, NIK, departemen..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="space-y-0.5 p-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Karyawan</th>
                  <th className="text-left px-4 py-3">Departemen</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Atasan</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-200 to-brand-400 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{u.name}</p>
                          <p className="text-xs text-slate-400">{u.nik}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.department || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('badge', getRoleBadgeColor(u.role))}>{getRoleLabel(u.role)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{(u as UserProfile & { manager?: { name: string } }).manager?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('badge', u.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200')}>
                        {u.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} className="btn-ghost btn-sm p-1.5">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleToggle(u)} className="btn-ghost btn-sm p-1.5">
                          {u.isActive ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} className="text-gray-400" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Users size={32} className="mx-auto mb-2 opacity-40" />
                <p>Tidak ada karyawan ditemukan.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? 'Edit Karyawan' : 'Tambah Karyawan'}
              </h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">NIK *</label>
                  <input className="input" value={form.nik} onChange={e => setForm(f => ({ ...f, nik: e.target.value }))} disabled={!!editing} />
                </div>
                <div>
                  <label className="label">Role *</label>
                  <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="USER">Karyawan</option>
                    <option value="SPV">Supervisor</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Nama Lengkap *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">No. HP</label>
                  <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Jabatan</label>
                  <input className="input" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Departemen</label>
                  <input className="input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Atasan (Reports To)</label>
                <select className="input" value={form.managerId} onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))}>
                  <option value="">Tidak Ada</option>
                  {managers.filter(m => m.id !== editing?.id).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({getRoleLabel(m.role)})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Kantor</label>
                  <select className="input" value={form.officeId} onChange={e => setForm(f => ({ ...f, officeId: e.target.value }))}>
                    <option value="">Pilih Kantor</option>
                    {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Jadwal Kerja</label>
                  <select className="input" value={form.workScheduleId} onChange={e => setForm(f => ({ ...f, workScheduleId: e.target.value }))}>
                    <option value="">Pilih Jadwal</option>
                    {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">{editing ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *'}</label>
                <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
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
