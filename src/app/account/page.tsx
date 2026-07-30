import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { DeleteAccountButton } from '@/components/auth/delete-account-button';
import { signOut } from '@/app/actions/auth';
import { LogOut, Moon } from 'lucide-react';

export const metadata = {
  title: '계정 설정 | 달빛수원',
  description: '달빛수원 계정 정보와 탈퇴를 관리한다.',
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const provider = user.app_metadata?.provider ?? '알 수 없음';
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  return (
    <main className="min-h-screen bg-[#0b1326] px-6 py-24 text-[#dae2fd] md:px-20">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[#d0c6ab] hover:text-[#fff6df]">
          <Moon className="h-4 w-4 fill-[#ffd700] text-[#fff6df]" aria-hidden="true" />
          <span>달빛수원 홈으로</span>
        </Link>

        <h1 className="mb-2 text-3xl font-extrabold text-[#fff6df]">계정 설정</h1>
        <p className="mb-10 text-sm text-[#d0c6ab]">로그인 정보를 확인하고 계정을 삭제할 수 있습니다.</p>

        <section className="mb-10 rounded-2xl border border-[#3e495d]/40 bg-[#171f33] p-6">
          <h2 className="mb-4 text-lg font-bold text-white">로그인 정보</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#d0c6ab]">이름</dt>
              <dd className="text-right text-white">{displayName ?? '미등록'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#d0c6ab]">이메일</dt>
              <dd className="break-all text-right text-white">{user.email ?? '미제공'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#d0c6ab]">로그인 방식</dt>
              <dd className="text-right text-white">{provider}</dd>
            </div>
          </dl>
          {/* Apple은 이메일을 private relay 주소로 전달할 수 있어 안내가 필요하다. */}
          {provider === 'apple' && (
            <p className="mt-4 text-xs leading-relaxed text-[#d0c6ab]">
              Apple 로그인은 이메일 가리기를 선택한 경우 전달용 relay 주소가 표시됩니다.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-[#3e495d]/40 bg-[#171f33] p-6">
          <h2 className="mb-4 text-lg font-bold text-white">계정 관리</h2>
          <div className="flex flex-col gap-4">
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full border border-[#3e495d] px-5 py-2 text-xs font-bold text-[#d0c6ab] transition-colors hover:bg-[#222a3d]"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>로그아웃</span>
              </button>
            </form>

            <DeleteAccountButton />
          </div>
        </section>
      </div>
    </main>
  );
}
