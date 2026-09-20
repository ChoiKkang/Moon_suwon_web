import type { PublicDataBlock } from '@/lib/places/public-extras';

const APP_RELEASE_CONTACT = 'mailto:hynjni7890@gmail.com?subject=%EB%8B%AC%EB%B9%9B%EC%88%98%EC%9B%90%20%EC%95%B1%20%EC%B6%9C%EC%8B%9C%20%EC%86%8C%EC%8B%9D';

export type AppCtaTarget = {
  href: string;
  label: string;
  external: boolean;
};

/**
 * Store URLs are configuration, not content. Only absolute http(s) URLs are
 * accepted; the fallback is a real support contact and never pretends the app
 * is downloadable before a store listing exists.
 */
export function getAppCtaTarget(value: string | null | undefined): AppCtaTarget {
  const candidate = value?.trim() ?? '';
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return { href: url.toString(), label: '앱에서 미션 이어가기', external: true };
    }
  } catch {
    // Use the support fallback below for empty or malformed configuration.
  }
  return { href: APP_RELEASE_CONTACT, label: '앱 출시 소식 문의하기', external: true };
}
export function shouldShowPublicBlock<T>(block: PublicDataBlock<T>): boolean {
  return block.items.length > 0 && block.dataStatus !== 'expired';
}
