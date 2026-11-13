import { sessionSchedule } from '@/lib/attendance-time';
import { refreshOvertime, AttendanceError } from '@/lib/attendance-service';
import { correctionError } from '@/lib/attendance-response';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];

    const requests = await prisma.overtimeApproval.findMany({
      where: {
        ...(status && validStatuses.includes(status) ? { status } : {}),
        ...(authUser.role !== 'ADMIN'
          ? { requestedBy: { managerId: authUser.userId } }
          : {}),
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, nik: true, department: true, position: true },
        },
        reviewedBy: { select: { id: true, name: true } },
        attendance: { select: { id: true, date: true, checkIn: true, checkOut: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Include reason field (already in DB, just not in select type)
    return ok(requests);
  } catch (error) {
    console.error('[GET OVERTIME]', error);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { date, overtimeMinutes, reason, overtimeType } = body;

    const validTypes = ['CHECKOUT_LATE', 'CHECKIN_EARLY'];
    const resolvedType: string = validTypes.includes(overtimeType) ? overtimeType : 'CHECKOUT_LATE';

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return badRequest('Tanggal tidak valid. Gunakan format YYYY-MM-DD.');
    }
    if (!Number.isInteger(overtimeMinutes) || overtimeMinutes <= 0) {
      return badRequest('Durasi lembur harus lebih dari 0 menit.');
    }
    if (!reason?.trim()) {
      return badRequest('Alasan lembur wajib diisi untuk pengajuan manual.');
    }

    // Find attendance for that date
    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: authUser.userId, date } },
      include: { user: { include: { workSchedule: true } } },
    });
    if (!attendance) {
      return badRequest('Tidak ada data absen pada tanggal tersebut. Lakukan absen terlebih dahulu.');
    }

    if (resolvedType === 'CHECKOUT_LATE' && !attendance.checkOut) {
      return badRequest('Anda belum absen pulang pada tanggal tersebut.');
    }
    if (resolvedType === 'CHECKIN_EARLY' && !attendance.checkIn) {
      return badRequest('Tidak ada data absen masuk pada tanggal tersebut.');
    }

    const schedule = sessionSchedule(attendance, attendance.user.workSchedule);
    if (resolvedType === 'CHECKIN_EARLY' && (!schedule.start || !attendance.checkIn || attendance.checkIn >= schedule.start)) {
      return badRequest('Tidak ada waktu masuk lebih awal dari jadwal sesi ini.');
    }
    const actualMinutes = resolvedType === 'CHECKIN_EARLY'
      ? schedule.start && attendance.checkIn ? Math.floor((schedule.start.getTime() - attendance.checkIn.getTime()) / 60000) : 0
      : schedule.end && attendance.checkOut ? Math.floor((attendance.checkOut.getTime() - schedule.end.getTime()) / 60000) : 0;
    if (overtimeMinutes > actualMinutes) return badRequest('Durasi pengajuan melebihi waktu yang tercatat pada sesi kerja.');

    // Check if overtime approval already exists for this attendance AND type
    const existing = await prisma.overtimeApproval.findFirst({
      where: { attendanceId: attendance.id, overtimeType: resolvedType },
    });
    if (existing) {
      return badRequest(`Pengajuan lembur ${resolvedType === 'CHECKIN_EARLY' ? 'datang lebih awal' : 'pulang terlambat'} untuk tanggal ini sudah ada. Hubungi atasan untuk review ulang.`);
    }

    // Reuse user data from attendance include
    const user = attendance.user;
    if (!user) return badRequest('User tidak ditemukan.');

    // Fallback to ADMIN if no manager
    let notifyUserId = user.managerId;
    if (!notifyUserId) {
      const admin = await prisma.user.findFirst({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      notifyUserId = admin?.id ?? null;
    }

    const typeLabel = resolvedType === 'CHECKIN_EARLY' ? 'Datang Lebih Awal' : 'Pulang Terlambat';

    // Keep approved totals separate from pending request durations.
    await prisma.$transaction(async tx => {
      if (await tx.overtimeApproval.findFirst({ where: { attendanceId: attendance.id, overtimeType: resolvedType } })) throw new AttendanceError('Pengajuan untuk jenis lembur ini sudah ada.');
      await tx.overtimeApproval.create({ data: { attendanceId: attendance.id, requestedById: authUser.userId, overtimeMinutes, overtimeType: resolvedType, reason: `[${typeLabel}] ${reason.trim()}`, status: 'PENDING' } });
      await refreshOvertime(tx, attendance.id);
    });

    // Notify manager/admin separately (non-critical)
    if (notifyUserId) {
      await prisma.notification.create({
        data: {
          type: 'OVERTIME',
          title: `Pengajuan Lembur - ${typeLabel}`,
          message: `${user.name} mengajukan lembur ${overtimeMinutes} menit (${typeLabel}) pada tanggal ${date}. Alasan: ${reason.trim()}. Menunggu persetujuan Anda.`,
          recipientId: notifyUserId,
          senderId: authUser.userId,
        },
      });
    }

    return ok(null, 'Pengajuan lembur berhasil dikirim. Menunggu persetujuan atasan.');
  } catch (error) {
    return correctionError(error);
  }
}
