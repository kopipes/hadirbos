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

    // Update this approval record
    await prisma.overtimeApproval.update({
      where: { id: params.id },
      data: { status, reviewedById: authUser.userId, notes: notes?.trim() || null },
    });

    // Recalculate attendance overtime from all sibling approvals
    const allApprovals = await prisma.overtimeApproval.findMany({
      where: { attendanceId: overtime.attendanceId },
    });

    const approvedMinutes = allApprovals
      .filter(a => a.id === params.id ? status === 'APPROVED' : a.status === 'APPROVED')
      .reduce((sum, a) => sum + a.overtimeMinutes, 0);

    const statuses = allApprovals.map(a => a.id === params.id ? status : a.status);
    const hasApproved = statuses.some(s => s === 'APPROVED');
    const hasRejected = statuses.some(s => s === 'REJECTED');
    const hasPending = statuses.some(s => s === 'PENDING');

    let overtimeStatus: string;
    if (hasPending) {
      overtimeStatus = 'PENDING';
    } else if (hasApproved && hasRejected) {
      overtimeStatus = 'PARTIAL';
    } else if (hasApproved) {
      overtimeStatus = 'APPROVED';
    } else {
      overtimeStatus = 'REJECTED';
    }

    await prisma.attendance.update({
      where: { id: overtime.attendanceId },
      data: {
        overtimeStatus,
        isOvertime: approvedMinutes > 0,
        overtimeMinutes: approvedMinutes,
      },
    });

    // Notify employee
    const typeLabel = overtime.overtimeType === 'CHECKIN_EARLY' ? 'Datang Lebih Awal' : 'Pulang Terlambat';
    await prisma.notification.create({
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

    return ok(null, status === 'APPROVED' ? 'Lembur disetujui.' : 'Lembur ditolak.');
  } catch (error) {
    console.error('[PATCH OVERTIME]', error);
    return serverError();
  }
}
