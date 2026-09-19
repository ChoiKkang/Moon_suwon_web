import type { ReactNode } from 'react';

/**
 * 모바일에서는 가로 스크롤, 넓은 화면에서는 그리드로 바뀌는 목록 레일.
 *
 * items-stretch를 명시해 한 줄에 놓인 카드가 같은 높이를 갖게 한다. 설명 길이나
 * 선택적 배지 유무로 카드마다 높이가 달라지면 줄이 들쭉날쭉해 보인다. 카드 쪽에서
 * h-full과 flex 배치를 함께 써야 효과가 있다.
 */
export function ScrollRail({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return <div aria-label={label} className={`scroll-rail flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:items-stretch md:overflow-visible xl:grid-cols-4 ${className}`}>{children}</div>;
}
