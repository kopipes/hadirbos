import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, fmt = 'dd MMMM yyyy'): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, fmt, { locale: idLocale });
  } catch {
    return String(date);
  }
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return format(d, 'HH:mm');
  } catch {
    return '-';
  }
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return format(d, 'dd MMM yyyy, HH:mm', { locale: idLocale });
  } catch {
    return '-';
  }
}

export function getTodayString(): string {
  // Returns local date YYYY-MM-DD using system timezone
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Calculate distance between two lat/lng points in meters (Haversine) */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Check if employee is within allowed radius */
export function isWithinRadius(
  userLat: number,
  userLng: number,
  officeLat: number,
  officeLng: number,
  radiusMeters: number
): boolean {
  return calculateDistance(userLat, userLng, officeLat, officeLng) <= radiusMeters;
}

/**
 * Calculate how many minutes late a check-in is.
 * Returns 0 if on time or within grace period.
 */
export function calculateLateMinutes(
  checkInTime: Date,
  scheduledTime: string, // "HH:mm"
  gracePeriod: number    // minutes
): number {
  const [h, m] = scheduledTime.split(':').map(Number);
  // Build scheduled datetime on same local date as checkInTime
  const scheduled = new Date(checkInTime);
  scheduled.setHours(h, m, 0, 0);

  const graceEnd = scheduled.getTime() + gracePeriod * 60_000;
  if (checkInTime.getTime() <= graceEnd) return 0;

  return Math.floor((checkInTime.getTime() - scheduled.getTime()) / 60_000);
}

/**
 * Calculate overtime minutes after checkout.
 * Returns 0 if checked out before or within overtimeAfter threshold.
 */
export function calculateOvertimeMinutes(
  checkOutTime: Date,
  scheduledTime: string, // "HH:mm"
  overtimeAfter: number  // minutes buffer before counting as OT
): number {
  const [h, m] = scheduledTime.split(':').map(Number);
  const scheduled = new Date(checkOutTime);
  scheduled.setHours(h, m, 0, 0);

  const threshold = scheduled.getTime() + overtimeAfter * 60_000;
  if (checkOutTime.getTime() <= threshold) return 0;

  return Math.floor((checkOutTime.getTime() - scheduled.getTime()) / 60_000);
}

export function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'ADMIN':   return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'MANAGER': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'SPV':     return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    default:        return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Admin', MANAGER: 'Manager', SPV: 'Supervisor', USER: 'Karyawan',
  };
  return map[role] ?? role;
}

export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'PRESENT': return 'bg-green-100 text-green-700 border-green-200';
    case 'ABSENT':  return 'bg-red-100 text-red-700 border-red-200';
    case 'LEAVE':   return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'HOLIDAY': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'OFF':     return 'bg-gray-100 text-gray-600 border-gray-200';
    default:        return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PRESENT: 'Hadir', ABSENT: 'Tidak Hadir', LEAVE: 'Cuti',
    HOLIDAY: 'Libur', OFF: 'Hari Libur',
  };
  return map[status] ?? status;
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 menit';
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
}
