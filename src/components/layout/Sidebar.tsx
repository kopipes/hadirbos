'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Clock, Users, BarChart3, Settings,
  Fingerprint, CalendarDays, MapPin, Bell, LogOut, ChevronRight
} from 'lucide-react';
import { cn, getRoleLabel, getRoleBadgeColor } from '@/lib/utils';
import type { JWTPayload } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/attendance', label: 'Absensi', icon: Clock },
  { href: '/team', label: 'Tim Saya', icon: Users, roles: ['ADMIN', 'MANAGER', 'SPV'] },
  { href: '/reports', label: 'Laporan', icon: BarChart3, roles: ['ADMIN', 'MANAGER', 'SPV'] },
  { href: '/admin/users', label: 'Kelola Karyawan', icon: Users, roles: ['ADMIN'] },
  { href: '/admin/offices', label: 'Lokasi Kantor', icon: MapPin, roles: ['ADMIN'] },
  { href: '/admin/holidays', label: 'Hari Libur', icon: CalendarDays, roles: ['ADMIN'] },
  { href: '/admin/work-hours', label: 'Jadwal Kerja', icon: Settings, roles: ['ADMIN'] },
];

export default function Sidebar({ user }: { user: JWTPayload }) {
  const pathname = usePathname();

  const filtered = navItems.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-sm">
          <Fingerprint className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-lg font-bold text-slate-900">Hadir<span className="text-brand-500">Bos</span></span>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
            <span className={cn('badge text-xs', getRoleBadgeColor(user.role))}>
              {getRoleLabel(user.role)}
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {filtered.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
              )}
            >
              <item.icon className={cn('w-4.5 h-4.5 flex-shrink-0', isActive ? 'text-brand-500' : 'text-slate-400 group-hover:text-slate-600')} size={18} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={14} className="text-brand-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Notifications & logout */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-0.5">
        <Link
          href="/notifications"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-gray-50 hover:text-slate-900 transition-all"
        >
          <Bell size={18} className="text-slate-400" />
          Notifikasi
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
        >
          <LogOut size={18} />
          Keluar
        </button>
      </div>
    </aside>
  );
}
