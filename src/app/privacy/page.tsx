import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0b1326] px-6 py-12 text-[#dae2fd] md:px-20">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#ffd700]">
          <ArrowLeft className="h-4 w-4" />
          홈으로
        </Link>
        <h1 className="mt-10 text-4xl font-black text-[#fff6df]">개인정보처리방침</h1>
        <div className="mt-8 space-y-6 rounded-3xl border border-[#3e495d]/40 bg-[#171f33] p-8 text-sm leading-7 text-[#d0c6ab]">
          <p>달빛수원은 로그인, 코스 이용 기록, 향후 위치 기반 추천 기능 제공을 위해 필요한 최소 정보를 처리합니다.</p>
          <p>현재 웹 MVP에서는 Supabase Auth 세션을 통해 로그인 상태를 확인하며, 서비스 역할 키는 브라우저에 노출하지 않습니다.</p>
          <p>위치 기반 추천과 미션 기능이 도입될 경우 수집 항목, 보관 기간, 이용 목적을 별도 고지합니다.</p>
        </div>
      </div>
    </main>
  );
}
