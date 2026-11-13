import { requestCorrection } from '@/lib/attendance-service';
import { correctionError } from '@/lib/attendance-response';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest } from '@/lib/api';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  const corrections = await prisma.attendanceCorrection.findMany({
    where: { ...(req.nextUrl.searchParams.get('status') ? { status: req.nextUrl.searchParams.get('status')! } : {}), ...(authUser.role !== 'ADMIN' ? { attendance: { user: { managerId: authUser.userId } } } : {}) },
    include: {
      requestedBy: { select: { id: true, name: true, nik: true, department: true } },
      approvedBy: { select: { id: true, name: true } },
      attendance: { select: { date: true, checkIn: true, checkOut: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return ok(corrections);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  try {
    const body = await req.json();
    if (typeof body.attendanceId !== 'string' || typeof body.reason !== 'string') return badRequest('ID absen dan alasan wajib diisi.');
    const correction = await requestCorrection(authUser, body);
    return ok(correction, 'Permintaan koreksi berhasil dikirim.');
  } catch (error) {
    return correctionError(error);
  }
}
