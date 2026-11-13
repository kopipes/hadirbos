import { Prisma, type Attendance } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calculateDistance, formatDateTime } from '@/lib/utils';
import { ACTIVE_SESSION, checkInMatchesWorkDate, minutesAfter, scheduleSnapshot, sessionSchedule, workDate } from '@/lib/attendance-time';

export class AttendanceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type Actor = { userId: string; role: string };
type Tx = Prisma.TransactionClient;

export function canReview(actor: Actor, owner: { id: string; managerId: string | null }) {
  return actor.role === 'ADMIN' || (['MANAGER', 'SPV'].includes(actor.role) && owner.managerId === actor.userId && owner.id !== actor.userId);
}

export async function notifyReviewer(tx: Tx, user: { id: string; name: string; managerId: string | null }, data: { type: string; title: string; message: string; metadata?: string }) {
  const recipientId = user.managerId ?? (await tx.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
  if (recipientId) await tx.notification.create({ data: { ...data, recipientId, senderId: user.id } });
}

export async function captureLegacySchedule(tx: Tx, attendance: Attendance, schedule: Parameters<typeof sessionSchedule>[1]) {
  if (attendance.scheduleCaptured) return attendance;
  const data = scheduleSnapshot(attendance.date, schedule ? { ...schedule, checkOutNextDay: schedule.checkOutNextDay || schedule.checkOutTime <= schedule.checkInTime } : null);
  return tx.attendance.update({ where: { id: attendance.id }, data });
}

// Includes unresolved released sessions using their pending proposal as a conservative boundary.
export async function assertNoOverlap(tx: Tx, userId: string, id: string | null, start: Date, end: Date | null, now = new Date()) {
  if (!Number.isFinite(start.getTime()) || start > now || (end && (!Number.isFinite(end.getTime()) || end > now || end <= start))) {
    throw new AttendanceError('Jam harus valid, tidak di masa depan, dan jam pulang harus setelah jam masuk.');
  }
  const others = await tx.attendance.findMany({
    where: { userId, ...(id ? { id: { not: id } } : {}), checkIn: { not: null } },
    include: { corrections: { where: { kind: 'MISSING_CHECKOUT', status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  for (const other of others) {
    const otherStart = other.checkIn!;
    const otherEnd = other.checkOut ?? other.corrections[0]?.newCheckOut;
    // A rejected prior session remains unresolved but must not swallow the newer live session.
    if (!otherEnd && other.checkoutState === 'CORRECTION_REJECTED' && otherStart < start) continue;
    if (start.getTime() === otherStart.getTime() || (otherStart > start ? !end || end > otherStart : !otherEnd || otherEnd > start)) {
      throw new AttendanceError('Waktu absen bertabrakan dengan sesi kerja lain. Periksa tanggal dan jam yang diajukan.');
    }
  }
}

export async function refreshOvertime(tx: Tx, attendanceId: string) {
  const approvals = await tx.overtimeApproval.findMany({ where: { attendanceId } });
  const approvedMinutes = approvals.filter(a => a.status === 'APPROVED').reduce((sum, a) => sum + a.overtimeMinutes, 0);
  const pending = approvals.some(a => a.status === 'PENDING');
  const approved = approvals.some(a => a.status === 'APPROVED');
  const rejected = approvals.some(a => a.status === 'REJECTED');
  return tx.attendance.update({ where: { id: attendanceId }, data: {
    overtimeMinutes: approvedMinutes,
    isOvertime: approvedMinutes > 0 || pending,
    overtimeStatus: pending ? 'PENDING' : approved && rejected ? 'PARTIAL' : approved ? 'APPROVED' : rejected ? 'REJECTED' : 'NONE',
  } });
}

async function syncCheckoutOvertime(tx: Tx, attendance: Attendance, user: { id: string; name: string; managerId: string | null }, end: Date, reason?: string) {
  const schedule = sessionSchedule(attendance);
  const minutes = minutesAfter(end, schedule.end, schedule.overtimeAfter);
  const existing = await tx.overtimeApproval.findFirst({ where: { attendanceId: attendance.id, overtimeType: 'CHECKOUT_LATE' } });
  if (!existing && minutes > 0) {
    await tx.overtimeApproval.create({ data: { attendanceId: attendance.id, requestedById: user.id, overtimeType: 'CHECKOUT_LATE', overtimeMinutes: minutes, reason: reason?.trim() || null } });
    await notifyReviewer(tx, user, { type: 'OVERTIME', title: 'Pengajuan Lembur', message: `${user.name} mengajukan lembur ${minutes} menit untuk tanggal kerja ${attendance.date}. Pulang ${formatDateTime(end)} WIB.` });
  } else if (existing?.status === 'PENDING') {
    if (minutes > 0) await tx.overtimeApproval.update({ where: { id: existing.id }, data: { overtimeMinutes: minutes } });
    else await tx.overtimeApproval.delete({ where: { id: existing.id } });
  }
  await refreshOvertime(tx, attendance.id);
}

export async function recordAttendance(actor: Actor, input: { type: 'checkin' | 'checkout'; attendanceId?: string; photo: string; latitude: number; longitude: number; address?: string; reason?: string }, now = new Date()) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: actor.userId }, include: { office: true, workSchedule: true } });
    if (!user?.isActive) throw new AttendanceError('Akun tidak aktif atau tidak ditemukan.', 403);
    const isOutOfRadius = !!user.office && calculateDistance(input.latitude, input.longitude, user.office.latitude, user.office.longitude) > user.office.radius;
    if (input.type === 'checkin') {
      const blockers = await tx.attendance.count({ where: { userId: user.id, checkIn: { not: null }, checkOut: null, checkoutState: { in: ['OPEN', 'CORRECTION_REJECTED'] } } });
      if (blockers) throw new AttendanceError('Selesaikan sesi sebelumnya atau ajukan koreksi jam pulang sebelum absen masuk lagi.');
      const date = workDate(now, user.workSchedule);
      const snapshot = scheduleSnapshot(date, user.workSchedule);
      const lateMinutes = minutesAfter(now, snapshot.scheduledCheckIn, snapshot.gracePeriodSnapshot ?? 0);
      await assertNoOverlap(tx, user.id, null, now, null, now);
      const attendance = await tx.attendance.create({ data: {
        userId: user.id, date, ...snapshot, openSessionKey: user.id, checkoutState: 'OPEN', checkIn: now,
        checkInPhoto: input.photo, checkInLat: input.latitude, checkInLng: input.longitude, checkInAddress: input.address?.trim() || null,
        isLate: lateMinutes > 0, lateMinutes, isOutOfRadius, status: 'PRESENT',
      } });
      if (lateMinutes > 0) await notifyReviewer(tx, user, { type: 'LATE_CHECKIN', title: 'Karyawan Terlambat', message: `${user.name} terlambat ${lateMinutes} menit (masuk ${formatDateTime(now)} WIB).` });
      if (isOutOfRadius) await notifyReviewer(tx, user, { type: 'OUT_OF_RADIUS', title: 'Absen di Luar Radius', message: `${user.name} melakukan absen masuk di luar radius kantor.` });
      return attendance;
    }
    const sessions = await tx.attendance.findMany({ where: { userId: user.id, ...ACTIVE_SESSION }, take: 2 });
    if (sessions.length !== 1) throw new AttendanceError(sessions.length ? 'Ada beberapa sesi terbuka. Hubungi admin untuk koreksi.' : 'Tidak ada sesi kerja aktif untuk absen pulang.');
    let attendance = sessions[0];
    if (!input.attendanceId || input.attendanceId !== attendance.id) throw new AttendanceError('Sesi kerja berubah. Muat ulang halaman absen sebelum melanjutkan.');
    attendance = await captureLegacySchedule(tx, attendance, user.workSchedule);
    const schedule = sessionSchedule(attendance);
    if (schedule.end && now < schedule.end) {
      const permission = await tx.earlyLeave.findUnique({ where: { attendanceId: attendance.id } });
      if (permission?.status !== 'APPROVED') throw new AttendanceError('Belum waktunya pulang. Ajukan izin pulang awal terlebih dahulu.');
    }
    await assertNoOverlap(tx, user.id, attendance.id, attendance.checkIn!, now, now);
    const updated = await tx.attendance.updateMany({ where: { id: attendance.id, ...ACTIVE_SESSION }, data: {
      checkOut: now, checkoutState: 'CLOSED', openSessionKey: null, needsReview: false,
      checkOutPhoto: input.photo, checkOutLat: input.latitude, checkOutLng: input.longitude, checkOutAddress: input.address?.trim() || null,
      isOutOfRadius: attendance.isOutOfRadius || isOutOfRadius,
    } });
    if (updated.count !== 1) throw new AttendanceError('Sesi ini sudah diproses. Muat ulang halaman.', 409);
    await syncCheckoutOvertime(tx, attendance, user, now, input.reason);
    return tx.attendance.findUniqueOrThrow({ where: { id: attendance.id } });
  }, { timeout: 15000 });
}

function parseTime(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new AttendanceError('Tanggal dan jam harus menyertakan zona waktu.');
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) throw new AttendanceError('Tanggal atau jam tidak valid.');
  return time;
}

export async function requestCorrection(actor: Actor, input: { attendanceId: string; newCheckIn?: unknown; newCheckOut?: unknown; reason: string; kind?: string }, now = new Date()) {
  const newCheckIn = parseTime(input.newCheckIn);
  const newCheckOut = parseTime(input.newCheckOut);
  if (!input.reason?.trim() || (!newCheckIn && !newCheckOut)) throw new AttendanceError('Alasan dan minimal satu waktu koreksi wajib diisi.');
  return prisma.$transaction(async tx => {
    const attendance = await tx.attendance.findUnique({ where: { id: input.attendanceId }, include: { user: { include: { workSchedule: true } } } });
    if (!attendance) throw new AttendanceError('Data absen tidak ditemukan.');
    if (!attendance.user.isActive) throw new AttendanceError('Akun karyawan tidak aktif.', 403);
    if (attendance.userId !== actor.userId && !canReview(actor, attendance.user)) throw new AttendanceError('Tidak memiliki akses.', 403);
    if (await tx.attendanceCorrection.findFirst({ where: { attendanceId: attendance.id, status: 'PENDING' } })) throw new AttendanceError('Masih ada koreksi yang menunggu persetujuan untuk sesi ini.');
    const resolving = !!attendance.checkIn && !attendance.checkOut && !!newCheckOut;
    if (input.kind === 'MISSING_CHECKOUT' && !resolving) throw new AttendanceError('Pengajuan lupa pulang harus memiliki jam pulang untuk sesi yang belum selesai.');
    if (!attendance.checkOut && attendance.checkoutState !== 'OPEN' && !resolving) throw new AttendanceError('Isi jam pulang sebenarnya untuk menyelesaikan sesi ini.');
    const start = newCheckIn ?? attendance.checkIn;
    if (!start) throw new AttendanceError('Jam masuk wajib tersedia.');
    if (newCheckIn && !checkInMatchesWorkDate(attendance, newCheckIn, attendance.user.workSchedule)) throw new AttendanceError('Koreksi jam masuk harus tetap pada tanggal kerja sesi ini. Hubungi Admin jika tanggal kerja salah.');
    await assertNoOverlap(tx, attendance.userId, attendance.id, start, newCheckOut ?? attendance.checkOut, now);
    const correction = await tx.attendanceCorrection.create({ data: {
      attendanceId: attendance.id, requestedById: actor.userId, oldCheckIn: attendance.checkIn, oldCheckOut: attendance.checkOut,
      newCheckIn, newCheckOut, reason: input.reason.trim(), kind: resolving ? 'MISSING_CHECKOUT' : 'TIME_CHANGE',
    } });
    if (resolving) await tx.attendance.update({ where: { id: attendance.id }, data: { checkoutState: 'CORRECTION_PENDING', openSessionKey: null, needsReview: true } });
    await notifyReviewer(tx, attendance.user, { type: 'CORRECTION_REQUEST', title: resolving ? 'Pengajuan Lupa Absen Pulang' : 'Permintaan Koreksi Absen', message: `${attendance.user.name} mengajukan koreksi tanggal kerja ${attendance.date}. Alasan: ${input.reason.trim()}` });
    return correction;
  }, { timeout: 15000 });
}

export async function reviewCorrection(actor: Actor, id: string, status: string, reviewNote?: string, now = new Date()) {
  if (!['APPROVED', 'REJECTED'].includes(status)) throw new AttendanceError('Status tidak valid.');
  if (status === 'REJECTED' && !reviewNote?.trim()) throw new AttendanceError('Alasan penolakan wajib diisi.');
  return prisma.$transaction(async tx => {
    const correction = await tx.attendanceCorrection.findUnique({ where: { id }, include: { attendance: { include: { user: { include: { workSchedule: true } } } } } });
    if (!correction) throw new AttendanceError('Koreksi tidak ditemukan.');
    const { user } = correction.attendance;
    if (!canReview(actor, user)) throw new AttendanceError('Hanya atasan karyawan atau Admin yang dapat memproses koreksi.', 403);
    if (correction.status !== 'PENDING') throw new AttendanceError('Koreksi sudah diproses.', 409);
    let attendance = correction.attendance as Attendance;
    if (status === 'APPROVED' && ((correction.newCheckIn && attendance.checkIn?.getTime() !== correction.oldCheckIn?.getTime()) || (correction.newCheckOut && attendance.checkOut?.getTime() !== correction.oldCheckOut?.getTime()))) throw new AttendanceError('Waktu yang dikoreksi berubah sejak pengajuan. Tolak pengajuan ini lalu ajukan ulang berdasarkan data terbaru.', 409);
    if (status === 'APPROVED') {
      const start = correction.newCheckIn ?? attendance.checkIn;
      const end = correction.newCheckOut ?? attendance.checkOut;
      if (!start) throw new AttendanceError('Jam masuk wajib tersedia.');
      if (correction.newCheckIn && !checkInMatchesWorkDate(attendance, correction.newCheckIn, user.workSchedule)) throw new AttendanceError('Koreksi jam masuk berada di luar tanggal kerja sesi ini.');
      await assertNoOverlap(tx, attendance.userId, attendance.id, start, end, now);
      attendance = await captureLegacySchedule(tx, attendance, user.workSchedule);
      const schedule = sessionSchedule(attendance);
      const lateMinutes = minutesAfter(start, schedule.start, schedule.grace);
      await tx.attendance.update({ where: { id: attendance.id }, data: {
        checkIn: start, checkOut: end, lateMinutes, isLate: lateMinutes > 0,
        ...(end ? { checkoutState: 'CLOSED', openSessionKey: null, needsReview: false } : {}),
      } });
      if (end) await syncCheckoutOvertime(tx, attendance, user, end, correction.reason);
    } else if (correction.kind === 'MISSING_CHECKOUT' && !attendance.checkOut) {
      await tx.attendance.update({ where: { id: attendance.id }, data: { checkoutState: 'CORRECTION_REJECTED', openSessionKey: null, needsReview: true } });
    }
    await tx.attendanceCorrection.update({ where: { id }, data: { status, approvedById: actor.userId, reviewNote: reviewNote?.trim() || null } });
    await tx.notification.create({ data: {
      type: status === 'APPROVED' ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED',
      title: status === 'APPROVED' ? 'Koreksi Absen Disetujui' : 'Koreksi Absen Ditolak',
      message: `Koreksi tanggal kerja ${attendance.date} ${status === 'APPROVED' ? 'disetujui' : 'ditolak'}.${reviewNote ? ` Catatan: ${reviewNote.trim()}` : ''}`,
      recipientId: attendance.userId, senderId: actor.userId,
    } });
  }, { timeout: 15000 });
}
