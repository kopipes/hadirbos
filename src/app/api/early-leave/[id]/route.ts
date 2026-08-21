import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const body = await req.json();
    const { status, reviewNote } = body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return badRequest('Status tidak valid.');
    }

    const earlyLeave = await prisma.earlyLeave.findUnique({
      where: { id: params.id },
      include: {
        attendance: true,
        user: { select: { id: true, name: true } },
      },
    });
    if (!earlyLeave) return badRequest('Data izin pulang tidak ditemukan.');
    if (earlyLeave.status !== 'PENDING') {
      return badRequest('Pengajuan ini sudah diproses sebelumnya.');
    }

    if (status === 'APPROVED') {
      // Wrap in transaction: update early leave + update attendance notes + notify
      await prisma.$transaction([
        prisma.earlyLeave.update({
          where: { id: params.id },
          data: { status: 'APPROVED', reviewedById: authUser.userId, reviewNote: reviewNote?.trim() || null },
        }),
        // Mark attendance as permission-allowed checkout + add reason as notes
        prisma.attendance.update({
          where: { id: earlyLeave.attendanceId },
          data: {
            notes: `Izin pulang awal: ${earlyLeave.reason}${reviewNote ? ` | Catatan atasan: ${reviewNote}` : ''}`,
          },
        }),
        prisma.notification.create({
          data: {
            type: 'EARLY_LEAVE_APPROVED',
            title: 'Izin Pulang Awal Disetujui',
            message: `Izin pulang awal Anda pada tanggal ${earlyLeave.attendance.date} telah disetujui. Silakan lakukan absen pulang sekarang.`,
            recipientId: earlyLeave.userId,
            senderId: authUser.userId,
          },
        }),
      ]);
    } else {
      // REJECTED
      await prisma.$transaction([
        prisma.earlyLeave.update({
          where: { id: params.id },
          data: { status: 'REJECTED', reviewedById: authUser.userId, reviewNote: reviewNote?.trim() || null },
        }),
        prisma.notification.create({
          data: {
            type: 'EARLY_LEAVE_REJECTED',
            title: 'Izin Pulang Awal Ditolak',
            message: `Izin pulang awal Anda pada tanggal ${earlyLeave.attendance.date} ditolak.${reviewNote ? ` Catatan: ${reviewNote}` : ''}`,
            recipientId: earlyLeave.userId,
            senderId: authUser.userId,
          },
        }),
      ]);
    }

    return ok(null, status === 'APPROVED' ? 'Izin pulang awal disetujui.' : 'Izin pulang awal ditolak.');
  } catch (error) {
    console.error('[PATCH EARLY LEAVE]', error);
    return serverError();
  }
}
