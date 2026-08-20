import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, badRequest, serverError } from '@/lib/api';
import { calculateDistance, calculateLateMinutes, calculateOvertimeMinutes, getTodayString } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const date = searchParams.get('date');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const department = searchParams.get('department');
  const status = searchParams.get('status');

  // Non-admin/manager/spv can only see their own
  const targetUserId =
    authUser.role === 'USER' ? authUser.userId : (userId || undefined);

  const attendances = await prisma.attendance.findMany({
    where: {
      ...(targetUserId ? { userId: targetUserId } : {}),
      ...(date ? { date } : {}),
      ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
      ...(status ? { status } : {}),
      ...(department && authUser.role !== 'USER'
        ? { user: { department } }
        : {}),
      // Manager/SPV only see their subordinates
      ...(authUser.role === 'MANAGER' || authUser.role === 'SPV'
        ? { user: { managerId: authUser.userId } }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true, name: true, nik: true, department: true, position: true, avatar: true,
        },
      },
    },
    orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
    take: 500,
  });

  return ok(attendances);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { type, photo, latitude, longitude, address } = body;
    // type: 'checkin' | 'checkout'

    if (!photo) return badRequest('Foto selfie wajib disertakan.');
    if (latitude === undefined || longitude === undefined) {
      return badRequest('Lokasi GPS tidak terdeteksi. Pastikan GPS aktif dan izin lokasi diberikan.');
    }
    if (!type || !['checkin', 'checkout'].includes(type)) {
      return badRequest('Tipe absen tidak valid.');
    }

    const today = getTodayString();

    // Get user with schedule and office
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      include: { office: true, workSchedule: true },
    });

    if (!user) return badRequest('User tidak ditemukan.');

    // Validate location if office is set
    let isOutOfRadius = false;
    if (user.office) {
      const distance = calculateDistance(
        latitude, longitude,
        user.office.latitude, user.office.longitude
      );
      isOutOfRadius = distance > user.office.radius;
    }

    const now = new Date();

    if (type === 'checkin') {
      // Check duplicate
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: authUser.userId, date: today } },
      });
      if (existing?.checkIn) {
        return badRequest('Anda sudah melakukan absen masuk hari ini.');
      }

      let isLate = false;
      let lateMinutes = 0;
      if (user.workSchedule) {
        lateMinutes = calculateLateMinutes(
          now,
          user.workSchedule.checkInTime,
          user.workSchedule.gracePeriod
        );
        isLate = lateMinutes > 0;
      }

      const attendance = await prisma.attendance.upsert({
        where: { userId_date: { userId: authUser.userId, date: today } },
        create: {
          userId: authUser.userId,
          date: today,
          checkIn: now,
          checkInPhoto: photo,
          checkInLat: latitude,
          checkInLng: longitude,
          checkInAddress: address || null,
          isLate,
          lateMinutes,
          isOutOfRadius,
          status: 'PRESENT',
        },
        update: {
          checkIn: now,
          checkInPhoto: photo,
          checkInLat: latitude,
          checkInLng: longitude,
          checkInAddress: address || null,
          isLate,
          lateMinutes,
          isOutOfRadius,
          status: 'PRESENT',
        },
      });

      // Notify manager if late or out of radius
      if (user.managerId) {
        if (isLate) {
          await prisma.notification.create({
            data: {
              type: 'LATE_CHECKIN',
              title: 'Karyawan Terlambat',
              message: `${user.name} terlambat ${lateMinutes} menit (absen masuk pukul ${now.toTimeString().slice(0, 5)})`,
              recipientId: user.managerId,
              senderId: authUser.userId,
            },
          });
        }
        if (isOutOfRadius) {
          await prisma.notification.create({
            data: {
              type: 'OUT_OF_RADIUS',
              title: 'Absen di Luar Radius',
              message: `${user.name} melakukan absen masuk di luar radius kantor.`,
              recipientId: user.managerId,
              senderId: authUser.userId,
            },
          });
        }
      }

      return ok(attendance, 'Absen masuk berhasil.');
    } else {
      // checkout
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: authUser.userId, date: today } },
      });

      if (!existing) return badRequest('Anda belum melakukan absen masuk hari ini.');
      if (existing.checkOut) return badRequest('Anda sudah melakukan absen pulang hari ini.');

      let isOvertime = false;
      let overtimeMinutes = 0;
      if (user.workSchedule) {
        overtimeMinutes = calculateOvertimeMinutes(
          now,
          user.workSchedule.checkOutTime,
          user.workSchedule.overtimeAfter
        );
        isOvertime = overtimeMinutes > 0;
      }

      const attendance = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          checkOut: now,
          checkOutPhoto: photo,
          checkOutLat: latitude,
          checkOutLng: longitude,
          checkOutAddress: address || null,
          isOvertime,
          overtimeMinutes,
        },
      });

      // Notify manager if overtime
      if (user.managerId && isOvertime) {
        await prisma.notification.create({
          data: {
            type: 'OVERTIME',
            title: 'Lembur Karyawan',
            message: `${user.name} lembur ${overtimeMinutes} menit (pulang pukul ${now.toTimeString().slice(0, 5)})`,
            recipientId: user.managerId,
            senderId: authUser.userId,
          },
        });
      }

      return ok(attendance, 'Absen pulang berhasil.');
    }
  } catch (error) {
    console.error('[ATTENDANCE POST]', error);
    return serverError();
  }
}
