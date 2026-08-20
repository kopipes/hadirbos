'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, MapPin, X, Save, Wifi } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Office } from '@/types';

interface OfficeForm {
  name: string; address: string; latitude: string; longitude: string; radius: string;
}
const emptyForm: OfficeForm = { name: '', address: '', latitude: '', longitude: '', radius: '200' };

export default function AdminOfficesPage() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Office | null>(null);
  const [form, setForm] = useState<OfficeForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  async function load() {
    const res = await fetch('/api/offices');
    const data = await res.json();
    if (data.success) setOffices(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(office: Office) {
    setEditing(office);
    setForm({
      name: office.name, address: office.address || '',
      latitude: office.latitude.toString(), longitude: office.longitude.toString(),
      radius: office.radius.toString(),
    });
    setShowModal(true);
  }

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        toast.success('Koordinat berhasil didapat!');
      },
      () => { toast.error('Gagal mendapat lokasi.'); setLocating(false); }
    );
  }

  async function handleSave() {
    if (!form.name || !form.latitude || !form.longitude) {
      toast.error('Nama, latitude, dan longitude wajib diisi.');
      return;
    }
    setSaving(true);
    const url = editing ? `/api/offices/${editing.id}` : '/api/offices';
    const method = editing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, address: form.address,
        latitude: parseFloat(form.latitude), longitude: parseFloat(form.longitude),
        radius: parseInt(form.radius) || 200,
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(editing ? 'Lokasi diperbarui.' : 'Lokasi ditambahkan.');
      setShowModal(false);
      await load();
    } else {
      toast.error(data.error || 'Gagal menyimpan.');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Lokasi Kantor</h1>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Tambah Lokasi</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {offices.map((o) => (
            <div key={o.id} className="card flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                <MapPin size={22} className="text-brand-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800">{o.name}</h3>
                  <span className={`badge ${o.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {o.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{o.address || 'Alamat belum diset'}</p>
                <div className="flex gap-3 mt-1 text-xs text-slate-400">
                  <span>Lat: {o.latitude}</span>
                  <span>Lng: {o.longitude}</span>
                  <span className="flex items-center gap-1"><Wifi size={11} /> Radius: {o.radius}m</span>
                </div>
              </div>
              <button onClick={() => openEdit(o)} className="btn-secondary btn-sm">
                <Edit2 size={14} /> Edit
              </button>
            </div>
          ))}
          {offices.length === 0 && (
            <div className="card text-center py-12 text-slate-400">
              <MapPin size={36} className="mx-auto mb-2 opacity-40" />
              <p>Belum ada lokasi kantor.</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? 'Edit Lokasi' : 'Tambah Lokasi'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nama Kantor *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kantor Pusat" />
              </div>
              <div>
                <label className="label">Alamat</label>
                <textarea className="input" rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Jl. Sudirman No. 1..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Latitude *</label>
                  <input className="input" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="-6.2088" />
                </div>
                <div>
                  <label className="label">Longitude *</label>
                  <input className="input" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="106.8456" />
                </div>
              </div>
              <button onClick={useMyLocation} disabled={locating} className="btn-secondary btn-sm w-full">
                <MapPin size={14} /> {locating ? 'Mengambil lokasi...' : 'Gunakan Lokasi Saya Sekarang'}
              </button>
              <div>
                <label className="label">Radius (meter)</label>
                <input className="input" type="number" value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))} />
                <p className="text-xs text-slate-400 mt-1">Karyawan wajib berada dalam radius ini saat absen.</p>
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
