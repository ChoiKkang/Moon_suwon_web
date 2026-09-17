import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#0b1326] px-6 py-12 text-[#dae2fd] md:px-20">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#ffd700]">
          <ArrowLeft className="h-4 w-4" />
          홈으로
        </Link>
        <h1 className="mt-10 text-4xl font-black text-[#fff6df]">고객 지원</h1>
        <p className="mt-4 text-sm leading-7 text-[#d0c6ab]">달빛수원 이용 중 궁금한 점이나 불편사항이 있으시면 아래 연락처로 문의해 주세요. 확인 후 빠르게 답변드리겠습니다.</p>

        <div className="mt-8 space-y-6 rounded-3xl border border-[#3e495d]/40 bg-[#171f33] p-8 text-sm leading-7 text-[#d0c6ab]">
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-[#fff6df]">
              <Mail className="h-4 w-4 text-[#ffd700]" />
              이메일 문의
            </h2>
            <p>
              <a href="mailto:hynjni7890@gmail.com" className="font-bold text-[#ffd700] underline">
                hynjni7890@gmail.com
              </a>
            </p>
            <p className="mt-1 text-xs text-[#8a93ad]">평일 기준 1~2일 이내 답변드립니다.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">자주 묻는 질문</h2>
            <div className="space-y-4">
              <div>
                <p className="font-bold text-[#fff6df]">Q. 앱에서 위치 정보는 왜 필요한가요?</p>
                <p>내 주변 야경 스팟과 코스를 추천해 드리기 위해 사용되며, 기능 이용 시에만 일시적으로 사용됩니다.</p>
              </div>
              <div>
                <p className="font-bold text-[#fff6df]">Q. 회원 탈퇴는 어떻게 하나요?</p>
                <p>이메일로 탈퇴를 요청해 주시면 확인 후 처리해 드립니다.</p>
              </div>
              <div>
                <p className="font-bold text-[#fff6df]">Q. 오류나 버그를 발견했어요.</p>
                <p>발생 화면과 상황을 이메일로 보내주시면 빠르게 확인하겠습니다.</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-[#fff6df]">관련 문서</h2>
            <p>
              <Link href="/privacy" className="text-[#ffd700] underline">개인정보처리방침</Link>
              {' '}·{' '}
              <Link href="/terms" className="text-[#ffd700] underline">이용약관</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
                }
