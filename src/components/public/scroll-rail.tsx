import type { ReactNode } from 'react';

export function ScrollRail({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return <div aria-label={label} className={`scroll-rail flex snap-x snap-mandatory gap-5 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4 ${className}`}>{children}</div>;
}
