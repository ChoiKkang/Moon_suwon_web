import Link from 'next/link';
import { Moon } from 'lucide-react';
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
    <Link href={href} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-[#3e495d]/35 bg-[#171f33]/90 shadow-xl transition duration-500 hover:-translate-y-1 hover:border-[#ffd700]/45">
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-[#0b1326]">
        {/* 원천에 사진이 없는 장소가 있다. 팔달문처럼 서비스의 대표 스팟이
            여기 해당해서 "이미지 준비 중" 회색 박스보다 장소 이름을 얹은
            플레이스홀더가 목록에서 덜 비어 보인다. */}
        {imageUrl ? (
          <div role="img" aria-label={title} className="image-reveal h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-[linear-gradient(140deg,#131c31,#1d2742)] px-4 text-center">
            <Moon className="h-6 w-6 text-[#ffd700]/70" aria-hidden />
            <span className="line-clamp-2 text-xs font-bold text-[#d0c6ab]">{title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/90 via-[#0b1326]/10 to-transparent" />
        {eyebrow ? <span className="absolute left-4 top-4 rounded-full bg-[#ffd700] px-3 py-1 text-[10px] font-black text-[#3a3000]">{eyebrow}</span> : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3"><h3 className="text-lg font-black text-white">{title}</h3>{meta}</div>
        {/* 설명 길이가 달라도 카드 높이는 같게 둔다. 세 줄로 자르고 남는 공간은
            아래로 밀어 이미지와 제목 위치를 줄 단위로 맞춘다. */}
        <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-[#d0c6ab]">{description}</p>
      </div>
    </Link>
  );
}
