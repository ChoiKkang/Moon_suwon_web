import Link from 'next/link';
import { ArrowLeft, Compass, Moon } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd] flex flex-col items-center justify-center px-6 py-20 relative overflow-hidden">
      {/* 배경 글로우 효과 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#ffd700]/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(90,130,255,0.09),transparent_38%)] pointer-events-none" />

      <div className="relative z-10 max-w-md w-full text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-[#171f33] border border-[#ffd700]/30 flex items-center justify-center mb-6 shadow-xl shadow-yellow-500/5">
          <Moon className="w-8 h-8 text-[#fff6df] fill-[#ffd700]" />
        </div>

        <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffd700] mb-2">
          404 Not Found
        </span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-[#fff6df] mb-4">
          달빛이 닿지 않는 곳입니다
        </h1>
        <p className="text-sm leading-relaxed text-[#d0c6ab] mb-8">
          요청하신 페이지가 이동되었거나 삭제되어 찾을 수 없습니다.<br />
          아래 버튼을 눌러 수원화성의 야경 산책 코스를 다시 찾아보세요.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#ffd700] text-[#3a3000] font-bold text-sm rounded-xl hover:bg-[#ffe16d] transition-colors shadow-lg shadow-yellow-500/10"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>달빛수원 홈으로</span>
          </Link>
          <Link
            href="/courses"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#171f33] border border-[#3e495d] text-white font-bold text-sm rounded-xl hover:bg-[#222a3d] transition-colors"
          >
            <Compass className="w-4 h-4 text-[#ffd700]" />
            <span>코스 목록 둘러보기</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
