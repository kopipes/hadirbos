import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, serverError } from '@/lib/api';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];

    const requests = await prisma.overtimeApproval.findMany({
      where: {
        ...(status && validStatuses.includes(status) ? { status } : {}),
        ...(authUser.role !== 'ADMIN'
          ? { requestedBy: { managerId: authUser.userId } }
          : {}),
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, nik: true, department: true, position: true },
        },
        reviewedBy: { select: { id: true, name: true } },
        attendance: { select: { id: true, date: true, checkIn: true, checkOut: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return ok(requests);
  } catch (error) {
    console.error('[GET OVERTIME]', error);
    return serverError();
  }
}
