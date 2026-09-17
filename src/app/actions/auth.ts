'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '@/lib/env/server';
import type { Provider } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

type SupportedProvider = 'kakao' | 'apple';

function isSupportedProvider(value: unknown): value is SupportedProvider {
  return value === 'kakao' || value === 'apple';
}

// 제공자별 추가 스코프. Apple은 이름과 이메일을 명시적으로 요청해야 전달한다.
const PROVIDER_SCOPES: Partial<Record<SupportedProvider, string>> = {
  apple: 'name email',
};

/**
 * 카카오와 애플 OAuth 로그인을 트리거하는 Server Action
 */
export async function signInWithOAuth(provider: SupportedProvider) {
  if (!isSupportedProvider(provider)) {
    throw new Error('지원하지 않는 로그인 제공자입니다.');
  }

  const supabase = await createClient();
  
  // 사이트 도메인 (개발 단계와 배포 단계를 대응하기 위해 환경변수로 제어)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      scopes: PROVIDER_SCOPES[provider],
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.url) {
    redirect(data.url);
  }
}

/**
 * 로그아웃 Server Action
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/**
 * 회원 탈퇴 Server Action.
 *
 * Apple 로그인을 제공하는 앱은 App Store 심사 지침에 따라 앱 내 계정 삭제 경로를
 * 제공해야 한다. auth.users 삭제는 service role 권한이 필요하며,
 * public.profiles는 on delete cascade로 함께 정리된다.
 */
export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('로그인 상태가 아닙니다.');
  }

  const adminClient = createSupabaseAdminClient(
    getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  );

  const { error } = await adminClient.auth.admin.deleteUser(user.id);

  if (error) {
    throw new Error(`계정 삭제에 실패했습니다: ${error.message}`);
  }

  // 삭제 후 남은 쿠키 세션을 정리한다.
  await supabase.auth.signOut();
  redirect('/?account-deleted=true');
}
