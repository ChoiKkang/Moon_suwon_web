import { Moon } from 'lucide-react';

/**
 * 원천 이미지가 비어 있는 공개 카드에서도 콘텐츠의 맥락과 상태를
 * 함께 전달하는 공통 시각 대체 화면.
 */
export function VisualPlaceholder({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${label} 대표 이미지 준비 중`}
      className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(140deg,#131c31,#1d2742)] px-4 text-center ${className}`}
    >
      <Moon className="h-6 w-6 text-[#ffd700]/70" aria-hidden="true" />
      <span className="line-clamp-2 text-xs font-bold text-[#d0c6ab]">{label}</span>
      <span className="text-[10px] text-[#8f9bb3]">대표 이미지를 준비 중입니다</span>
    </div>
  );
}
