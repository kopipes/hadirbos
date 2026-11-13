import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { ACTIVE_SESSION, sessionNeedsReview, workDate } from '@/lib/attendance-time';
import { AttendanceError, recordAttendance } from '@/lib/attendance-service';

// Max base64 photo size ~5MB
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get('current') === 'true') {
      const me = await prisma.user.findUnique({ where: { id: authUser.userId }, include: { workSchedule: true } });
      if (!me?.isActive) return forbidden();
      const openSessions = await prisma.attendance.findMany({ where: { userId: me.id, ...ACTIVE_SESSION }, orderBy: { checkIn: 'desc' } });
      const today = await prisma.attendance.findUnique({ where: { userId_date: { userId: me.id, date: workDate(new Date(), me.workSchedule) } } });
      const unresolved = await prisma.attendance.findMany({ where: { userId: me.id, checkOut: null, checkoutState: { in: ['CORRECTION_PENDING', 'CORRECTION_REJECTED'] } }, orderBy: { checkIn: 'asc' } });
      const current = openSessions.length === 1 ? openSessions[0] : today;
      return ok({ current: current ? { ...current, needsReview: sessionNeedsReview(current) } : null, openSessions, unresolved });
    }
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
        ...(searchParams.get('open') === 'true' ? { checkIn: { not: null }, checkOut: null } : dateFilter),
        ...(status ? { status } : {}),
        ...(department && authUser.role !== 'USER' ? { user: { department } } : {}),
        ...(!selfOnly && (authUser.role === 'MANAGER' || authUser.role === 'SPV')
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

    return ok(attendances.map(a => ({ ...a, needsReview: sessionNeedsReview(a) })));
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
    const { type, photo, latitude, longitude, address, reason, attendanceId } = body;
    if (!['checkin', 'checkout'].includes(type)) return badRequest('Tipe absen tidak valid.');
    if (typeof photo !== 'string' || !photo.startsWith('data:image/') || photo.length > MAX_PHOTO_BYTES * 1.37) return badRequest('Foto selfie wajib disertakan, maksimal 5MB.');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return badRequest('Koordinat GPS tidak valid.');
    if ((address !== undefined && typeof address !== 'string') || (reason !== undefined && typeof reason !== 'string')) return badRequest('Alamat atau alasan tidak valid.');
    const attendance = await recordAttendance(authUser, { type, photo, latitude, longitude, address, reason, attendanceId });
    return ok(attendance, type === 'checkin' ? 'Absen masuk berhasil.' : 'Absen pulang berhasil.');
  } catch (error) {
    if (error instanceof AttendanceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (['P2002', 'P2034', 'P2028'].includes((error as { code?: string }).code ?? '')) return NextResponse.json({ success: false, error: 'Sesi sudah ada atau sedang diproses. Muat ulang halaman sebelum mencoba lagi.' }, { status: 409 });
    console.error('[POST ATTENDANCE]', error);
    return serverError();
  }
}
