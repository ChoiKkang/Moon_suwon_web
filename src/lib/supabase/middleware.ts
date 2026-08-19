import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 중요: getUser()를 호출해야 세션 토큰이 유효한지 확인하고 적절히 갱신합니다.
  // 오래된 브라우저 쿠키의 refresh_token_not_found가 모든 요청을 서버 로그에 쌓지 않도록
  // 해당 쿠키만 정리하고 익명 요청으로 계속 진행한다.
  try {
    await supabase.auth.getUser();
  } catch {
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-')) {
        supabaseResponse.cookies.delete(cookie.name);
      }
    }
  }

  return supabaseResponse;
}
