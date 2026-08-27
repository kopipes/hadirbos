import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { calculateLateMinutes, calculateOvertimeMinutes } from '@/lib/utils';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id: params.id },
      include: { attendance: true, requestedBy: true },
    });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');
    return ok(correction);
  } catch (error) {
    console.error('[GET CORRECTION]', error);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const body = await req.json();
    const { status } = body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return badRequest('Status tidak valid.');
    }

    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id: params.id },
      include: { attendance: true, requestedBy: true },
    });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');
    if (correction.status !== 'PENDING') {
      return badRequest('Koreksi ini sudah diproses sebelumnya.');
    }

    // Wrap all mutations in a transaction
    const updateCorrection = prisma.attendanceCorrection.update({
      where: { id: params.id },
      data: { status, approvedById: authUser.userId },
    });

    const createNotification = prisma.notification.create({
      data: {
        type: status === 'APPROVED' ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED',
        title: status === 'APPROVED' ? 'Koreksi Absen Disetujui' : 'Koreksi Absen Ditolak',
        message: status === 'APPROVED'
          ? `Permintaan koreksi absen Anda untuk tanggal ${correction.attendance.date} telah disetujui.`
          : `Permintaan koreksi absen Anda untuk tanggal ${correction.attendance.date} ditolak.`,
        recipientId: correction.requestedById,
        senderId: authUser.userId,
      },
    });

    if (status === 'APPROVED') {
      // Determine final checkIn/checkOut after correction
      const newCheckIn = correction.newCheckIn ?? correction.attendance.checkIn;
      const newCheckOut = correction.newCheckOut ?? correction.attendance.checkOut;

      // Recalculate late and overtime if user has a work schedule
      const user = await prisma.user.findUnique({
        where: { id: correction.requestedById },
        include: { workSchedule: true },
      });

      let lateData = {};
      let overtimeData = {};

      if (user?.workSchedule) {
        const ws = user.workSchedule;

        // Recalculate late minutes from new checkIn
        if (newCheckIn) {
          const checkInDate = new Date(Number(newCheckIn));
          const lateMinutes = calculateLateMinutes(checkInDate, ws.checkInTime, ws.gracePeriod);
          lateData = { isLate: lateMinutes > 0, lateMinutes };
        }

        // Recalculate overtime from new checkOut
        // Only recalculate if no APPROVED overtime approval exists (respect manager decision)
        const approvedOvertime = await prisma.overtimeApproval.findFirst({
          where: { attendanceId: correction.attendanceId, status: 'APPROVED' },
        });

        if (!approvedOvertime && newCheckOut) {
          const checkOutDate = new Date(Number(newCheckOut));
          const overtimeMinutes = calculateOvertimeMinutes(checkOutDate, ws.checkOutTime, ws.overtimeAfter);
          overtimeData = {
            isOvertime: overtimeMinutes > 0,
            overtimeMinutes,
            overtimeStatus: overtimeMinutes > 0 ? 'NONE' : 'NONE',
          };
        } else if (approvedOvertime) {
          // Keep approved overtime as-is — manager already decided
          overtimeData = {};
        } else if (!approvedOvertime && !newCheckOut) {
          // No checkout after correction — reset overtime
          overtimeData = { isOvertime: false, overtimeMinutes: 0, overtimeStatus: 'NONE' };
        }
      }

      await prisma.$transaction([
        updateCorrection,
        createNotification,
        prisma.attendance.update({
          where: { id: correction.attendanceId },
          data: {
            ...(correction.newCheckIn ? { checkIn: correction.newCheckIn } : {}),
            ...(correction.newCheckOut ? { checkOut: correction.newCheckOut } : {}),
            ...lateData,
            ...overtimeData,
          },
        }),
      ]);
    } else {
      await prisma.$transaction([updateCorrection, createNotification]);
    }

    return ok(null, status === 'APPROVED' ? 'Koreksi disetujui.' : 'Koreksi ditolak.');
  } catch (error) {
    console.error('[PATCH CORRECTION]', error);
    return serverError();
  }
}
