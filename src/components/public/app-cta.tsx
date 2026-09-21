import { ArrowRight } from 'lucide-react';
import { getAppCtaTarget } from '@/lib/public/ux-content';

type AppCtaProps = {
  className?: string;
  context?: string;
};

export function AppCta({ className = '', context = '현장 미션과 위치 기반 안내' }: AppCtaProps) {
  const target = getAppCtaTarget(process.env.NEXT_PUBLIC_APP_STORE_URL);
  if (!target) return null;
  const isWebStoreLink = target.href.startsWith('http://') || target.href.startsWith('https://');

  return (
    <a
      href={target.href}
      {...(isWebStoreLink ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={`inline-flex items-center justify-between gap-4 rounded-2xl border border-[#ffd700]/35 bg-[#ffd700]/10 px-4 py-3 text-left transition hover:border-[#ffd700]/70 hover:bg-[#ffd700]/15 ${className}`}
    >
      <span>
        <span className="block text-sm font-black text-[#fff6df]">{target.label}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-[#d0c6ab]">{context}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#ffd700]" aria-hidden="true" />
    </a>
  );
}
