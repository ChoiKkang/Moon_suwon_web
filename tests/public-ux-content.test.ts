import assert from 'node:assert/strict';
import test from 'node:test';

import { getAppCtaTarget, shouldShowPublicBlock } from '@/lib/public/ux-content';

test('app CTA uses a configured absolute store URL only', () => {
  assert.deepEqual(getAppCtaTarget('https://apps.example.com/moon'), {
    href: 'https://apps.example.com/moon',
    label: '앱에서 미션 이어가기',
    external: true,
  });
  assert.deepEqual(getAppCtaTarget('javascript:alert(1)'), {
    href: 'mailto:hynjni7890@gmail.com?subject=%EB%8B%AC%EB%B9%9B%EC%88%98%EC%9B%90%20%EC%95%B1%20%EC%B6%9C%EC%8B%9C%20%EC%86%8C%EC%8B%9D',
    label: '앱 출시 소식 문의하기',
    external: true,
  });
  assert.equal(getAppCtaTarget(null).external, true);
});

test('public optional blocks show populated stale data but hide empty or expired data', () => {
  assert.equal(shouldShowPublicBlock({ items: ['story'], dataStatus: 'stale', sourceUpdatedAt: null, fetchedAt: null }), true);
  assert.equal(shouldShowPublicBlock({ items: [], dataStatus: 'fresh', sourceUpdatedAt: null, fetchedAt: null }), false);
  assert.equal(shouldShowPublicBlock({ items: ['arrival'], dataStatus: 'expired', sourceUpdatedAt: null, fetchedAt: null }), false);
});
