import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const rawBaseUrl = process.env.DEPLOYMENT_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
const placeSlug = process.env.PUBLIC_PLACE_SLUG ?? 'paldalmun';

if (!rawBaseUrl) {
  throw new Error('DEPLOYMENT_URL 또는 NEXT_PUBLIC_SITE_URL이 필요합니다.');
}

let baseUrl: URL;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  throw new Error('DEPLOYMENT_URL은 http(s) URL이어야 합니다.');
}

if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
  throw new Error('DEPLOYMENT_URL은 http(s) URL이어야 합니다.');
}

type RouteCheck = { path: string; status: number; ok: boolean; note?: string };

async function checkRoute(path: string, options?: RequestInit): Promise<RouteCheck> {
  const response = await fetch(new URL(path, baseUrl), { redirect: 'manual', ...options });
  const location = response.headers.get('location');
  return {
    path,
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    note: location ? `location=${location}` : undefined,
  };
}

async function main() {
  const checks = await Promise.all([
    checkRoute('/'),
    checkRoute('/courses'),
    checkRoute(`/places/${encodeURIComponent(placeSlug)}`),
    checkRoute('/robots.txt'),
    checkRoute('/sitemap.xml'),
    checkRoute('/admin/operations'),
  ]);

  for (const check of checks) {
    const adminProtected = check.path.startsWith('/admin/')
      && ((check.status >= 300 && check.status < 400) || check.status === 401 || check.status === 403);
    const ok = check.path.startsWith('/admin/') ? adminProtected : check.ok;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.path} HTTP ${check.status}${check.note ? ` (${check.note})` : ''}`);
    check.ok = ok;
  }

  if (checks.some((check) => !check.ok)) {
    throw new Error('배포 route smoke check가 실패했습니다.');
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
