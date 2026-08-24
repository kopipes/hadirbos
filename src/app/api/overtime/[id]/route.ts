import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const body = await req.json();
    const { status, notes } = body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return badRequest('Status tidak valid. Gunakan APPROVED atau REJECTED.');
    }

    const overtime = await prisma.overtimeApproval.findUnique({
      where: { id: params.id },
      include: { attendance: true, requestedBy: true },
    });
    if (!overtime) return badRequest('Data lembur tidak ditemukan.');

    // Only ADMIN can re-review already processed requests
    if (overtime.status !== 'PENDING' && authUser.role !== 'ADMIN') {
      return badRequest('Lembur ini sudah diproses. Hanya ADMIN yang dapat mengubah keputusan.');
    }

    // Wrap all mutations in a transaction to prevent partial updates
    await prisma.$transaction([
      prisma.overtimeApproval.update({
        where: { id: params.id },
        data: { status, reviewedById: authUser.userId, notes: notes?.trim() || null },
      }),
      prisma.attendance.update({
        where: { id: overtime.attendanceId },
        data: {
          overtimeStatus: status,
          ...(status === 'REJECTED' ? { isOvertime: false, overtimeMinutes: 0 } : {}),
        },
      }),
      prisma.notification.create({
        data: {
          type: status === 'APPROVED' ? 'OVERTIME' : 'SYSTEM',
          title: status === 'APPROVED' ? 'Lembur Disetujui' : 'Lembur Ditolak',
          message: status === 'APPROVED'
            ? `Lembur Anda pada tanggal ${overtime.attendance.date} (${overtime.overtimeMinutes} menit) telah disetujui.`
            : `Lembur Anda pada tanggal ${overtime.attendance.date} ditolak.${notes ? ` Catatan: ${notes}` : ''}`,
          recipientId: overtime.requestedById,
          senderId: authUser.userId,
        },
      }),
    ]);

    return ok(null, status === 'APPROVED' ? 'Lembur disetujui.' : 'Lembur ditolak.');
  } catch (error) {
    console.error('[PATCH OVERTIME]', error);
    return serverError();
  }
}
