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

    const requests = await prisma.earlyLeave.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(authUser.role !== 'ADMIN'
          ? { user: { managerId: authUser.userId } }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, nik: true, department: true, position: true } },
        reviewedBy: { select: { id: true, name: true } },
        attendance: { select: { id: true, date: true, checkIn: true, checkOut: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return ok(requests);
  } catch (error) {
    console.error('[GET EARLY LEAVE]', error);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { reason, estimatedOut } = body;

    if (!reason?.trim()) return badRequest('Alasan wajib diisi.');

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    // Must have checked in today
    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: authUser.userId, date: dateStr } },
    });
    if (!attendance) return badRequest('Anda belum melakukan absen masuk hari ini.');
    if (attendance.checkOut) return badRequest('Anda sudah melakukan absen pulang hari ini.');

    // Check no pending/approved early leave for today already
    const existing = await prisma.earlyLeave.findUnique({
      where: { attendanceId: attendance.id },
    });
    if (existing) {
      if (existing.status === 'PENDING') return badRequest('Anda sudah memiliki pengajuan izin pulang yang sedang menunggu persetujuan.');
      if (existing.status === 'APPROVED') return badRequest('Izin pulang awal Anda sudah disetujui. Silakan checkout sekarang.');
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { name: true, managerId: true },
    });
    if (!user) return badRequest('User tidak ditemukan.');

    const earlyLeave = await prisma.earlyLeave.create({
      data: {
        userId: authUser.userId,
        attendanceId: attendance.id,
        reason: reason.trim(),
        estimatedOut: estimatedOut || null,
        status: 'PENDING',
      },
    });

    // Notify manager/SPV immediately
    if (user.managerId) {
      await prisma.notification.create({
        data: {
          type: 'EARLY_LEAVE_REQUEST',
          title: 'Izin Pulang Awal',
          message: `${user.name} mengajukan izin pulang awal hari ini${estimatedOut ? ` (estimasi pukul ${estimatedOut})` : ''}. Alasan: ${reason.trim()}`,
          recipientId: user.managerId,
          senderId: authUser.userId,
        },
      });
    }

    return ok(earlyLeave, 'Pengajuan izin pulang awal berhasil dikirim. Menunggu persetujuan atasan.');
  } catch (error) {
    console.error('[POST EARLY LEAVE]', error);
    return serverError();
  }
}
