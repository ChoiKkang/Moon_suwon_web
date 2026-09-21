import assert from 'node:assert/strict';
import test from 'node:test';

import { getAppCtaTarget, shouldShowPublicBlock } from '@/lib/public/ux-content';

test('app CTA uses a configured absolute store URL only', () => {
  assert.deepEqual(getAppCtaTarget('https://apps.example.com/moon'), {
    href: 'https://apps.example.com/moon',
    label: '앱에서 미션 이어가기',
    external: true,
  });
  assert.equal(getAppCtaTarget('javascript:alert(1)'), null);
  assert.equal(getAppCtaTarget(null), null);
});

test('public optional blocks show populated stale data but hide empty or expired data', () => {
  assert.equal(shouldShowPublicBlock({ items: ['story'], dataStatus: 'stale', sourceUpdatedAt: null, fetchedAt: null }), true);
  assert.equal(shouldShowPublicBlock({ items: [], dataStatus: 'fresh', sourceUpdatedAt: null, fetchedAt: null }), false);
  assert.equal(shouldShowPublicBlock({ items: ['arrival'], dataStatus: 'expired', sourceUpdatedAt: null, fetchedAt: null }), false);
});
