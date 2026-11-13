export function scheduleValidationError(body: Record<string, unknown>): string | null {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (typeof body.checkInTime !== 'string' || typeof body.checkOutTime !== 'string' || !time.test(body.checkInTime) || !time.test(body.checkOutTime)) return 'Format jam harus HH:mm.';
  if (body.checkOutNextDay !== undefined && typeof body.checkOutNextDay !== 'boolean') return 'Pilihan pulang hari berikutnya tidak valid.';
  if (body.checkOutNextDay ? body.checkOutTime >= body.checkInTime : body.checkOutTime <= body.checkInTime) return 'Jadwal harus berdurasi kurang dari 24 jam. Untuk shift malam, pilih pulang hari berikutnya.';
  for (const key of ['gracePeriod', 'overtimeAfter', 'reviewAfter']) {
    const value = body[key];
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < (key === 'reviewAfter' ? 30 : 0) || (value as number) > 1440)) return 'Toleransi, batas lembur, dan batas peninjauan tidak valid.';
  }
  return null;
}
