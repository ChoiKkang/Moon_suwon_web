'use client';

import { startTransition, useActionState } from 'react';
import { signInWithOAuth } from '@/app/actions/auth';
import { MessageCircle, ShieldAlert } from 'lucide-react';

interface SocialLoginButtonsProps {
  onSuccess?: () => void;
}

export function SocialLoginButtons({ onSuccess }: SocialLoginButtonsProps) {
  // React 19의 useActionState 훅 사용
  const [errorMsg, formAction, isPending] = useActionState(
    async (prevState: string | null, formData: FormData) => {
      const provider = formData.get('provider') as 'kakao' | 'naver' | 'apple';
      try {
        await signInWithOAuth(provider);
        if (onSuccess) onSuccess();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.';
      }
    },
    null
  );

  const handleLogin = (provider: 'kakao' | 'naver' | 'apple') => {
    const formData = new FormData();
    formData.append('provider', provider);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {errorMsg && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/20 text-red-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 카카오 로그인 */}
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleLogin('kakao')}
        className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-[#FEE500] text-[#191919] hover:bg-[#FDD800] transition-colors rounded-xl font-semibold text-sm active:scale-98 disabled:opacity-50"
      >
        {/* Simple Kakao Icon Mockup */}
        <MessageCircle className="w-5 h-5 fill-current" />
        <span>카카오톡으로 시작하기</span>
      </button>

      {/* 네이버 로그인 */}
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleLogin('naver')}
        className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-[#03C75A] text-white hover:bg-[#02b34f] transition-colors rounded-xl font-semibold text-sm active:scale-98 disabled:opacity-50"
      >
        <span className="w-5 h-5 flex items-center justify-center font-extrabold text-lg tracking-tighter">N</span>
        <span>네이버로 시작하기</span>
      </button>

      {/* 애플 로그인 */}
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleLogin('apple')}
        className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white text-black hover:bg-zinc-100 transition-colors rounded-xl font-semibold text-sm active:scale-98 disabled:opacity-50 border border-zinc-200"
      >
        {/* Apple 로고. macOS 전용 문자 대신 인라인 SVG로 렌더링해 모든 플랫폼에서 동일하게 보이도록 한다. */}
        <svg aria-hidden="true" focusable="false" viewBox="0 0 384 512" className="w-4 h-5 fill-current">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-36.8-2.8-77 21.3-91.7 21.3-15.5 0-51.1-20.3-79.1-20.3C61.2 141.2 8 184.4 8 271.1c0 25.6 4.7 52 14.1 79.3 12.5 35.9 46.4 123.6 84.7 122.4 20-.5 34.1-14.2 60.2-14.2 25.3 0 38.4 14.2 60.6 14.2 38.6-.6 69.3-79.4 81.2-115.4-51.7-24.4-50.1-87.5-50.1-88.7zm-51.7-176.5c19.6-23.2 17.8-44.3 17.2-51.9-17.3 1-37.3 11.8-48.7 25.1-12.6 14.2-20 31.8-18.4 51.6 18.7 1.4 35.8-8.2 49.9-24.8z" />
        </svg>
        <span>Apple로 시작하기</span>
      </button>
    </div>
  );
}
