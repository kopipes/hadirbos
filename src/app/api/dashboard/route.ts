import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, serverError } from '@/lib/api';
import { getTodayString } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const today = getTodayString();

    const whereTeam = authUser.role !== 'ADMIN'
      ? { managerId: authUser.userId }
      : {};

    const [totalEmployees, todayAttendances, pendingCorrections] = await Promise.all([
      prisma.user.count({ where: { isActive: true, role: 'USER', ...whereTeam } }),
      prisma.attendance.findMany({
        where: {
          date: today,
          ...(authUser.role !== 'ADMIN' ? { user: { managerId: authUser.userId } } : {}),
        },
        include: {
          user: { select: { id: true, name: true, nik: true, department: true, avatar: true, position: true } },
        },
      }),
      prisma.attendanceCorrection.count({
        where: {
          status: 'PENDING',
          ...(authUser.role !== 'ADMIN'
            ? { attendance: { user: { managerId: authUser.userId } } }
            : {}),
        },
      }),
    ]);

    const stats = {
      totalEmployees,
      presentToday: todayAttendances.filter((a) => a.status === 'PRESENT').length,
      lateToday: todayAttendances.filter((a) => a.isLate).length,
      absentToday: todayAttendances.filter((a) => a.status === 'ABSENT').length,
      onLeaveToday: todayAttendances.filter((a) => a.status === 'LEAVE').length,
      overtimeToday: todayAttendances.filter((a) => a.isOvertime).length,
      outOfRadiusToday: todayAttendances.filter((a) => a.isOutOfRadius).length,
      pendingCorrections,
      todayAttendances,
    };

    return ok(stats);
  } catch (error) {
    console.error('[DASHBOARD STATS]', error);
    return serverError();
  }
}
