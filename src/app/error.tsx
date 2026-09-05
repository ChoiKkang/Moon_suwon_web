'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 프로덕션 에러 트래킹 등을 위해 유지
  }, [error]);

  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd] flex flex-col items-center justify-center px-6 py-20 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-md w-full text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-[#171f33] border border-red-500/30 flex items-center justify-center mb-6 shadow-xl shadow-red-500/5">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>

        <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-2">
          Temporary Error
        </span>
        <h1 className="text-3xl font-extrabold text-[#fff6df] mb-4">
          일시적인 오류가 발생했습니다
        </h1>
        <p className="text-sm leading-relaxed text-[#d0c6ab] mb-8">
          데이터를 불러오는 중 문제가 발생했습니다.<br />
          잠시 후 다시 시도하시거나 홈으로 이동해 주세요.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#ffd700] text-[#3a3000] font-bold text-sm rounded-xl hover:bg-[#ffe16d] transition-colors shadow-lg shadow-yellow-500/10"
          >
            <RotateCcw className="w-4 h-4" />
            <span>다시 시도</span>
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#171f33] border border-[#3e495d] text-white font-bold text-sm rounded-xl hover:bg-[#222a3d] transition-colors"
          >
            <Home className="w-4 h-4 text-[#ffd700]" />
            <span>달빛수원 홈으로</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
