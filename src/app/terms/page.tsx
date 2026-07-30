import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0b1326] px-6 py-12 text-[#dae2fd] md:px-20">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#ffd700]">
          <ArrowLeft className="h-4 w-4" />
          홈으로
        </Link>
        <h1 className="mt-10 text-4xl font-black text-[#fff6df]">이용약관</h1>
        <div className="mt-8 space-y-6 rounded-3xl border border-[#3e495d]/40 bg-[#171f33] p-8 text-sm leading-7 text-[#d0c6ab]">
          <p>달빛수원은 수원 야간 관광 코스와 공공데이터 기반 스팟 정보를 제공하는 서비스입니다.</p>
          <p>사용자는 서비스 화면의 코스, 장소, 미션 정보를 개인 관광 참고 목적으로 이용할 수 있습니다.</p>
          <p>운영자는 공공데이터 변경, 현장 상황, 안전 이슈에 따라 코스와 스팟 정보를 수정하거나 비공개 처리할 수 있습니다.</p>
        </div>
      </div>
    </main>
  );
}
