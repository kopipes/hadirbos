import { NextResponse } from 'next/server';
import { AttendanceError } from '@/lib/attendance-service';

export function correctionError(error: unknown) {
  if (error instanceof AttendanceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  if (['P2002', 'P2028', 'P2034'].includes((error as { code?: string }).code ?? '')) return NextResponse.json({ success: false, error: 'Data sedang diproses. Muat ulang halaman dan coba kembali.' }, { status: 409 });
  console.error('[ATTENDANCE SESSION]', error);
  return NextResponse.json({ success: false, error: 'Terjadi kesalahan pada server.' }, { status: 500 });
}
