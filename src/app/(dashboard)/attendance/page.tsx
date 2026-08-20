'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, MapPin, CheckCircle2, XCircle, Loader2, Clock, History, AlertTriangle } from 'lucide-react';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { cn, formatTime, formatDate, getStatusBadgeColor, getStatusLabel } from '@/lib/utils';
import type { Attendance } from '@/types';

type Tab = 'checkin' | 'history';

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>('checkin');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [locationError, setLocationError] = useState('');
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    loadTodayAttendance();
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.success) setUserId(d.data.id); });
    // Auto-get location
    getLocation();
  }, []);

  async function loadTodayAttendance() {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`/api/attendances?date=${today}`);
    const data = await res.json();
    if (data.success && data.data.length > 0) {
      setTodayAttendance(data.data[0]);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await fetch(`/api/attendances?startDate=${start}&endDate=${end}`);
    const data = await res.json();
    if (data.success) setHistory(data.data);
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab]);

  function getLocation() {
    setLocating(true);
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Browser tidak mendukung GPS.');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng });
        setLocating(false);
        // Reverse geocode (simple)
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          setLocation({ lat, lng, address: d.display_name?.split(',').slice(0, 3).join(', ') });
        } catch { /* ignore */ }
      },
      (err) => {
        setLocationError(
          err.code === 1
            ? 'Izin lokasi ditolak. Silakan aktifkan GPS di browser.'
            : 'Gagal mendapatkan lokasi. Pastikan GPS aktif.'
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  const canCheckIn = !todayAttendance?.checkIn;
  const canCheckOut = todayAttendance?.checkIn && !todayAttendance?.checkOut;

  async function handleAttendance(type: 'checkin' | 'checkout') {
    if (!location) {
      toast.error('Lokasi belum terdeteksi. Tap "Perbarui Lokasi".');
      return;
    }
    if (!webcamRef.current) {
      toast.error('Kamera belum siap.');
      return;
    }

    const photo = webcamRef.current.getScreenshot();
    if (!photo) {
      toast.error('Gagal mengambil foto. Pastikan kamera aktif.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/attendances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          photo,
          latitude: location.lat,
          longitude: location.lng,
          address: location.address,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Absen gagal.');
        return;
      }
      toast.success(type === 'checkin' ? 'Absen masuk berhasil!' : 'Absen pulang berhasil!');
      await loadTodayAttendance();
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-2xl">
        <button
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all', tab === 'checkin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
          onClick={() => setTab('checkin')}
        >
          <span className="flex items-center justify-center gap-1.5"><Clock size={15} /> Absen</span>
        </button>
        <button
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all', tab === 'history' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
          onClick={() => setTab('history')}
        >
          <span className="flex items-center justify-center gap-1.5"><History size={15} /> Riwayat</span>
        </button>
      </div>

      {tab === 'checkin' && (
        <div className="space-y-4 animate-fade-in">
          {/* Today status */}
          {todayAttendance && (
            <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-100">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500 flex-shrink-0" size={20} />
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">Status Hari Ini</p>
                  <div className="flex gap-4 mt-1 text-sm text-slate-600">
                    {todayAttendance.checkIn && (
                      <span>Masuk: <strong>{formatTime(todayAttendance.checkIn)}</strong></span>
                    )}
                    {todayAttendance.checkOut && (
                      <span>Pulang: <strong>{formatTime(todayAttendance.checkOut)}</strong></span>
                    )}
                  </div>
                  {(todayAttendance.isLate || todayAttendance.isOutOfRadius) && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {todayAttendance.isLate && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                          Terlambat {todayAttendance.lateMinutes} mnt
                        </span>
                      )}
                      {todayAttendance.isOutOfRadius && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <AlertTriangle size={11} /> Di luar radius
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Camera */}
          <div className="card p-0 overflow-hidden">
            <div className="relative bg-slate-900 aspect-[4/3] flex items-center justify-center">
              {!cameraError ? (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user', width: 480, height: 360 }}
                  className="w-full h-full object-cover camera-preview"
                  onUserMedia={() => setCameraReady(true)}
                  onUserMediaError={(e) => {
                    setCameraError(typeof e === 'string' ? e : 'Izin kamera ditolak.');
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400 p-6 text-center">
                  <CameraOff size={36} />
                  <p className="text-sm">{cameraError}</p>
                  <button onClick={() => setCameraError('')} className="btn-secondary btn-sm">Coba Lagi</button>
                </div>
              )}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                  <Loader2 className="animate-spin text-white" size={32} />
                </div>
              )}
              {/* Face guide overlay */}
              {cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-40 h-48 rounded-full border-2 border-white/50 border-dashed" />
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="card">
            <div className="flex items-start gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                location ? 'bg-green-50' : locationError ? 'bg-red-50' : 'bg-gray-100')}>
                <MapPin size={18} className={location ? 'text-green-500' : locationError ? 'text-red-500' : 'text-slate-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Lokasi</p>
                {locating ? (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <Loader2 size={12} className="animate-spin" /> Mencari lokasi...
                  </p>
                ) : location ? (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}</p>
                ) : (
                  <p className="text-xs text-red-500 mt-0.5">{locationError || 'Lokasi tidak tersedia'}</p>
                )}
              </div>
              <button onClick={getLocation} className="btn-secondary btn-sm flex-shrink-0" disabled={locating}>
                {locating ? <Loader2 size={14} className="animate-spin" /> : 'Perbarui'}
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleAttendance('checkin')}
              disabled={!canCheckIn || loading || !cameraReady || !location}
              className={cn(
                'btn btn-lg flex-col gap-1 h-auto py-4',
                canCheckIn && cameraReady && location
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={24} />}
              <span>Absen Masuk</span>
            </button>
            <button
              onClick={() => handleAttendance('checkout')}
              disabled={!canCheckOut || loading || !cameraReady || !location}
              className={cn(
                'btn btn-lg flex-col gap-1 h-auto py-4',
                canCheckOut && cameraReady && location
                  ? 'bg-success-500 text-white hover:bg-success-600 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <XCircle size={24} />}
              <span>Absen Pulang</span>
            </button>
          </div>

          {!cameraReady && !cameraError && (
            <p className="text-center text-xs text-slate-400">Memuat kamera, harap tunggu...</p>
          )}
          {!location && !locating && !locationError && (
            <p className="text-center text-xs text-yellow-600 bg-yellow-50 rounded-xl py-2 px-3">
              GPS diperlukan untuk absen. Pastikan izin lokasi aktif.
            </p>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3 animate-fade-in">
          <h2 className="section-title">Riwayat 30 Hari Terakhir</h2>
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-slate-400">Belum ada riwayat absensi.</p>
            </div>
          ) : (
            history.map((a) => (
              <div key={a.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="text-center w-10 flex-shrink-0">
                    <p className="text-xs text-slate-400 uppercase">{new Date(a.date).toLocaleDateString('id-ID', { weekday: 'short' })}</p>
                    <p className="text-lg font-bold text-slate-800">{new Date(a.date).getDate()}</p>
                    <p className="text-xs text-slate-400">{new Date(a.date).toLocaleDateString('id-ID', { month: 'short' })}</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('badge', getStatusBadgeColor(a.status))}>
                        {getStatusLabel(a.status)}
                      </span>
                      {a.isLate && <span className="badge bg-yellow-50 text-yellow-700 border-yellow-200">Terlambat</span>}
                      {a.isOvertime && <span className="badge bg-purple-50 text-purple-700 border-purple-200">Lembur</span>}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-sm text-slate-600">
                      <span>Masuk: <strong>{a.checkIn ? formatTime(a.checkIn) : '-'}</strong></span>
                      <span>Pulang: <strong>{a.checkOut ? formatTime(a.checkOut) : '-'}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
