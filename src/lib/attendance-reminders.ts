import { prisma } from '@/lib/prisma';
import { ACTIVE_SESSION, sessionSchedule } from '@/lib/attendance-time';
import { captureLegacySchedule, notifyReviewer } from '@/lib/attendance-service';

export async function runSessionReminders(now = new Date()) {
  const sessions = await prisma.attendance.findMany({ where: ACTIVE_SESSION, select: { id: true } });
  let reminded = 0;
  let flagged = 0;
  for (const { id } of sessions) {
    const result = await prisma.$transaction(async tx => {
      const found = await tx.attendance.findFirst({ where: { id, ...ACTIVE_SESSION }, include: { user: { include: { workSchedule: true } } } });
      if (!found) return { reminded: 0, flagged: 0 };
      const session = await captureLegacySchedule(tx, found, found.user.workSchedule);
      const schedule = sessionSchedule(session);
      const fallbackDue = session.checkIn!.getTime() + 24 * 60 * 60_000;
      const reminderDue = schedule.end ? schedule.end.getTime() + 30 * 60_000 : fallbackDue;
      const reviewDue = schedule.end ? schedule.end.getTime() + schedule.reviewAfter * 60_000 : fallbackDue;
      let reminderCount = 0;
      let reviewCount = 0;
      if (now.getTime() >= reminderDue && !session.reminderSentAt) {
        const claimed = await tx.attendance.updateMany({ where: { id, ...ACTIVE_SESSION, reminderSentAt: null }, data: { reminderSentAt: now } });
        if (claimed.count) {
          const message = `Sesi tanggal kerja ${session.date} belum memiliki jam pulang. Jika sudah pulang, ajukan koreksi jam sebenarnya; jika masih bekerja, lakukan absen pulang saat selesai.`;
          await tx.notification.create({ data: { type: 'MISSING_CHECKOUT', title: 'Absen Pulang Belum Tercatat', message, recipientId: found.userId } });
          await notifyReviewer(tx, found.user, { type: 'MISSING_CHECKOUT', title: 'Karyawan Belum Absen Pulang', message: `${found.user.name}: ${message}`, metadata: JSON.stringify({ attendanceId: id }) });
          reminderCount = 1;
        }
      }
      if (now.getTime() >= reviewDue && !session.reviewNotifiedAt) {
        const claimed = await tx.attendance.updateMany({ where: { id, ...ACTIVE_SESSION, reviewNotifiedAt: null }, data: { needsReview: true, reviewNotifiedAt: now } });
        if (claimed.count) {
          await notifyReviewer(tx, found.user, { type: 'MISSING_CHECKOUT', title: 'Sesi Kerja Perlu Ditinjau', message: `${found.user.name} belum menutup sesi tanggal kerja ${session.date}. Periksa apakah masih bekerja atau lupa absen. Jam pulang tidak diisi otomatis.`, metadata: JSON.stringify({ attendanceId: id }) });
          reviewCount = 1;
        }
      }
      return { reminded: reminderCount, flagged: reviewCount };
    }, { timeout: 15000 });
    reminded += result.reminded;
    flagged += result.flagged;
  }
  return { reminded, flagged, autoCheckedOut: 0 };
}
