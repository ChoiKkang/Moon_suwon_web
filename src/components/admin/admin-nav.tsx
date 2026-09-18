'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, LayoutDashboard, Map, MapPin, Settings } from 'lucide-react';

const items = [
  { href: '/admin', label: '대시보드 통계', icon: LayoutDashboard },
  { href: '/admin/courses', label: '코스 관리', icon: Map },
  { href: '/admin/places', label: '스팟 관리', icon: MapPin },
  { href: '/admin/operations', label: '운영 상태', icon: Settings },
  { href: '/admin/events', label: '행사 관리', icon: CalendarDays },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

/** Desktop sidebar links. The active route drives the styling so an operator
 *  can always tell which console page they are on. */
export function AdminNav() {
  const pathname = usePathname() ?? '/admin';

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2" aria-label="관리자 콘솔 메뉴">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-r border-l-4 px-4 py-3 text-sm font-semibold transition-all ${
              active
                ? 'border-[#ffd700] bg-[#3e495d]/50 text-[#fff6df]'
                : 'border-transparent text-[#d0c6ab] hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? 'text-[#ffd700]' : ''}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile top rail. Mirrors the sidebar so small screens get the same cue. */
export function AdminMobileNav() {
  const pathname = usePathname() ?? '/admin';

  return (
    <div className="sticky top-0 z-40 flex gap-2 overflow-x-auto border-b border-[#4d4732]/20 bg-[#0b1326]/95 px-4 py-3 backdrop-blur-xl md:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${
              active ? 'bg-[#ffd700] text-[#3a3000]' : 'bg-[#171f33] text-[#d0c6ab]'
            }`}
          >
            {item.label.replace(' 관리', '').replace(' 통계', '')}
          </Link>
        );
      })}
    </div>
  );
}
