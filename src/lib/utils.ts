import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, fmt = 'dd MMMM yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: idLocale });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'HH:mm');
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd MMM yyyy, HH:mm', { locale: idLocale });
}

export function getTodayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getTimeString(date: Date): string {
  return format(date, 'HH:mm');
}

/** Calculate distance between two lat/lng points in meters (Haversine) */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Check if employee is within allowed radius */
export function isWithinRadius(
  userLat: number,
  userLng: number,
  officeLat: number,
  officeLng: number,
  radiusMeters: number
): boolean {
  const distance = calculateDistance(userLat, userLng, officeLat, officeLng);
  return distance <= radiusMeters;
}

/** Calculate late minutes given check-in time and scheduled time */
export function calculateLateMinutes(
  checkInTime: Date,
  scheduledTime: string, // "HH:mm"
  gracePeriod: number
): number {
  const [h, m] = scheduledTime.split(':').map(Number);
  const scheduled = new Date(checkInTime);
  scheduled.setHours(h, m, 0, 0);
  const grace = new Date(scheduled.getTime() + gracePeriod * 60 * 1000);
  if (checkInTime <= grace) return 0;
  return differenceInMinutes(checkInTime, scheduled);
}

/** Calculate overtime minutes given check-out time and scheduled time */
export function calculateOvertimeMinutes(
  checkOutTime: Date,
  scheduledTime: string, // "HH:mm"
  overtimeAfter: number
): number {
  const [h, m] = scheduledTime.split(':').map(Number);
  const scheduled = new Date(checkOutTime);
  scheduled.setHours(h, m, 0, 0);
  const threshold = new Date(scheduled.getTime() + overtimeAfter * 60 * 1000);
  if (checkOutTime <= threshold) return 0;
  return differenceInMinutes(checkOutTime, scheduled);
}

export function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'MANAGER':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'SPV':
      return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    SPV: 'Supervisor',
    USER: 'Karyawan',
  };
  return map[role] ?? role;
}

export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'PRESENT':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'ABSENT':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'LEAVE':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'HOLIDAY':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'OFF':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PRESENT: 'Hadir',
    ABSENT: 'Tidak Hadir',
    LEAVE: 'Cuti',
    HOLIDAY: 'Libur',
    OFF: 'Hari Libur',
  };
  return map[status] ?? status;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
}
