import { NextRequest } from 'next/server';
import { getAuthUser, ok, unauthorized, badRequest } from '@/lib/api';
import { settleHistoricalAttendance } from '@/lib/attendance-service';
import { correctionError } from '@/lib/attendance-response';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getAuthUser(req);
  if (!actor) return unauthorized();
  try {
    const body = await req.json();
    if (typeof body.action !== 'string' || typeof body.reason !== 'string' || body.reason.trim().length > 2000) return badRequest('Tindakan dan alasan pemeriksaan tidak valid.');
    const result = await settleHistoricalAttendance(actor, params.id, body);
    return ok(result, body.action === 'UNKNOWN_CHECKOUT' ? 'Selesai ditinjau. Jam pulang tetap tidak diketahui.' : 'Jam pulang historis berhasil dikoreksi.');
  } catch (error) { return correctionError(error); }
}
