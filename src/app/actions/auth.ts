'use server';

import { createClient } from '@/lib/supabase/server';
import type { Provider } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

/**
 * 카카오, 네이버, 애플 등의 OAuth 로그인 트리거 Server Action
 */
export async function signInWithOAuth(provider: 'kakao' | 'naver' | 'apple') {
  const supabase = await createClient();
  
  // 사이트 도메인 (개발 단계와 배포 단계를 대응하기 위해 환경변수로 제어)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
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
