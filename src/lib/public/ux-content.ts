import type { PublicDataBlock } from '@/lib/places/public-extras';

export type AppCtaTarget = {
  href: string;
  label: string;
  external: boolean;
};

/**
 * Store URLs are configuration, not content. Only absolute http(s) URLs are
 * accepted. Until a real store listing exists, the CTA stays hidden rather
 * than exposing a placeholder contact action.
 */
export function getAppCtaTarget(value: string | null | undefined): AppCtaTarget | null {
  const candidate = value?.trim() ?? '';
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return { href: url.toString(), label: '앱에서 미션 이어가기', external: true };
    }
  } catch {
    // Invalid store configuration stays hidden until a real listing is configured.
  }
  return null;
}
export function shouldShowPublicBlock<T>(block: PublicDataBlock<T>): boolean {
  return block.items.length > 0 && block.dataStatus !== 'expired';
}
