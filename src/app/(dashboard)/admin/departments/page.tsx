'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, X, Save, Building2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface Department {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DeptForm {
  name: string;
  description: string;
  isActive: boolean;
}

const emptyForm: DeptForm = { name: '', description: '', isActive: true };

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DeptForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    const res = await fetch('/api/departments?activeOnly=false');
    const data = await res.json();
    if (data.success) setDepartments(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(dept: Department) {
    setEditing(dept);
    setForm({ name: dept.name, description: dept.description || '', isActive: dept.isActive });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nama departemen wajib diisi.'); return; }
    setSaving(true);
    const url = editing ? `/api/departments/${editing.id}` : '/api/departments';
    const method = editing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(editing ? 'Departemen diperbarui.' : 'Departemen ditambahkan.');
      setShowModal(false);
      await load();
    } else {
      toast.error(data.error || 'Gagal menyimpan.');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/departments/${deleteTarget.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success('Departemen berhasil dihapus.');
      setDeleteTarget(null);
      await load();
    } else {
      toast.error(data.error || 'Gagal menghapus.');
    }
    setDeleting(false);
  }

  const filtered = departments.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const active = filtered.filter(d => d.isActive);
  const inactive = filtered.filter(d => !d.isActive);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Departemen</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {departments.filter(d => d.isActive).length} departemen aktif
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Tambah Departemen
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Cari departemen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active departments */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
              Aktif ({active.length})
            </h2>
            <div className="space-y-2">
              {active.map((dept) => (
                <DeptRow
                  key={dept.id}
                  dept={dept}
                  onEdit={() => openEdit(dept)}
                  onDelete={() => setDeleteTarget(dept)}
                />
              ))}
              {active.length === 0 && (
                <p className="text-sm text-slate-400 px-1">Tidak ada departemen aktif.</p>
              )}
            </div>
          </div>

          {/* Inactive departments */}
          {inactive.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                Nonaktif ({inactive.length})
              </h2>
              <div className="space-y-2">
                {inactive.map((dept) => (
                  <DeptRow
                    key={dept.id}
                    dept={dept}
                    onEdit={() => openEdit(dept)}
                    onDelete={() => setDeleteTarget(dept)}
                  />
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="card text-center py-12 text-slate-400">
              <Building2 size={36} className="mx-auto mb-2 opacity-40" />
              <p>Tidak ada departemen ditemukan.</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? 'Edit Departemen' : 'Tambah Departemen'}
              </h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nama Departemen *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Contoh: Engineering"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Deskripsi</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Deskripsi singkat departemen (opsional)"
                />
              </div>
              {editing && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <input
                    type="checkbox"
                    id="deptActive"
                    checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 accent-sky-500"
                  />
                  <label htmlFor="deptActive" className="text-sm font-medium text-slate-700 cursor-pointer">
                    Departemen Aktif
                  </label>
                </div>
              )}
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-slide-up">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 text-center">Hapus Departemen?</h2>
              <p className="text-slate-500 text-sm text-center mt-2">
                Departemen <strong className="text-slate-800">{deleteTarget.name}</strong> akan dihapus permanen.
                Karyawan yang terdaftar di departemen ini tidak akan ikut terhapus.
              </p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1" disabled={deleting}>
                  Batal
                </button>
                <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
                  <Trash2 size={15} /> {deleting ? 'Menghapus...' : 'Hapus'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeptRow({
  dept,
  onEdit,
  onDelete,
}: {
  dept: Department;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn('card flex items-center gap-4 py-3.5', !dept.isActive && 'opacity-60')}>
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
        dept.isActive ? 'bg-sky-50' : 'bg-gray-100'
      )}>
        <Building2 size={18} className={dept.isActive ? 'text-sky-500' : 'text-gray-400'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-800">{dept.name}</p>
          {!dept.isActive && (
            <span className="badge bg-gray-100 text-gray-500 border-gray-200 text-xs">Nonaktif</span>
          )}
        </div>
        {dept.description && (
          <p className="text-sm text-slate-500 truncate mt-0.5">{dept.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onEdit} className="btn-ghost btn-sm p-1.5" title="Edit">
          <Edit2 size={14} />
        </button>
        <button onClick={onDelete} className="btn-ghost btn-sm p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50" title="Hapus">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
