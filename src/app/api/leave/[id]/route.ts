import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, nik: true, department: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    if (!leave) return badRequest('Pengajuan cuti tidak ditemukan.');
    // Users can only view their own
    if (authUser.role === 'USER' && leave.userId !== authUser.userId) return forbidden();
    return ok(leave);
  } catch (error) {
    console.error('[GET LEAVE ID]', error);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { status, reviewNote } = body;

    const leave = await prisma.leaveRequest.findUnique({
      where: { id: params.id },
      include: { user: { select: { id: true, name: true, managerId: true } } },
    });
    if (!leave) return badRequest('Pengajuan cuti tidak ditemukan.');

    // Cancellation by the user themselves
    if (status === 'CANCELLED') {
      if (leave.userId !== authUser.userId) return forbidden();
      if (!['PENDING'].includes(leave.status)) {
        return badRequest('Hanya pengajuan berstatus Menunggu yang dapat dibatalkan.');
      }
      await prisma.leaveRequest.update({
        where: { id: params.id },
        data: { status: 'CANCELLED' },
      });
      return ok(null, 'Pengajuan cuti dibatalkan.');
    }

    // Approval/rejection by manager/SPV/admin
    if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return badRequest('Status tidak valid.');
    }
    if (leave.status !== 'PENDING') {
      return badRequest('Pengajuan ini sudah diproses sebelumnya.');
    }

    const typeLabel: Record<string, string> = {
      ANNUAL: 'Cuti Tahunan', SICK: 'Cuti Sakit', MATERNITY: 'Cuti Melahirkan',
      PATERNITY: 'Cuti Ayah', PERMISSION: 'Izin', OTHER: 'Cuti Lainnya',
    };

    if (status === 'APPROVED') {
      // Build attendance upserts for each working day in the range
      const attendanceOps = [];
      const cur = new Date(leave.startDate);
      const end = new Date(leave.endDate);

      while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) {
          const dateStr = cur.toISOString().split('T')[0];
          attendanceOps.push(
            prisma.attendance.upsert({
              where: { userId_date: { userId: leave.userId, date: dateStr } },
              create: {
                userId: leave.userId,
                date: dateStr,
                status: 'LEAVE',
                notes: `${typeLabel[leave.type] || leave.type}: ${leave.reason}`,
              },
              update: {
                status: 'LEAVE',
                notes: `${typeLabel[leave.type] || leave.type}: ${leave.reason}`,
              },
            })
          );
        }
        cur.setDate(cur.getDate() + 1);
      }

      // All in one transaction: update leave + upsert attendances + notify
      await prisma.$transaction([
        prisma.leaveRequest.update({
          where: { id: params.id },
          data: { status: 'APPROVED', reviewedById: authUser.userId, reviewNote: reviewNote?.trim() || null },
        }),
        ...attendanceOps,
        prisma.notification.create({
          data: {
            type: 'LEAVE_APPROVED',
            title: 'Cuti Disetujui',
            message: `${typeLabel[leave.type] || leave.type} Anda pada ${leave.startDate}${leave.startDate !== leave.endDate ? ` s/d ${leave.endDate}` : ''} (${leave.totalDays} hari) telah disetujui.`,
            recipientId: leave.userId,
            senderId: authUser.userId,
          },
        }),
      ]);
    } else {
      // REJECTED — just update leave + notify, no attendance changes
      await prisma.$transaction([
        prisma.leaveRequest.update({
          where: { id: params.id },
          data: { status: 'REJECTED', reviewedById: authUser.userId, reviewNote: reviewNote?.trim() || null },
        }),
        prisma.notification.create({
          data: {
            type: 'LEAVE_REJECTED',
            title: 'Cuti Ditolak',
            message: `${typeLabel[leave.type] || leave.type} Anda pada ${leave.startDate}${leave.startDate !== leave.endDate ? ` s/d ${leave.endDate}` : ''} ditolak.${reviewNote ? ` Catatan: ${reviewNote}` : ''}`,
            recipientId: leave.userId,
            senderId: authUser.userId,
          },
        }),
      ]);
    }

    return ok(null, status === 'APPROVED' ? 'Cuti disetujui.' : 'Cuti ditolak.');
  } catch (error) {
    console.error('[PATCH LEAVE]', error);
    return serverError();
  }
}
