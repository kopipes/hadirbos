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
    const { date, overtimeMinutes, reason } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return badRequest('Tanggal tidak valid. Gunakan format YYYY-MM-DD.');
    }
    if (!overtimeMinutes || typeof overtimeMinutes !== 'number' || overtimeMinutes <= 0) {
      return badRequest('Durasi lembur harus lebih dari 0 menit.');
    }
    if (!reason?.trim()) {
      return badRequest('Alasan lembur wajib diisi untuk pengajuan manual.');
    }

    // Find attendance for that date
    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: authUser.userId, date } },
    });
    if (!attendance) {
      return badRequest('Tidak ada data absen pada tanggal tersebut. Lakukan absen terlebih dahulu.');
    }
    if (!attendance.checkOut) {
      return badRequest('Anda belum absen pulang pada tanggal tersebut.');
    }

    // Check if overtime approval already exists for this attendance
    const existing = await prisma.overtimeApproval.findUnique({
      where: { attendanceId: attendance.id },
    });
    if (existing) {
      return badRequest('Pengajuan lembur untuk tanggal ini sudah ada. Hubungi atasan untuk review ulang.');
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { name: true, managerId: true },
    });
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

    // Create approval and update attendance atomically
    await prisma.$transaction([
      prisma.overtimeApproval.create({
        data: {
          attendanceId: attendance.id,
          requestedById: authUser.userId,
          overtimeMinutes,
          reason: reason.trim(),
          status: 'PENDING',
        },
      }),
      prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          isOvertime: true,
          overtimeMinutes,
          overtimeStatus: 'PENDING',
        },
      }),
    ]);

    // Notify manager/admin separately (non-critical)
    if (notifyUserId) {
      await prisma.notification.create({
        data: {
          type: 'OVERTIME',
          title: 'Pengajuan Lembur (Manual)',
          message: `${user.name} mengajukan lembur ${overtimeMinutes} menit pada tanggal ${date}. Alasan: ${reason.trim()}. Menunggu persetujuan Anda.`,
          recipientId: notifyUserId,
          senderId: authUser.userId,
        },
      });
    }

    return ok(null, 'Pengajuan lembur berhasil dikirim. Menunggu persetujuan atasan.');
  } catch (error) {
    console.error('[POST OVERTIME MANUAL]', error);
    return serverError();
  }
}
