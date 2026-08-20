'use client';

import { useEffect, useState } from 'react';
import { User, Edit2, Save, X, LogOut, Fingerprint } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, getRoleBadgeColor, getRoleLabel } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@/types';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', password: '' });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setProfile(d.data);
          setForm({ name: d.data.name, email: d.data.email || '', phone: d.data.phone || '', address: d.data.address || '', password: '' });
        }
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    const res = await fetch(`/api/users/${profile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) {
      setProfile({ ...profile, ...form });
      setEditing(false);
      toast.success('Profil berhasil diperbarui.');
    } else {
      toast.error(data.error || 'Gagal menyimpan.');
    }
    setSaving(false);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading) {
    return <div className="max-w-lg mx-auto space-y-4 animate-pulse">
      <div className="h-32 bg-gray-200 rounded-2xl" />
      <div className="h-64 bg-gray-200 rounded-2xl" />
    </div>;
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Hero */}
      <div className="card bg-gradient-to-br from-brand-500 to-brand-700 text-white border-0">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-2xl">
            {profile?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold">{profile?.name}</h2>
            <p className="text-brand-100 text-sm">{profile?.position || profile?.department || 'Karyawan'}</p>
            <span className="mt-1 inline-block text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
              {getRoleLabel(profile?.role || 'USER')}
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Data Diri</h3>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="btn-secondary btn-sm">
              <Edit2 size={14} /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="btn-ghost btn-sm"><X size={14} /></button>
              <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
                <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <InfoRow label="NIK" value={profile?.nik} />
          {editing ? (
            <>
              <div>
                <label className="label">Nama</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">No. HP</label>
                <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Alamat</label>
                <textarea className="input" rows={3} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="label">Password Baru (kosongkan jika tidak diubah)</label>
                <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              </div>
            </>
          ) : (
            <>
              <InfoRow label="Nama" value={profile?.name} />
              <InfoRow label="Email" value={profile?.email || '-'} />
              <InfoRow label="No. HP" value={profile?.phone || '-'} />
              <InfoRow label="Alamat" value={profile?.address || '-'} />
              <InfoRow label="Jabatan" value={profile?.position || '-'} />
              <InfoRow label="Departemen" value={profile?.department || '-'} />
              <InfoRow label="Atasan" value={profile?.manager?.name || '-'} />
              <InfoRow label="Kantor" value={profile?.office?.name || '-'} />
              <InfoRow label="Jadwal" value={profile?.workSchedule ? `${profile.workSchedule.name} (${profile.workSchedule.checkInTime} - ${profile.workSchedule.checkOutTime})` : '-'} />
            </>
          )}
        </div>
      </div>

      {/* Logout */}
      <button onClick={handleLogout} className="btn-danger w-full btn-lg">
        <LogOut size={18} /> Keluar
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">{value || '-'}</span>
    </div>
  );
}
