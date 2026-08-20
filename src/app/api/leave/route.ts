import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

// Calculate working days between two dates (excl. weekends, holidays optional)
function countDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const VALID_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'PERMISSION', 'OTHER'];

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const userId = searchParams.get('userId');

    // Regular users only see their own
    const targetUserId = authUser.role === 'USER' ? authUser.userId : (userId || undefined);

    const requests = await prisma.leaveRequest.findMany({
      where: {
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...(status ? { status } : {}),
        ...(authUser.role === 'MANAGER' || authUser.role === 'SPV'
          ? { user: { managerId: authUser.userId } }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, nik: true, department: true, position: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return ok(requests);
  } catch (error) {
    console.error('[GET LEAVE]', error);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { type, startDate, endDate, reason } = body;

    // Validate
    if (!type || !VALID_TYPES.includes(type)) {
      return badRequest('Jenis cuti tidak valid.');
    }
    if (!startDate || !endDate || !reason?.trim()) {
      return badRequest('Tanggal mulai, tanggal selesai, dan alasan wajib diisi.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return badRequest('Format tanggal tidak valid.');
    }
    if (endDate < startDate) {
      return badRequest('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    }

    // Prevent requesting leave in the past (allow today)
    const today = new Date().toISOString().split('T')[0];
    if (startDate < today) {
      return badRequest('Tidak dapat mengajukan cuti untuk tanggal yang sudah lewat.');
    }

    const totalDays = countDays(startDate, endDate);
    if (totalDays === 0) {
      return badRequest('Tidak ada hari kerja dalam rentang tanggal yang dipilih.');
    }

    // Check for overlapping approved/pending leave
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        userId: authUser.userId,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });
    if (overlap) {
      return badRequest(`Terdapat pengajuan cuti yang tumpang tindih (${overlap.startDate} – ${overlap.endDate}).`);
    }

    // Get user's manager
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { managerId: true, name: true },
    });

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: authUser.userId,
        type,
        startDate,
        endDate,
        totalDays,
        reason: reason.trim(),
        status: 'PENDING',
      },
    });

    // Notify manager/SPV
    if (user?.managerId) {
      const typeLabel: Record<string, string> = {
        ANNUAL: 'Cuti Tahunan', SICK: 'Cuti Sakit', MATERNITY: 'Cuti Melahirkan',
        PATERNITY: 'Cuti Ayah', PERMISSION: 'Izin', OTHER: 'Cuti Lainnya',
      };
      await prisma.notification.create({
        data: {
          type: 'LEAVE_REQUEST',
          title: 'Pengajuan Cuti',
          message: `${user.name} mengajukan ${typeLabel[type] || type} pada ${startDate}${startDate !== endDate ? ` s/d ${endDate}` : ''} (${totalDays} hari kerja). Menunggu persetujuan Anda.`,
          recipientId: user.managerId,
          senderId: authUser.userId,
        },
      });
    }

    return ok(leave, 'Pengajuan cuti berhasil dikirim.');
  } catch (error) {
    console.error('[POST LEAVE]', error);
    return serverError();
  }
}
