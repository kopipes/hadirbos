import { prisma } from '../src/lib/prisma';
import { scheduleSnapshot } from '../src/lib/attendance-time';

// Run with the application stopped, after db:push. Never invent a historical checkout.
export async function backfillAttendanceSessions(now = new Date()) {
  const users = await prisma.user.findMany({ select: { id: true, workSchedule: true } });
  for (const user of users) {
    await prisma.$transaction(async tx => {
      const sessions = await tx.attendance.findMany({ where: { userId: user.id }, orderBy: { checkIn: 'desc' } });
      const open = sessions.filter(a => a.checkIn && !a.checkOut && a.checkoutState === 'OPEN');
      // Existing keyed sessions are preserved on reruns. At first upgrade, only a
      // recent (<=24h) latest check-in can still be a live overnight session.
      const keeper = open.find(a => a.openSessionKey === user.id) ?? open.find(a => now.getTime() - a.checkIn!.getTime() >= 0 && now.getTime() - a.checkIn!.getTime() <= 24 * 60 * 60_000);
      await tx.attendance.updateMany({ where: { userId: user.id, openSessionKey: { not: null } }, data: { openSessionKey: null } });
      for (const session of sessions) {
        const schedule = user.workSchedule;
        const snapshot = session.scheduleCaptured ? {} : scheduleSnapshot(session.date, schedule ? {
          ...schedule, checkOutNextDay: schedule.checkOutNextDay || schedule.checkOutTime <= schedule.checkInTime,
        } : null);
        const active = session.id === keeper?.id;
        await tx.attendance.update({ where: { id: session.id }, data: {
          ...snapshot,
          openSessionKey: active ? user.id : null,
          ...(session.checkOut ? { checkoutState: 'CLOSED' } : session.checkIn && session.checkoutState === 'OPEN' && !active ? { checkoutState: 'REVIEW_REQUIRED', historicalReview: true, needsReview: true } : {}),
        } });
      }
    }, { timeout: 60000 });
  }
}

if (require.main === module) {
  backfillAttendanceSessions().then(() => console.log('Attendance sessions upgraded. Historical checkout times preserved.'))
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
