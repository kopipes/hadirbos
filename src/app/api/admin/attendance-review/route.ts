import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest } from '@/lib/api';
import { correctionError } from '@/lib/attendance-response';

export async function GET(req: NextRequest) {
  const actor = await getAuthUser(req);
  if (!actor) return unauthorized();
  try {
    const admin = await prisma.user.findUnique({ where: { id: actor.userId }, select: { isActive: true, role: true } });
    if (!admin?.isActive || admin.role !== 'ADMIN') return forbidden();
    const params = req.nextUrl.searchParams;
    const page = Number(params.get('page') || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return badRequest('Halaman tidak valid.');
    const scope = params.get('scope') || 'pending';
    if (!['pending', 'unknown', 'closed', 'all'].includes(scope)) return badRequest('Filter tidak valid.');
    const search = (params.get('search') || '').trim().slice(0, 100);
    const where: Prisma.AttendanceWhereInput = {
      historicalReview: true,
      ...(scope === 'pending' ? { checkOut: null, checkoutState: { not: 'REVIEWED_UNKNOWN' } } : scope === 'unknown' ? { checkoutState: 'REVIEWED_UNKNOWN' } : scope === 'closed' ? { checkOut: { not: null } } : {}),
      ...(search ? { user: { OR: [{ name: { contains: search } }, { nik: { contains: search } }] } } : {}),
    };
    const [total, records] = await prisma.$transaction([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({ where, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: 25, skip: (page - 1) * 25, select: {
        id: true, date: true, checkIn: true, checkOut: true, checkoutState: true, needsReview: true,
        overtimeMinutes: true, overtimeStatus: true,
        user: { select: { name: true, nik: true, department: true } },
        reviewActions: { orderBy: { createdAt: 'desc' }, select: { id: true, actorName: true, action: true, reason: true, createdAt: true, newCheckOut: true } },
        _count: { select: { corrections: { where: { status: 'PENDING' } } } },
      } }),
    ]);
    return ok({ total, page, pageSize: 25, records });
  } catch (error) { return correctionError(error); }
}
