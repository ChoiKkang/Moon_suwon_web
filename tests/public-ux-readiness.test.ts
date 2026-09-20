import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(process.cwd());

test('landing hero assets use browser-readable PNG paths', () => {
  const landing = readFileSync(join(root, 'src/components/landing-client.tsx'), 'utf8');
  const assetRefs = [...landing.matchAll(/src="(\/assets\/[^\"]+\.png)"/g)].map((match) => match[1]);

  assert.equal(assetRefs.length, 2);
  for (const assetRef of assetRefs) {
    const assetPath = join(root, 'public', assetRef.slice(1));
    assert.equal(existsSync(assetPath), true, assetRef);
    assert.deepEqual(readFileSync(assetPath).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
});

test('public cards and place detail have useful no-image fallbacks', () => {
  const landing = readFileSync(join(root, 'src/components/landing-client.tsx'), 'utf8');
  const courses = readFileSync(join(root, 'src/app/courses/page.tsx'), 'utf8');
  const events = readFileSync(join(root, 'src/app/events/page.tsx'), 'utf8');
  const place = readFileSync(join(root, 'src/app/places/[slug]/page.tsx'), 'utf8');
  const placeholder = readFileSync(join(root, 'src/components/public/visual-placeholder.tsx'), 'utf8');

  assert.match(placeholder, /대표 이미지를 준비 중입니다/);
  assert.match(landing, /VisualPlaceholder/);
  assert.match(courses, /VisualPlaceholder/);
  assert.match(events, /VisualPlaceholder/);
  assert.match(place, /hasHeroImage/);
  assert.match(place, /min-h-\[52vh\]/);
  assert.match(place, /대표 이미지를 준비 중인 장소입니다/);
});

test('mobile public navigation communicates horizontal rails and keeps the hero phrase together', () => {
  const landing = readFileSync(join(root, 'src/components/landing-client.tsx'), 'utf8');
  const rail = readFileSync(join(root, 'src/components/public/scroll-rail.tsx'), 'utf8');

  assert.match(landing, /whitespace-nowrap[^>]*>가장</);
  assert.match(rail, /좌우로 밀어 더 보기/);
});

test('scheduled sync accepts one shared service key when provider keys are identical', () => {
  const workflow = readFileSync(join(root, '.github/workflows/public-data-sync.yml'), 'utf8');

  assert.match(workflow, /KMA_SERVICE_KEY: \$\{\{ secrets\.KMA_SERVICE_KEY \|\| secrets\.KTO_SERVICE_KEY \}\}/);
  assert.match(workflow, /GG_BUS_SERVICE_KEY: \$\{\{ secrets\.GG_BUS_SERVICE_KEY \|\| secrets\.KTO_SERVICE_KEY \}\}/);
});
