import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  const holidays = await prisma.holiday.findMany({
    where: { date: { startsWith: year } },
    orderBy: { date: 'asc' },
  });
  return ok(holidays);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, date, isNational } = body;
    if (!name || !date) return badRequest('Nama dan tanggal wajib diisi.');

    const holiday = await prisma.holiday.create({
      data: { name, date, isNational: isNational ?? true },
    });
    return ok(holiday, 'Hari libur berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE HOLIDAY]', error);
    return serverError();
  }
}
