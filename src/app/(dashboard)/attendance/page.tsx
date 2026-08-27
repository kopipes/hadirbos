'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CameraOff, MapPin, CheckCircle2, XCircle, Loader2, Clock, History, AlertTriangle, LogOut, X, Save, Edit2 } from 'lucide-react';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { cn, formatTime, formatDate, getStatusBadgeColor, getStatusLabel } from '@/lib/utils';
import type { Attendance } from '@/types';

type Tab = 'checkin' | 'history';

interface EarlyLeaveStatus {
  id: string;
  status: string; // PENDING | APPROVED | REJECTED
  reason: string;
  estimatedOut?: string | null;
}

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
  const [hasSchedule, setHasSchedule] = useState<boolean>(true);
  const [scheduleEndTime, setScheduleEndTime] = useState<string>('17:00');
  const [scheduleStartTime, setScheduleStartTime] = useState<string>('08:00');
  const [overtimeAfterMinutes, setOvertimeAfterMinutes] = useState<number>(30);

  // Manual overtime request state
  const [showManualOvertimeModal, setShowManualOvertimeModal] = useState(false);
  const [manualOvertimeTarget, setManualOvertimeTarget] = useState<Attendance | null>(null);
  const [manualOvertimeMinutes, setManualOvertimeMinutes] = useState('');
  const [manualOvertimeReason, setManualOvertimeReason] = useState('');
  const [manualOvertimeType, setManualOvertimeType] = useState<'CHECKOUT_LATE' | 'CHECKIN_EARLY'>('CHECKOUT_LATE');
  const [submittingManualOvertime, setSubmittingManualOvertime] = useState(false);

  // Early leave state
  const [earlyLeave, setEarlyLeave] = useState<EarlyLeaveStatus | null>(null);
  const [showEarlyLeaveModal, setShowEarlyLeaveModal] = useState(false);
  const [earlyLeaveReason, setEarlyLeaveReason] = useState('');
  const [earlyLeaveEstTime, setEarlyLeaveEstTime] = useState('');
  const [submittingEarlyLeave, setSubmittingEarlyLeave] = useState(false);

  // Correction state
  const [correctionTarget, setCorrectionTarget] = useState<Attendance | null>(null);
  const [correctionForm, setCorrectionForm] = useState({ newCheckIn: '', newCheckOut: '', reason: '' });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Overtime reason state
  const [showOvertimeReasonModal, setShowOvertimeReasonModal] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState('');
  const [pendingCheckout, setPendingCheckout] = useState(false);

  const webcamRef = useRef<Webcam>(null);

  const loadTodayAttendance = useCallback(async () => {
    const today = getTodayWib();
    try {
      const res = await fetch(`/api/attendances?date=${today}&self=true`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setTodayAttendance(data.data[0]);
      } else {
        setTodayAttendance(null);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTodayAttendance();
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setHasSchedule(!!d.data.workScheduleId);
        if (d.data.workSchedule?.checkOutTime) {
          setScheduleEndTime(d.data.workSchedule.checkOutTime);
        }
        if (d.data.workSchedule?.checkInTime) {
          setScheduleStartTime(d.data.workSchedule.checkInTime);
        }
        if (d.data.workSchedule?.overtimeAfter) {
          setOvertimeAfterMinutes(d.data.workSchedule.overtimeAfter);
        }
      }
    });
    getLocation();
  }, [loadTodayAttendance]);

  // Load early leave status when attendance is loaded
  useEffect(() => {
    if (todayAttendance && !todayAttendance.checkOut) {
      fetch('/api/early-leave?status=&self=true')
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            const todayEL = d.data.find((el: EarlyLeaveStatus & { attendance: { id: string } }) =>
              el.attendance?.id === todayAttendance.id
            );
            setEarlyLeave(todayEL || null);
          }
        })
        .catch(() => {});
    } else {
      setEarlyLeave(null);
    }
  }, [todayAttendance]);

  async function loadHistory() {
    setHistoryLoading(true);
    const end = getTodayWib();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const start = new Date(startDate.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/attendances?startDate=${start}&endDate=${end}&self=true`);
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch { /* ignore */ }
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

  // Determine if current time is before scheduled end time (early checkout territory)
  // Uses WIB (UTC+7) to match server timezone
  function isEarlyCheckout(): boolean {
    const nowUtc = Date.now();
    const nowWib = new Date(nowUtc + 7 * 60 * 60 * 1000);
    const [h, m] = scheduleEndTime.split(':').map(Number);
    const endWib = new Date(nowWib);
    endWib.setUTCHours(h, m, 0, 0);
    return nowWib < endWib;
  }

  // Get today's date string in WIB (UTC+7)
  function getTodayWib(): string {
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return nowWib.toISOString().split('T')[0];
  }

  const canCheckIn = !todayAttendance?.checkIn;
  // Can checkout if: checked in, not checked out, AND (time is normal OR early leave approved)
  const earlyLeaveApproved = earlyLeave?.status === 'APPROVED';
  const canCheckOut = !!(todayAttendance?.checkIn && !todayAttendance?.checkOut &&
    (!isEarlyCheckout() || earlyLeaveApproved || !hasSchedule));

  async function handleAttendance(type: 'checkin' | 'checkout', overtimeReasonText?: string) {
    if (!location) { toast.error('Lokasi belum terdeteksi. Tap "Perbarui Lokasi".'); return; }
    if (!webcamRef.current) { toast.error('Kamera belum siap.'); return; }
    const photo = webcamRef.current.getScreenshot();
    if (!photo) { toast.error('Gagal mengambil foto. Pastikan kamera aktif.'); return; }

    // If checkout and will be overtime, show reason modal first
    if (type === 'checkout' && hasSchedule && isEarlyCheckout() === false) {
      // Check if this checkout will trigger overtime
      const now = new Date();
      const [h, m] = scheduleEndTime.split(':').map(Number);
      const schedEnd = new Date(now);
      schedEnd.setHours(h, m, 0, 0);
      const thresholdMs = schedEnd.getTime() + overtimeAfterMinutes * 60_000;
      const willBeOvertime = now.getTime() > thresholdMs;

      if (willBeOvertime && overtimeReasonText === undefined) {
        // Show modal to collect reason
        setShowOvertimeReasonModal(true);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/attendances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, photo,
          latitude: location.lat,
          longitude: location.lng,
          address: location.address,
          reason: overtimeReasonText || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { toast.error(data.error || 'Absen gagal.'); return; }
      toast.success(type === 'checkin' ? 'Absen masuk berhasil!' : 'Absen pulang berhasil!');
      setShowOvertimeReasonModal(false);
      setOvertimeReason('');
      await loadTodayAttendance();
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCorrectionSubmit() {
    if (!correctionTarget) return;
    if (!correctionForm.reason.trim()) { toast.error('Alasan wajib diisi.'); return; }
    if (!correctionForm.newCheckIn && !correctionForm.newCheckOut) {
      toast.error('Isi minimal satu waktu yang dikoreksi (masuk atau pulang).');
      return;
    }
    setSubmittingCorrection(true);
    try {
      const res = await fetch('/api/attendances/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceId: correctionTarget.id,
          newCheckIn: correctionForm.newCheckIn
            ? new Date(`${correctionTarget.date}T${correctionForm.newCheckIn}:00+07:00`).toISOString()
            : null,
          newCheckOut: correctionForm.newCheckOut
            ? new Date(`${correctionTarget.date}T${correctionForm.newCheckOut}:00+07:00`).toISOString()
            : null,
          reason: correctionForm.reason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Permintaan koreksi berhasil dikirim!');
        setCorrectionTarget(null);
        setCorrectionForm({ newCheckIn: '', newCheckOut: '', reason: '' });
        await loadHistory();
      } else {
        toast.error(data.error || 'Gagal mengajukan koreksi.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setSubmittingCorrection(false);
    }
  }

  async function handleManualOvertimeSubmit() {
    if (!manualOvertimeTarget) return;
    const minutes = parseInt(manualOvertimeMinutes, 10);
    if (!minutes || minutes <= 0) { toast.error('Durasi lembur harus lebih dari 0 menit.'); return; }
    if (!manualOvertimeReason.trim()) { toast.error('Alasan lembur wajib diisi.'); return; }
    setSubmittingManualOvertime(true);
    try {
      const res = await fetch('/api/overtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: manualOvertimeTarget.date,
          overtimeMinutes: minutes,
          reason: manualOvertimeReason.trim(),
          overtimeType: manualOvertimeType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Pengajuan lembur berhasil dikirim!');
        setShowManualOvertimeModal(false);
        setManualOvertimeTarget(null);
        setManualOvertimeMinutes('');
        setManualOvertimeReason('');
        await loadHistory();
      } else {
        toast.error(data.error || 'Gagal mengajukan lembur.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setSubmittingManualOvertime(false);
    }
  }

  async function handleEarlyLeaveSubmit() {
    if (!earlyLeaveReason.trim()) { toast.error('Alasan wajib diisi.'); return; }
    setSubmittingEarlyLeave(true);
    try {
      const res = await fetch('/api/early-leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: earlyLeaveReason, estimatedOut: earlyLeaveEstTime || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Pengajuan izin pulang awal berhasil dikirim!');
        setShowEarlyLeaveModal(false);
        setEarlyLeaveReason('');
        setEarlyLeaveEstTime('');
        // Reload to get updated early leave status
        await loadTodayAttendance();
      } else {
        toast.error(data.error || 'Gagal mengajukan izin.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setSubmittingEarlyLeave(false);
    }
  }

  const showEarlyLeaveButton = !!(
    todayAttendance?.checkIn &&
    !todayAttendance?.checkOut &&
    hasSchedule &&
    isEarlyCheckout() &&
    !earlyLeave
  );

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
                    {todayAttendance.checkIn && <span>Masuk: <strong>{formatTime(todayAttendance.checkIn)}</strong></span>}
                    {todayAttendance.checkOut && <span>Pulang: <strong>{formatTime(todayAttendance.checkOut)}</strong></span>}
                  </div>
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
                </div>
              </div>
            </div>
          )}

          {/* Early leave status banner */}
          {earlyLeave && (
            <div className={cn('card border flex items-start gap-3',
              earlyLeave.status === 'PENDING' ? 'bg-yellow-50 border-yellow-200' :
              earlyLeave.status === 'APPROVED' ? 'bg-green-50 border-green-200' :
              'bg-red-50 border-red-200')}>
              <LogOut size={18} className={cn('flex-shrink-0 mt-0.5',
                earlyLeave.status === 'PENDING' ? 'text-yellow-500' :
                earlyLeave.status === 'APPROVED' ? 'text-green-500' : 'text-red-500')} />
              <div>
                <p className={cn('text-sm font-semibold',
                  earlyLeave.status === 'PENDING' ? 'text-yellow-800' :
                  earlyLeave.status === 'APPROVED' ? 'text-green-800' : 'text-red-800')}>
                  {earlyLeave.status === 'PENDING' && 'Izin pulang awal menunggu persetujuan'}
                  {earlyLeave.status === 'APPROVED' && 'Izin pulang awal disetujui — silakan absen pulang'}
                  {earlyLeave.status === 'REJECTED' && 'Izin pulang awal ditolak'}
                </p>
                <p className="text-xs mt-0.5 text-slate-600">Alasan: {earlyLeave.reason}</p>
                {earlyLeave.estimatedOut && (
                  <p className="text-xs text-slate-500">Est. pulang: {earlyLeave.estimatedOut}</p>
                )}
              </div>
            </div>
          )}

          {/* No schedule warning */}
          {!hasSchedule && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <p>Jadwal kerja belum diatur. Absensi tetap bisa dilakukan, namun keterlambatan dan lembur tidak akan dihitung otomatis. Hubungi admin.</p>
            </div>
          )}

          {/* Camera */}
            <div className="card p-0 overflow-hidden">
            <div className="relative bg-slate-900 aspect-[4/3] max-h-64 sm:max-h-none flex items-center justify-center">
              {!cameraError ? (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user', width: 480, height: 360 }}
                  className="w-full h-full object-cover camera-preview"
                  onUserMedia={() => setCameraReady(true)}
                  onUserMediaError={(e) => setCameraError(typeof e === 'string' ? e : 'Izin kamera ditolak.')}
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
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Loader2 size={12} className="animate-spin" /> Mencari lokasi...</p>
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
              className={cn('btn btn-lg flex-col gap-1 h-auto py-4',
                canCheckIn && cameraReady && location
                  ? 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed')}
            >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={24} />}
              <span>Absen Masuk</span>
            </button>
            <button
              onClick={() => handleAttendance('checkout')}
              disabled={!canCheckOut || loading || !cameraReady || !location}
              className={cn('btn btn-lg flex-col gap-1 h-auto py-4',
                canCheckOut && cameraReady && location
                  ? 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed')}
            >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <XCircle size={24} />}
              <span>Absen Pulang</span>
            </button>
          </div>

          {/* Early checkout blocked hint */}
          {todayAttendance?.checkIn && !todayAttendance?.checkOut && hasSchedule && isEarlyCheckout() && !earlyLeaveApproved && (
            <p className="text-center text-xs text-slate-500 bg-gray-50 rounded-xl py-2 px-3">
              Belum waktunya pulang (jadwal: {scheduleEndTime}). Ajukan izin pulang awal jika perlu.
            </p>
          )}

          {/* Izin pulang awal button */}
          {showEarlyLeaveButton && (
            <button
              onClick={() => setShowEarlyLeaveModal(true)}
              className="w-full btn-secondary flex items-center justify-center gap-2 py-3"
            >
              <LogOut size={16} />
              Ajukan Izin Pulang Awal
            </button>
          )}

          {!cameraReady && !cameraError && (
            <p className="text-center text-xs text-slate-400">Memuat kamera, harap tunggu...</p>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3 animate-fade-in">
          <h2 className="section-title">Riwayat 30 Hari Terakhir</h2>
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('badge', getStatusBadgeColor(a.status))}>{getStatusLabel(a.status)}</span>
                      {a.isLate && <span className="badge bg-yellow-50 text-yellow-700 border-yellow-200">Terlambat</span>}
                      {a.isOvertime && a.overtimeStatus === 'PENDING' && <span className="badge bg-yellow-50 text-yellow-700 border-yellow-200">Lembur (Menunggu)</span>}
                      {a.isOvertime && a.overtimeStatus === 'APPROVED' && <span className="badge bg-purple-50 text-purple-700 border-purple-200">Lembur (Disetujui)</span>}
                      {a.isOvertime && a.overtimeStatus === 'REJECTED' && <span className="badge bg-red-50 text-red-700 border-red-200">Lembur (Ditolak)</span>}
                      {a.notes?.includes('Izin pulang awal') && <span className="badge bg-blue-50 text-blue-700 border-blue-200">Izin Pulang Awal</span>}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-sm text-slate-600">
                      <span>Masuk: <strong>{a.checkIn ? formatTime(a.checkIn) : '-'}</strong></span>
                      <span>Pulang: <strong>{a.checkOut ? formatTime(a.checkOut) : '-'}</strong></span>
                    </div>
                    {a.notes && <p className="text-xs text-slate-400 mt-1 truncate">{a.notes}</p>}
                  </div>
                  {/* Correction button */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        setCorrectionTarget(a);
                        setCorrectionForm({
                          newCheckIn: a.checkIn ? formatTime(a.checkIn) : '',
                          newCheckOut: a.checkOut ? formatTime(a.checkOut) : '',
                          reason: '',
                        });
                      }}
                      className="btn-ghost btn-sm p-1.5 text-slate-400 hover:text-sky-500"
                      title="Ajukan koreksi"
                    >
                      <Edit2 size={14} />
                    </button>
                    {/* Manual overtime button — show if checked out and no overtime approval yet */}
                    {a.checkOut && a.overtimeStatus === 'NONE' && (
                      <button
                        onClick={() => {
                          setManualOvertimeTarget(a);
                          setManualOvertimeMinutes('');
                          setManualOvertimeReason('');
                          setManualOvertimeType('CHECKOUT_LATE');
                          setShowManualOvertimeModal(true);
                        }}
                        className="btn-ghost btn-sm p-1.5 text-slate-400 hover:text-purple-500"
                        title="Ajukan lembur manual"
                      >
                        <Clock size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Overtime Reason Modal */}
      {showOvertimeReasonModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Keterangan Lembur</h2>
                <p className="text-sm text-slate-500">Anda pulang melebihi jam kerja</p>
              </div>
              <button onClick={() => setShowOvertimeReasonModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-xl text-sm text-purple-700">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <p>Lembur Anda akan otomatis diajukan ke atasan untuk disetujui. Isi alasan lembur agar atasan bisa memproses dengan lebih cepat.</p>
              </div>
              <div>
                <label className="label">Alasan Lembur (opsional)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={overtimeReason}
                  onChange={e => setOvertimeReason(e.target.value)}
                  placeholder="Contoh: Menyelesaikan laporan bulanan, meeting dengan klien..."
                  maxLength={300}
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{overtimeReason.length}/300</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowOvertimeReasonModal(false)}
                  className="btn-secondary flex-1"
                >
                  Batal
                </button>
                <button
                  onClick={() => handleAttendance('checkout', overtimeReason)}
                  disabled={loading}
                  className="btn-primary flex-1"
                >
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Memproses...</> : 'Absen Pulang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Correction Request Modal */}
      {correctionTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Ajukan Koreksi Absen</h2>
                <p className="text-sm text-slate-500">{formatDate(correctionTarget.date, 'dd MMM yyyy')}</p>
              </div>
              <button onClick={() => setCorrectionTarget(null)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <p>Koreksi akan dikirim ke atasan Anda untuk disetujui. Data absen baru berlaku setelah disetujui.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Jam Masuk Baru</label>
                  <input
                    type="time"
                    className="input"
                    value={correctionForm.newCheckIn}
                    onChange={e => setCorrectionForm(f => ({ ...f, newCheckIn: e.target.value }))}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Saat ini: {correctionTarget.checkIn ? formatTime(correctionTarget.checkIn) : '-'}
                  </p>
                </div>
                <div>
                  <label className="label">Jam Pulang Baru</label>
                  <input
                    type="time"
                    className="input"
                    value={correctionForm.newCheckOut}
                    onChange={e => setCorrectionForm(f => ({ ...f, newCheckOut: e.target.value }))}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Saat ini: {correctionTarget.checkOut ? formatTime(correctionTarget.checkOut) : '-'}
                  </p>
                </div>
              </div>

              <div>
                <label className="label">Alasan Koreksi *</label>
                <textarea
                  className="input"
                  rows={3}
                  value={correctionForm.reason}
                  onChange={e => setCorrectionForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Jelaskan alasan koreksi absen..."
                  maxLength={300}
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{correctionForm.reason.length}/300</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setCorrectionTarget(null)} className="btn-secondary flex-1">Batal</button>
                <button
                  onClick={handleCorrectionSubmit}
                  disabled={submittingCorrection || !correctionForm.reason.trim() || (!correctionForm.newCheckIn && !correctionForm.newCheckOut)}
                  className="btn-primary flex-1"
                >
                  <Save size={15} /> {submittingCorrection ? 'Mengirim...' : 'Kirim Koreksi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Early Leave Request Modal */}
      {showEarlyLeaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Ajukan Izin Pulang Awal</h2>
              <button onClick={() => setShowEarlyLeaveModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <p>Pengajuan akan langsung dikirim ke atasan Anda. Tombol absen pulang akan aktif setelah disetujui.</p>
              </div>

              <div>
                <label className="label">Alasan *</label>
                <textarea
                  className="input"
                  rows={3}
                  value={earlyLeaveReason}
                  onChange={e => setEarlyLeaveReason(e.target.value)}
                  placeholder="Contoh: Anak sakit, harus ke dokter..."
                  maxLength={300}
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{earlyLeaveReason.length}/300</p>
              </div>

              <div>
                <label className="label">Estimasi Jam Pulang (opsional)</label>
                <input
                  type="time"
                  className="input"
                  value={earlyLeaveEstTime}
                  onChange={e => setEarlyLeaveEstTime(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowEarlyLeaveModal(false)} className="btn-secondary flex-1">Batal</button>
                <button
                  onClick={handleEarlyLeaveSubmit}
                  disabled={submittingEarlyLeave || !earlyLeaveReason.trim()}
                  className="btn-primary flex-1"
                >
                  <Save size={15} /> {submittingEarlyLeave ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Manual Overtime Request Modal */}
      {showManualOvertimeModal && manualOvertimeTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Ajukan Lembur Manual</h2>
                <p className="text-sm text-slate-500">{formatDate(manualOvertimeTarget.date, 'dd MMM yyyy')}</p>
              </div>
              <button onClick={() => setShowManualOvertimeModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-xl text-sm text-purple-700">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <p>Pengajuan lembur manual akan dikirim ke atasan untuk disetujui. Alasan wajib diisi.</p>
              </div>

              {/* Overtime type toggle */}
              <div>
                <label className="label">Jenis Lembur</label>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setManualOvertimeType('CHECKOUT_LATE');
                      setManualOvertimeMinutes('');
                    }}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                      manualOvertimeType === 'CHECKOUT_LATE'
                        ? 'bg-white shadow-sm text-slate-900'
                        : 'text-slate-500'
                    )}
                  >
                    Pulang Terlambat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualOvertimeType('CHECKIN_EARLY');
                      // Auto-suggest duration from checkIn vs scheduleStartTime
                      if (manualOvertimeTarget?.checkIn) {
                        const checkInDate = new Date(manualOvertimeTarget.checkIn);
                        const [h, m] = scheduleStartTime.split(':').map(Number);
                        const scheduled = new Date(checkInDate);
                        scheduled.setHours(h, m, 0, 0);
                        const diffMin = Math.round((scheduled.getTime() - checkInDate.getTime()) / 60000);
                        if (diffMin > 0) setManualOvertimeMinutes(String(diffMin));
                      }
                    }}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                      manualOvertimeType === 'CHECKIN_EARLY'
                        ? 'bg-white shadow-sm text-slate-900'
                        : 'text-slate-500'
                    )}
                  >
                    Datang Lebih Awal
                  </button>
                </div>
                {/* Context info */}
                <p className="text-xs text-slate-400 mt-1.5">
                  {manualOvertimeType === 'CHECKIN_EARLY'
                    ? `Jadwal masuk: ${scheduleStartTime}${manualOvertimeTarget?.checkIn ? ` · Absen masuk: ${new Date(manualOvertimeTarget.checkIn).toTimeString().slice(0, 5)}` : ''}`
                    : `Jadwal pulang: ${scheduleEndTime}${manualOvertimeTarget?.checkOut ? ` · Absen pulang: ${new Date(manualOvertimeTarget.checkOut).toTimeString().slice(0, 5)}` : ''}`}
                </p>
              </div>

              <div>
                <label className="label">Durasi Lembur (menit)</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={480}
                  value={manualOvertimeMinutes}
                  onChange={e => setManualOvertimeMinutes(e.target.value)}
                  placeholder="Contoh: 60"
                />
              </div>
              <div>
                <label className="label">Alasan Lembur (wajib)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={manualOvertimeReason}
                  onChange={e => setManualOvertimeReason(e.target.value)}
                  placeholder={manualOvertimeType === 'CHECKIN_EARLY'
                    ? 'Contoh: Persiapan presentasi pagi, setup server sebelum jam kerja...'
                    : 'Contoh: Menyelesaikan laporan bulanan, meeting dengan klien...'}
                  maxLength={300}
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{manualOvertimeReason.length}/300</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowManualOvertimeModal(false)} className="btn-secondary flex-1">Batal</button>
                <button
                  onClick={handleManualOvertimeSubmit}
                  disabled={submittingManualOvertime || !manualOvertimeMinutes || !manualOvertimeReason.trim()}
                  className="btn-primary flex-1"
                >
                  <Save size={15} /> {submittingManualOvertime ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
