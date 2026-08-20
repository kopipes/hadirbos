import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/api';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Tidak memiliki akses.' }, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.userId },
    include: {
      manager: { select: { id: true, name: true, role: true } },
      office: true,
      workSchedule: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ success: false, error: 'User tidak ditemukan.' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...safe } = profile;
  return NextResponse.json({ success: true, data: safe });
}
