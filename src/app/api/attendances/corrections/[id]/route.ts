import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const body = await req.json();
    const { status } = body; // APPROVED | REJECTED

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return badRequest('Status tidak valid.');
    }

    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id: params.id },
      include: { attendance: true, requestedBy: true },
    });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');

    const updated = await prisma.attendanceCorrection.update({
      where: { id: params.id },
      data: { status, approvedById: authUser.userId },
    });

    // Apply correction if approved
    if (status === 'APPROVED') {
      await prisma.attendance.update({
        where: { id: correction.attendanceId },
        data: {
          ...(correction.newCheckIn ? { checkIn: correction.newCheckIn } : {}),
          ...(correction.newCheckOut ? { checkOut: correction.newCheckOut } : {}),
        },
      });
    }

    // Notify requester
    await prisma.notification.create({
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

    return ok(updated, status === 'APPROVED' ? 'Koreksi disetujui.' : 'Koreksi ditolak.');
  } catch (error) {
    console.error('[PATCH CORRECTION]', error);
    return serverError();
  }
}
