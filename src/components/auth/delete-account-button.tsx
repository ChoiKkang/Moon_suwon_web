'use client';

import { useState, useTransition } from 'react';
import { deleteAccount } from '@/app/actions/auth';
import { ShieldAlert, Trash2 } from 'lucide-react';

/**
 * 회원 탈퇴 버튼.
 *
 * App Store 심사 지침은 Apple 로그인을 지원하는 앱에 계정 삭제 경로를 요구한다.
 * 되돌릴 수 없는 동작이므로 2단계 확인을 거친다.
 */
export function DeleteAccountButton() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await deleteAccount();
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : '계정 삭제 중 오류가 발생했습니다.'
        );
      }
    });
  };

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-950/20 px-5 py-2 text-xs font-bold text-red-400 transition-all hover:bg-red-950/40"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>회원 탈퇴</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4">
      <p className="flex items-start gap-2 text-sm text-red-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span>계정과 저장된 정보가 모두 삭제되며 되돌릴 수 없습니다. 계속하시겠습니까?</span>
      </p>

      {errorMessage && (
        <p role="alert" className="text-sm text-red-300">
          {errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="rounded-full bg-red-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
        >
          {isPending ? '삭제 중...' : '탈퇴 확인'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setIsConfirming(false)}
          className="rounded-full border border-[#3e495d] px-5 py-2 text-xs font-bold text-[#d0c6ab] transition-colors hover:bg-[#222a3d] disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
