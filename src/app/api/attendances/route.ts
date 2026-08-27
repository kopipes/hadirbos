import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { calculateDistance, calculateLateMinutes, calculateOvertimeMinutes, getTodayString } from '@/lib/utils';

// Max base64 photo size ~5MB
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const department = searchParams.get('department');
    const status = searchParams.get('status');

    const selfOnly = searchParams.get('self') === 'true';
    const targetUserId = (authUser.role === 'USER' || selfOnly) ? authUser.userId : (userId || undefined);

    // Build date filter — date takes priority over range
    const dateFilter = date
      ? { date }
      : startDate && endDate
        ? { date: { gte: startDate, lte: endDate } }
        : {};

    const attendances = await prisma.attendance.findMany({
      where: {
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...dateFilter,
        ...(status ? { status } : {}),
        ...(department && authUser.role !== 'USER' ? { user: { department } } : {}),
        ...(authUser.role === 'MANAGER' || authUser.role === 'SPV'
          ? { user: { managerId: authUser.userId } }
          : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, nik: true, department: true, position: true, avatar: true },
        },
      },
      orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
      take: 500,
    });

    return ok(attendances);
  } catch (error) {
    console.error('[GET ATTENDANCES]', error);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { type, photo, latitude, longitude, address, reason } = body;

    // Input validation
    if (!type || !['checkin', 'checkout'].includes(type)) {
      return badRequest('Tipe absen tidak valid.');
    }
    if (!photo || typeof photo !== 'string') {
      return badRequest('Foto selfie wajib disertakan.');
    }
    if (photo.length > MAX_PHOTO_BYTES * 1.37) { // base64 overhead
      return badRequest('Ukuran foto terlalu besar. Maksimal 5MB.');
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        isNaN(latitude) || isNaN(longitude) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) {
      return badRequest('Koordinat GPS tidak valid. Pastikan GPS aktif dan izin lokasi diberikan.');
    }

    const today = getTodayString();

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      include: { office: true, workSchedule: true },
    });
    if (!user) return badRequest('User tidak ditemukan.');
    if (!user.isActive) return badRequest('Akun Anda tidak aktif.');

    // Location validation
    let isOutOfRadius = false;
    if (user.office) {
      const distance = calculateDistance(latitude, longitude, user.office.latitude, user.office.longitude);
      isOutOfRadius = distance > user.office.radius;
    }

    const now = new Date();

    if (type === 'checkin') {
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: authUser.userId, date: today } },
      });
      if (existing?.checkIn) {
        return badRequest('Anda sudah melakukan absen masuk hari ini.');
      }

      let isLate = false;
      let lateMinutes = 0;
      if (user.workSchedule) {
        lateMinutes = calculateLateMinutes(now, user.workSchedule.checkInTime, user.workSchedule.gracePeriod);
        isLate = lateMinutes > 0;
      }

      let attendance;
      try {
        attendance = await prisma.attendance.create({
          data: {
            userId: authUser.userId,
            date: today,
            checkIn: now,
            checkInPhoto: photo,
            checkInLat: latitude,
            checkInLng: longitude,
            checkInAddress: address?.trim() || null,
            isLate,
            lateMinutes,
            isOutOfRadius,
            status: 'PRESENT',
          },
        });
      } catch (e: unknown) {
        // P2002 = unique constraint — duplicate check-in race condition
        if ((e as { code?: string }).code === 'P2002') {
          return badRequest('Anda sudah melakukan absen masuk hari ini.');
        }
        throw e;
      }

      // Notify manager
      if (user.managerId) {
        const notifications = [];
        if (isLate) {
          notifications.push(prisma.notification.create({
            data: {
              type: 'LATE_CHECKIN',
              title: 'Karyawan Terlambat',
              message: `${user.name} terlambat ${lateMinutes} menit (absen masuk pukul ${now.toTimeString().slice(0, 5)})`,
              recipientId: user.managerId,
              senderId: authUser.userId,
            },
          }));
        }
        if (isOutOfRadius) {
          notifications.push(prisma.notification.create({
            data: {
              type: 'OUT_OF_RADIUS',
              title: 'Absen di Luar Radius',
              message: `${user.name} melakukan absen masuk di luar radius kantor.`,
              recipientId: user.managerId,
              senderId: authUser.userId,
            },
          }));
        }
        if (notifications.length > 0) await Promise.all(notifications);
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
        overtimeMinutes = calculateOvertimeMinutes(now, user.workSchedule.checkOutTime, user.workSchedule.overtimeAfter);
        isOvertime = overtimeMinutes > 0;
      }

      const attendance = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          checkOut: now,
          checkOutPhoto: photo,
          checkOutLat: latitude,
          checkOutLng: longitude,
          checkOutAddress: address?.trim() || null,
          isOvertime,
          overtimeMinutes,
          overtimeStatus: isOvertime ? 'PENDING' : 'NONE',
        },
      });

      // Create OvertimeApproval + notify manager (or fallback to ADMIN) in one go
      if (isOvertime) {
        // If employee has no manager, notify any ADMIN instead
        let notifyUserId = user.managerId;
        if (!notifyUserId) {
          const admin = await prisma.user.findFirst({
            where: { role: 'ADMIN', isActive: true },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          });
          notifyUserId = admin?.id ?? null;
        }

        if (notifyUserId) {
          await prisma.$transaction([
            prisma.overtimeApproval.create({
              data: {
                attendanceId: attendance.id,
                requestedById: authUser.userId,
                overtimeMinutes,
                reason: reason?.trim() || null,
                status: 'PENDING',
              },
            }),
            prisma.notification.create({
              data: {
                type: 'OVERTIME',
                title: 'Pengajuan Lembur',
                message: `${user.name} lembur ${overtimeMinutes} menit (pulang pukul ${now.toTimeString().slice(0, 5)})${reason ? `. Alasan: ${reason.trim()}` : ''}. Menunggu persetujuan Anda.`,
                recipientId: notifyUserId,
                senderId: authUser.userId,
              },
            }),
          ]);
        } else {
          // No manager and no admin found — still create approval record
          await prisma.overtimeApproval.create({
            data: {
              attendanceId: attendance.id,
              requestedById: authUser.userId,
              overtimeMinutes,
              overtimeType: 'CHECKOUT_LATE',
              reason: reason?.trim() || null,
              status: 'PENDING',
            },
          });
        }
      }

      return ok(attendance, 'Absen pulang berhasil.');
    }
  } catch (error) {
    console.error('[POST ATTENDANCE]', error);
    return serverError();
  }
}
