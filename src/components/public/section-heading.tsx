import Link from 'next/link';
import type { ReactNode } from 'react';

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: { href: string; label: string; icon?: ReactNode };
}) {
  return (
    <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <span className="text-xs font-black uppercase tracking-[0.22em] text-[#ffd700]">{eyebrow}</span>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-[#fff6df] md:text-5xl">{title}</h2>
        {description ? <p className="mt-4 text-sm leading-relaxed text-[#d0c6ab] md:text-base">{description}</p> : null}
      </div>
      {action ? <Link href={action.href} className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#ffd700] transition hover:text-[#ffe16d]">{action.label}{action.icon}</Link> : null}
    </div>
  );
}
