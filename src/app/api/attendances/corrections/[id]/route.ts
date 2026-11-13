import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest } from '@/lib/api';
import { canReview, reviewCorrection } from '@/lib/attendance-service';
import { correctionError } from '@/lib/attendance-response';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getAuthUser(req);
  if (!actor) return unauthorized();
  try {
    const correction = await prisma.attendanceCorrection.findUnique({ where: { id: params.id }, include: {
      attendance: { include: { user: { select: { id: true, managerId: true } } } },
      requestedBy: { select: { id: true, name: true, nik: true } },
    } });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');
    if (correction.attendance.userId !== actor.userId && !canReview(actor, correction.attendance.user)) return forbidden();
    return ok(correction);
  } catch (error) { return correctionError(error); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getAuthUser(req);
  if (!actor) return unauthorized();
  try {
    const { status, reviewNote } = await req.json();
    if (typeof status !== 'string' || (reviewNote !== undefined && typeof reviewNote !== 'string')) return badRequest('Status atau catatan tidak valid.');
    await reviewCorrection(actor, params.id, status, reviewNote);
    return ok(null, status === 'APPROVED' ? 'Koreksi disetujui.' : 'Koreksi ditolak.');
  } catch (error) { return correctionError(error); }
}
