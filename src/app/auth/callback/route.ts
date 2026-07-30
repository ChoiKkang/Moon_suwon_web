/**
 * OAuth 콜백 처리.
 *
 * Supabase는 Apple의 form_post 응답을 프로젝트 도메인에서 먼저 수신한 뒤
 * 이 경로로 code를 붙여 GET 리다이렉트한다. 다만 Apple provider 설정이나
 * Supabase 버전에 따라 브라우저가 이 경로로 POST를 보내는 경우가 있어
 * POST 핸들러도 함께 제공한다.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 오픈 리다이렉트를 막기 위해 앱 내부 경로만 허용한다.
function resolveNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return '/';
  }

  return rawNext;
}

function resolveRedirectBase(request: Request, origin: string): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';

  if (isLocalEnv || !forwardedHost) {
    return origin;
  }

  // reverse proxy 뒤에서는 외부에 노출된 호스트로 되돌린다.
  return `https://${forwardedHost}`;
}

async function completeSignIn(request: Request, code: string | null, rawNext: string | null) {
  const { origin } = new URL(request.url);
  const next = resolveNextPath(rawNext);
  const base = resolveRedirectBase(request, origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  // 실패 시 에러 알림 파라미터를 들고 메인 페이지로 리다이렉트
  return NextResponse.redirect(`${base}/?auth-error=true`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return completeSignIn(request, searchParams.get('code'), searchParams.get('next'));
}

/**
 * Apple은 name/email 스코프를 요청하면 response_mode=form_post로 콜백한다.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);

  let code = searchParams.get('code');
  let next = searchParams.get('next');

  try {
    const formData = await request.formData();
    code = code ?? (formData.get('code') as string | null);
    next = next ?? (formData.get('next') as string | null);
  } catch {
    // 본문이 폼 형식이 아니면 쿼리 파라미터만 사용한다.
  }

  return completeSignIn(request, code, next);
}
