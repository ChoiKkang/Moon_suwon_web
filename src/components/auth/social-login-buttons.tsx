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
        <span className="w-5 h-5 flex items-center justify-center font-bold text-lg"></span>
        <span>Apple로 시작하기</span>
      </button>
    </div>
  );
}
