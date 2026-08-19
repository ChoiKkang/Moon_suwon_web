import Link from 'next/link';
import type { ReactNode } from 'react';

export function MediaCard({
  href,
  title,
  description,
  imageUrl,
  eyebrow,
  meta,
}: {
  href: string;
  title: string;
  description: string;
  imageUrl: string | null;
  eyebrow?: string;
  meta?: ReactNode;
}) {
  return (
    <Link href={href} className="group block overflow-hidden rounded-3xl border border-[#3e495d]/35 bg-[#171f33]/90 shadow-xl transition duration-500 hover:-translate-y-1 hover:border-[#ffd700]/45">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#0b1326]">
        {imageUrl ? <div role="img" aria-label={title} className="image-reveal h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }} /> : <div className="flex h-full items-center justify-center text-xs text-[#8f9bb3]">이미지 준비 중</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/90 via-[#0b1326]/10 to-transparent" />
        {eyebrow ? <span className="absolute left-4 top-4 rounded-full bg-[#ffd700] px-3 py-1 text-[10px] font-black text-[#3a3000]">{eyebrow}</span> : null}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3"><h3 className="text-lg font-black text-white">{title}</h3>{meta}</div>
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#d0c6ab]">{description}</p>
      </div>
    </Link>
  );
}
