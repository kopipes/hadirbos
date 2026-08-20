import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const office = await prisma.office.update({
      where: { id: params.id },
      data: body,
    });
    return ok(office, 'Lokasi berhasil diperbarui.');
  } catch (error) {
    console.error('[UPDATE OFFICE]', error);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    await prisma.office.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    return ok(null, 'Lokasi berhasil dinonaktifkan.');
  } catch (error) {
    console.error('[DELETE OFFICE]', error);
    return serverError();
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  const office = await prisma.office.findUnique({ where: { id: params.id } });
  if (!office) return badRequest('Lokasi tidak ditemukan.');
  return ok(office);
}
