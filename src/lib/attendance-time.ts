import { formatInTimeZone } from 'date-fns-tz';

export const ATTENDANCE_TZ = 'Asia/Jakarta';
export const ACTIVE_SESSION = { checkIn: { not: null }, checkOut: null, checkoutState: 'OPEN' } as const;

export interface ScheduleInput {
  checkInTime: string;
  checkOutTime: string;
  checkOutNextDay?: boolean;
  gracePeriod: number;
  overtimeAfter: number;
  reviewAfter?: number;
}

export interface SessionTimes {
  date: string;
  checkIn?: Date | string | null;
  checkOut?: Date | string | null;
  checkoutState?: string;
  needsReview?: boolean;
  scheduleCaptured?: boolean;
  scheduledCheckIn?: Date | string | null;
  scheduledCheckOut?: Date | string | null;
  gracePeriodSnapshot?: number | null;
  overtimeAfterSnapshot?: number | null;
  reviewAfterSnapshot?: number | null;
}

export function workDate(now: Date, schedule?: ScheduleInput | null): string {
  const today = formatInTimeZone(now, ATTENDANCE_TZ, 'yyyy-MM-dd');
  // A late arrival during the after-midnight portion belongs to the prior shift.
  return schedule?.checkOutNextDay && formatInTimeZone(now, ATTENDANCE_TZ, 'HH:mm') < schedule.checkOutTime
    ? addWorkDays(today, -1) : today;
}

export function addWorkDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function scheduleSnapshot(date: string, schedule?: ScheduleInput | null) {
  return {
    scheduleCaptured: true,
    scheduledCheckIn: schedule ? new Date(`${date}T${schedule.checkInTime}:00+07:00`) : null,
    scheduledCheckOut: schedule ? new Date(`${addWorkDays(date, schedule.checkOutNextDay ? 1 : 0)}T${schedule.checkOutTime}:00+07:00`) : null,
    gracePeriodSnapshot: schedule?.gracePeriod ?? null,
    overtimeAfterSnapshot: schedule?.overtimeAfter ?? null,
    reviewAfterSnapshot: schedule?.reviewAfter ?? null,
  };
}

export function sessionSchedule(session: SessionTimes, fallback?: ScheduleInput | null) {
  if (session.scheduleCaptured) {
    return {
      start: session.scheduledCheckIn ? new Date(session.scheduledCheckIn) : null,
      end: session.scheduledCheckOut ? new Date(session.scheduledCheckOut) : null,
      grace: session.gracePeriodSnapshot ?? 0,
      overtimeAfter: session.overtimeAfterSnapshot ?? 0,
      reviewAfter: session.reviewAfterSnapshot ?? 180,
    };
  }
  const snapshot = scheduleSnapshot(session.date, fallback ? {
    ...fallback,
    // Legacy schedules did not have an explicit next-day flag.
    checkOutNextDay: fallback.checkOutNextDay || fallback.checkOutTime <= fallback.checkInTime,
  } : null);
  return {
    start: snapshot.scheduledCheckIn,
    end: snapshot.scheduledCheckOut,
    grace: snapshot.gracePeriodSnapshot ?? 0,
    overtimeAfter: snapshot.overtimeAfterSnapshot ?? 0,
    reviewAfter: snapshot.reviewAfterSnapshot ?? 180,
  };
}

// Preserve the existing threshold rules: once triggered, count from the scheduled time.
export function minutesAfter(actual: Date, scheduled: Date | null, threshold: number): number {
  if (!scheduled || actual.getTime() <= scheduled.getTime() + threshold * 60_000) return 0;
  return Math.max(0, Math.floor((actual.getTime() - scheduled.getTime()) / 60_000));
}

export function checkInMatchesWorkDate(session: SessionTimes, checkIn: Date, fallback?: ScheduleInput | null): boolean {
  const schedule = sessionSchedule(session, fallback);
  const assignment = schedule.start && schedule.end ? {
    checkInTime: formatInTimeZone(schedule.start, ATTENDANCE_TZ, 'HH:mm'),
    checkOutTime: formatInTimeZone(schedule.end, ATTENDANCE_TZ, 'HH:mm'),
    checkOutNextDay: formatInTimeZone(schedule.end, ATTENDANCE_TZ, 'yyyy-MM-dd') > formatInTimeZone(schedule.start, ATTENDANCE_TZ, 'yyyy-MM-dd'),
    gracePeriod: schedule.grace, overtimeAfter: schedule.overtimeAfter,
  } : null;
  return workDate(checkIn, assignment) === session.date;
}

export function sessionNeedsReview(session: SessionTimes, now = new Date()): boolean {
  if (session.checkOut || !session.checkIn || session.checkoutState === 'REVIEWED_UNKNOWN') return false;
  if (session.needsReview || session.checkoutState === 'CORRECTION_REJECTED') return true;
  const { end, reviewAfter } = sessionSchedule(session);
  const due = end ? end.getTime() + reviewAfter * 60_000 : new Date(session.checkIn).getTime() + 24 * 60 * 60_000;
  return now.getTime() >= due;
}

export function sessionStatus(session: SessionTimes): string {
  if (session.checkOut) return 'Selesai';
  if (!session.checkIn) return '-';
  if (session.checkoutState === 'REVIEWED_UNKNOWN') return 'Sudah ditinjau — jam pulang tidak diketahui';
  if (session.checkoutState === 'REVIEW_REQUIRED') return 'Data lama — perlu ditinjau Admin';
  if (session.checkoutState === 'CORRECTION_PENDING') return 'Menunggu koreksi';
  if (session.checkoutState === 'CORRECTION_REJECTED') return 'Koreksi ditolak — ajukan ulang';
  return sessionNeedsReview(session) ? 'Perlu ditinjau' : 'Sedang bekerja';
}

export function formatSessionTime(value: Date | string | null | undefined, date: string): string {
  if (!value) return '-';
  const actual = new Date(value);
  const actualDate = formatInTimeZone(actual, ATTENDANCE_TZ, 'yyyy-MM-dd');
  const days = Math.round((Date.parse(actualDate) - Date.parse(date)) / 86_400_000);
  return formatInTimeZone(actual, ATTENDANCE_TZ, 'HH:mm') + (days > 0 ? ` (+${days} hari)` : days < 0 ? ` (${actualDate})` : '');
}

export function toDateTimeInput(value?: Date | string | null): string {
  return value ? formatInTimeZone(new Date(value), ATTENDANCE_TZ, "yyyy-MM-dd'T'HH:mm") : '';
}
