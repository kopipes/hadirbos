import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Jakarta';
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  // Validate cron secret
  const auth = req.headers.get('x-cron-secret');
  if (CRON_SECRET && auth !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowUTC = new Date();
    const nowWIB = toZonedTime(nowUTC, TZ);

    // Auto-checkout runs at 06:00 WIB for YESTERDAY's date
    const yesterdayWIB = new Date(nowWIB);
    yesterdayWIB.setDate(yesterdayWIB.getDate() - 1);
    const yesterdayStr = formatInTimeZone(yesterdayWIB, TZ, 'yyyy-MM-dd');

    // Find all attendances from yesterday with checkIn but no checkOut
    const missed = await prisma.attendance.findMany({
      where: {
        date: yesterdayStr,
        checkIn: { not: null },
        checkOut: null,
      },
      include: {
        user: {
          include: { workSchedule: true },
        },
      },
    });

    let autoCheckedOut = 0;

    for (const attendance of missed) {
      const user = attendance.user;
      if (!user.workSchedule) continue;

      // Set auto-checkout time = scheduled checkout time on that date in WIB
      const [h, m] = user.workSchedule.checkOutTime.split(':').map(Number);
      const autoCheckoutTime = new Date(yesterdayStr + 'T00:00:00+07:00');
      autoCheckoutTime.setHours(h, m, 0, 0);

      // Update attendance with auto-checkout
      await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOut: autoCheckoutTime,
          notes: attendance.notes
            ? `${attendance.notes} | Auto checkout sistem ${formatInTimeZone(nowUTC, TZ, 'HH:mm')} WIB - harap koreksi jika salah`
            : `Auto checkout sistem ${formatInTimeZone(nowUTC, TZ, 'HH:mm')} WIB - harap koreksi jika salah`,
        },
      });

      // Notify employee
      await prisma.notification.create({
        data: {
          type: 'MISSING_CHECKOUT',
          title: 'Auto Absen Pulang oleh Sistem',
          message: `Anda lupa absen pulang kemarin (${yesterdayStr}). Sistem telah otomatis mencatat jam pulang Anda pukul ${user.workSchedule.checkOutTime} WIB. Ajukan koreksi jika tidak sesuai.`,
          recipientId: user.id,
        },
      });

      // Notify manager
      if (user.managerId) {
        await prisma.notification.create({
          data: {
            type: 'MISSING_CHECKOUT',
            title: 'Auto Checkout Karyawan',
            message: `${user.name} lupa absen pulang kemarin (${yesterdayStr}). Sistem otomatis mencatat jam pulang pukul ${user.workSchedule.checkOutTime} WIB. Silakan review jika diperlukan.`,
            recipientId: user.managerId,
            senderId: user.id,
          },
        });
      }

      autoCheckedOut++;
    }

    return NextResponse.json({
      success: true,
      autoCheckedOut,
      date: yesterdayStr,
      time: nowUTC.toISOString(),
    });
  } catch (error) {
    console.error('[CRON AUTO CHECKOUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
