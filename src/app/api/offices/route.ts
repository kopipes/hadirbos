import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  const offices = await prisma.office.findMany({
    orderBy: { name: 'asc' },
  });
  return ok(offices);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, address, latitude, longitude, radius } = body;
    if (!name || latitude === undefined || longitude === undefined) {
      return badRequest('Nama, latitude, dan longitude wajib diisi.');
    }
    const office = await prisma.office.create({
      data: { name, address, latitude, longitude, radius: radius || 100 },
    });
    return ok(office, 'Lokasi kantor berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE OFFICE]', error);
    return serverError();
  }
}
