import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, serverError } from '@/lib/api';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    await prisma.holiday.delete({ where: { id: params.id } });
    return ok(null, 'Hari libur berhasil dihapus.');
  } catch (error) {
    console.error('[DELETE HOLIDAY]', error);
    return serverError();
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const holiday = await prisma.holiday.update({ where: { id: params.id }, data: body });
    return ok(holiday, 'Hari libur berhasil diperbarui.');
  } catch (error) {
    console.error('[UPDATE HOLIDAY]', error);
    return serverError();
  }
}
