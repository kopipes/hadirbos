import { canReview, refreshOvertime, AttendanceError } from '@/lib/attendance-service';
import { correctionError } from '@/lib/attendance-response';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest } from '@/lib/api';

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

    await prisma.$transaction(async tx => {
      const overtime = await tx.overtimeApproval.findUnique({
        where: { id: params.id },
        include: { attendance: true, requestedBy: true },
      });
      if (!overtime) throw new AttendanceError('Data lembur tidak ditemukan.');
      if (!canReview(authUser, overtime.requestedBy)) throw new AttendanceError('Tidak memiliki akses untuk meninjau pengajuan ini.', 403);

      // Only ADMIN can re-review already processed requests
      if (overtime.status !== 'PENDING' && authUser.role !== 'ADMIN') {
        throw new AttendanceError('Lembur ini sudah diproses. Hanya ADMIN yang dapat mengubah keputusan.');
      }

      // Update this approval record
      await tx.overtimeApproval.update({
        where: { id: params.id },
        data: { status, reviewedById: authUser.userId, notes: notes?.trim() || null },
      });

      await refreshOvertime(tx, overtime.attendanceId);

      // Notify employee
      const typeLabel = overtime.overtimeType === 'CHECKIN_EARLY' ? 'Datang Lebih Awal' : 'Pulang Terlambat';
      await tx.notification.create({
        data: {
          type: status === 'APPROVED' ? 'OVERTIME' : 'SYSTEM',
          title: status === 'APPROVED' ? `Lembur Disetujui (${typeLabel})` : `Lembur Ditolak (${typeLabel})`,
          message: status === 'APPROVED'
            ? `Lembur ${typeLabel} Anda pada tanggal ${overtime.attendance.date} (${overtime.overtimeMinutes} menit) telah disetujui.`
            : `Lembur ${typeLabel} Anda pada tanggal ${overtime.attendance.date} ditolak.${notes ? ` Catatan: ${notes}` : ''}`,
          recipientId: overtime.requestedById,
          senderId: authUser.userId,
        },
      });

    });
    return ok(null, status === 'APPROVED' ? 'Lembur disetujui.' : 'Lembur ditolak.');
  } catch (error) {
    return correctionError(error);
  }
}
