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
          <p>달빛수원(이하 &apos;서비스&apos;)은 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을 준수하고 있습니다. 서비스는 다음과 같이 개인정보를 처리하고 있습니다.</p>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">1. 수집하는 개인정보 항목 및 방법</h2>
            <p>서비스는 회원가입 및 서비스 이용 과정에서 아래와 같은 개인정보를 수집합니다.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>필수 항목: 이메일 주소 (회원가입, 로그인)</li>
              <li>선택 항목: 프로필 사진</li>
              <li>기기 접근 권한을 통해 수집하는 정보: 위치정보(GPS) — 주변 야경 스팟·코스 추천 기능 이용 시에만 실시간으로 수집</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">2. 개인정보의 수집 및 이용 목적</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>이메일 주소: 회원 식별, 로그인 인증, 서비스 관련 공지사항 전달</li>
              <li>위치정보: 사용자 주변의 야경 스팟 및 코스 추천 기능 제공 (기기에서 실시간으로만 이용되며 서버에 별도 저장하지 않음)</li>
              <li>프로필 사진: 사용자 프로필 화면 표시</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">3. 개인정보의 보유 및 이용기간</h2>
            <p>서비스는 원칙적으로 개인정보의 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 회원 정보는 회원 탈퇴 시까지 보유하며, 관계 법령에 따라 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보관합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">4. 개인정보의 제3자 제공</h2>
            <p>서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우 또는 법령의 규정에 의한 경우는 예외로 합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">5. 개인정보 처리의 위탁</h2>
            <p>서비스는 안정적인 서비스 제공을 위해 Supabase(데이터베이스 및 인증) 등 클라우드 인프라 제공업체에 개인정보 처리 업무의 일부를 위탁하고 있으며, 위탁계약 시 개인정보가 안전하게 관리될 수 있도록 관련 법령에 따라 필요한 사항을 규정하고 있습니다.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">6. 이용자의 권리와 행사 방법</h2>
            <p>이용자는 언제든지 등록된 자신의 개인정보를 조회, 수정하거나 삭제(회원탈퇴)를 요청할 수 있으며, 아래 연락처로 문의하시면 지체 없이 조치하겠습니다.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">7. 개인정보의 파기</h2>
            <p>이용자의 개인정보는 수집 및 이용목적이 달성되거나 회원 탈퇴 시 지체 없이 파기됩니다. 전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">8. 개인정보 보호책임자</h2>
            <p>성명: 최현우</p>
            <p>이메일: hynjni7890@gmail.com</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">9. 고지의 의무</h2>
            <p>본 개인정보처리방침은 법령 및 정책에 따라 변경될 수 있으며, 변경 시 서비스 내 공지사항을 통해 고지합니다.</p>
          </div>

          <p className="pt-2 text-xs text-[#8a93ad]">시행일자: 2026년 9월 17일</p>
        </div>
      </div>
    </main>
  );
}
