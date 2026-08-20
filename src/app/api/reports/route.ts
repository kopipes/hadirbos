import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, serverError } from '@/lib/api';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const department = searchParams.get('department') || '';
  const userId = searchParams.get('userId') || '';
  const format = searchParams.get('format') || 'json';

  try {
    const attendances = await prisma.attendance.findMany({
      where: {
        ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
        ...(userId ? { userId } : {}),
        ...(department ? { user: { department } } : {}),
        ...(authUser.role !== 'ADMIN' ? { user: { managerId: authUser.userId } } : {}),
      },
      include: {
        user: {
          select: { id: true, nik: true, name: true, department: true, position: true },
        },
      },
      orderBy: [{ date: 'asc' }, { user: { name: 'asc' } }],
    });

    if (format === 'xlsx') {
      const rows = attendances.map((a) => ({
        NIK: a.user?.nik || '',
        Nama: a.user?.name || '',
        Departemen: a.user?.department || '',
        Jabatan: a.user?.position || '',
        Tanggal: a.date,
        'Jam Masuk': a.checkIn ? new Date(a.checkIn).toTimeString().slice(0, 5) : '-',
        'Jam Pulang': a.checkOut ? new Date(a.checkOut).toTimeString().slice(0, 5) : '-',
        Status: a.status,
        Terlambat: a.isLate ? 'Ya' : 'Tidak',
        'Menit Terlambat': a.lateMinutes,
        Lembur: a.isOvertime ? 'Ya' : 'Tidak',
        'Menit Lembur': a.overtimeMinutes,
        'Di Luar Radius': a.isOutOfRadius ? 'Ya' : 'Tidak',
        'Lokasi Masuk': a.checkInAddress || '',
        'Lokasi Pulang': a.checkOutAddress || '',
        Catatan: a.notes || '',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan Absensi');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="laporan-absensi-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    // Summary stats
    const stats = {
      total: attendances.length,
      present: attendances.filter((a) => a.status === 'PRESENT').length,
      absent: attendances.filter((a) => a.status === 'ABSENT').length,
      leave: attendances.filter((a) => a.status === 'LEAVE').length,
      late: attendances.filter((a) => a.isLate).length,
      overtime: attendances.filter((a) => a.isOvertime).length,
      outOfRadius: attendances.filter((a) => a.isOutOfRadius).length,
    };

    return ok({ attendances, stats });
  } catch (error) {
    console.error('[REPORTS]', error);
    return serverError();
  }
}
