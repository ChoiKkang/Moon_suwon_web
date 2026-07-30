# KTO Content Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the Phase 1 KTO content ingestion path so TourAPI data can be fetched, stored in Supabase-shaped tables, and read through serving views, while leaving a clean path to Phase 2 Edge Function sync.

**Architecture:** Create a focused Supabase schema migration for `core`, `editorial`, and `serving`, then add a Node-based KTO client and import script that fetches `areaBasedList2`, `detailCommon2`, and `detailImage2`. The import script uses service-role credentials only on the server side, writes KTO facts into `core`, keeps curated copy in `editorial`, and verifies reads from `serving` views.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase JS v2, Supabase CLI SQL migrations, Node 20, native `fetch`.

---

## File Structure

- Create `supabase/migrations/20260704082448_create_kto_content_schema.sql`: Creates `core`, `editorial`, `serving`, and the Phase 1 tables/views needed for KTO content.
- Create `src/lib/env/server.ts`: Server-only environment helper for required secrets.
- Create `src/lib/kto/types.ts`: Type definitions for KTO list/detail/image items and normalized import records.
- Create `src/lib/kto/client.ts`: KTO API client with safe URL construction and no secret logging.
- Create `src/lib/kto/normalize.ts`: Pure functions for converting KTO fields into DB-ready records.
- Create `scripts/import-kto-content.ts`: CLI script that fetches KTO content and upserts selected records into Supabase.
- Create `scripts/verify-kto-serving.ts`: CLI script that reads serving views and reports imported rows.
- Modify `.env.local.example`: Add server-only env var names without real values.
- Modify `test_kto_api.py`: Remove hardcoded key and read `KTO_SERVICE_KEY` from environment.
- Modify `package.json`: Add `kto:import`, `kto:verify`, and `typecheck` scripts.

## Task 1: Environment and Secret Hygiene

**Files:**
- Modify: `.env.local.example`
- Modify: `test_kto_api.py`
- Create: `src/lib/env/server.ts`
- Modify: `package.json`

- [ ] **Step 1: Update `.env.local.example` with server-only keys**

Add these lines below the existing public Supabase values:

```env
# Server-only credentials. Do not expose these with NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
KTO_SERVICE_KEY=your-kto-service-key
SYNC_JOB_TOKEN=your-internal-sync-token
```

- [ ] **Step 2: Replace hardcoded KTO key in `test_kto_api.py`**

Replace the top of the file with:

```python
import os
import requests

SERVICE_KEY = os.environ.get("KTO_SERVICE_KEY")

if not SERVICE_KEY:
    raise RuntimeError("KTO_SERVICE_KEY environment variable is required")
```

Keep the existing request flow, but never print the full URL with `serviceKey`. Replace:

```python
print(f"[Request URL]: {url}")
```

with:

```python
print(f"[Request URL]: {endpoint}?query=[REDACTED]&serviceKey=[REDACTED]")
```

- [ ] **Step 3: Create `src/lib/env/server.ts`**

```ts
const REQUIRED_SERVER_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'KTO_SERVICE_KEY',
] as const;

type RequiredServerEnvKey = (typeof REQUIRED_SERVER_ENV_KEYS)[number];

export function getRequiredServerEnv(key: RequiredServerEnvKey): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required server environment variable: ${key}`);
  }

  return value;
}
```

- [ ] **Step 4: Add scripts to `package.json`**

Add these scripts while keeping the existing ones:

```json
{
  "typecheck": "tsc --noEmit",
  "kto:import": "tsx scripts/import-kto-content.ts",
  "kto:verify": "tsx scripts/verify-kto-serving.ts"
}
```

If `tsx` is not installed, add it to `devDependencies`:

```json
"tsx": "^4.20.6"
```

- [ ] **Step 5: Verify env hygiene**

Run:

```bash
npm run typecheck
```

Expected: TypeScript completes without errors after later TypeScript files are added. If `tsx` was newly added, run `npm install` before this check.

- [ ] **Step 6: Commit**

```bash
git add .env.local.example test_kto_api.py src/lib/env/server.ts package.json package-lock.json
git commit -m "chore: move KTO key to server env"
```

## Task 2: Supabase Schema Migration

**Files:**
- Create: `supabase/migrations/20260704082448_create_kto_content_schema.sql`

- [ ] **Step 1: Create schema migration**

Create `supabase/migrations/20260704082448_create_kto_content_schema.sql` with:

```sql
create schema if not exists core;
create schema if not exists editorial;
create schema if not exists serving;

create extension if not exists pgcrypto;

create table if not exists core.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  official_name text not null,
  address_full text,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  contact_phone text,
  source_overview_raw text,
  short_description text,
  recommended_stay_min int default 30,
  category text,
  is_active boolean default true,
  source_modified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists core.place_sources (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null unique references core.places(id) on delete cascade,
  kto_content_id text not null unique,
  kto_content_type_id text not null,
  sync_enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists core.place_images (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references core.places(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,
  alt_text text,
  copyright_type text,
  source_provider text default 'KTO',
  source_image_id text,
  is_hero boolean default false,
  display_order int default 0,
  created_at timestamptz default now(),
  unique (place_id, source_provider, source_image_id)
);

create table if not exists editorial.place_copy (
  place_id uuid primary key references core.places(id) on delete cascade,
  display_name text,
  short_description text,
  night_highlight text,
  photo_tip text,
  mission_title text,
  mission_body text,
  mission_radius_m int default 80,
  og_title text,
  og_description text,
  og_image_url text,
  updated_at timestamptz default now()
);

create or replace view serving.v_imported_places
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.official_name,
  coalesce(pc.display_name, p.official_name) as display_name,
  p.address_full,
  p.lat,
  p.lng,
  p.contact_phone,
  p.source_overview_raw,
  coalesce(pc.short_description, p.short_description) as short_description,
  p.category,
  ps.kto_content_id,
  ps.kto_content_type_id,
  hero.image_url as hero_image_url,
  hero.thumbnail_url as hero_thumbnail_url,
  p.source_modified_at,
  p.is_active
from core.places p
left join core.place_sources ps on ps.place_id = p.id
left join editorial.place_copy pc on pc.place_id = p.id
left join lateral (
  select image_url, thumbnail_url
  from core.place_images pi
  where pi.place_id = p.id and pi.is_hero = true
  order by pi.display_order asc, pi.created_at asc
  limit 1
) hero on true
where p.is_active = true;

grant usage on schema serving to anon, authenticated;
grant select on serving.v_imported_places to anon, authenticated;
```

- [ ] **Step 2: Verify SQL syntax locally**

Run:

```bash
supabase db reset --local
```

Expected: Migration applies without SQL errors. If local Supabase is not running, use:

```bash
supabase start
supabase db reset --local
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704082448_create_kto_content_schema.sql
git commit -m "feat: add KTO content schema"
```

## Task 3: KTO Client and Normalization

**Files:**
- Create: `src/lib/kto/types.ts`
- Create: `src/lib/kto/client.ts`
- Create: `src/lib/kto/normalize.ts`

- [ ] **Step 1: Create `src/lib/kto/types.ts`**

```ts
export type KtoListItem = {
  contentid: string;
  contenttypeid: string;
  title: string;
  addr1?: string;
  addr2?: string;
  mapx?: string;
  mapy?: string;
  tel?: string;
  firstimage?: string;
  firstimage2?: string;
  modifiedtime?: string;
};

export type KtoDetailItem = KtoListItem & {
  overview?: string;
  homepage?: string;
  telname?: string;
  createdtime?: string;
};

export type KtoImageItem = {
  contentid: string;
  originimgurl: string;
  smallimageurl?: string;
  imgname?: string;
  serialnum?: string;
  cpyrhtDivCd?: string;
};

export type KtoApiResponse<T> = {
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?: {
        item?: T | T[];
      } | string;
      totalCount?: number;
      pageNo?: number;
      numOfRows?: number;
    };
  };
  resultCode?: string;
  resultMsg?: string;
};

export type NormalizedPlace = {
  slug: string;
  official_name: string;
  address_full: string | null;
  lat: number;
  lng: number;
  contact_phone: string | null;
  source_overview_raw: string | null;
  source_modified_at: string | null;
  category: string | null;
  kto_content_id: string;
  kto_content_type_id: string;
};
```

- [ ] **Step 2: Create `src/lib/kto/client.ts`**

```ts
import type { KtoApiResponse, KtoDetailItem, KtoImageItem, KtoListItem } from './types';

const KTO_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';

type KtoClientOptions = {
  serviceKey: string;
  mobileApp?: string;
  mobileOS?: string;
};

export class KtoClient {
  private readonly serviceKey: string;
  private readonly mobileApp: string;
  private readonly mobileOS: string;

  constructor(options: KtoClientOptions) {
    this.serviceKey = options.serviceKey;
    this.mobileApp = options.mobileApp ?? 'moon_suwon';
    this.mobileOS = options.mobileOS ?? 'ETC';
  }

  async fetchSuwonAttractions(): Promise<KtoListItem[]> {
    return this.requestItems<KtoListItem>('areaBasedList2', {
      areaCode: '31',
      sigunguCode: '13',
      contentTypeId: '12',
      numOfRows: '100',
      pageNo: '1',
    });
  }

  async fetchDetail(contentId: string): Promise<KtoDetailItem | null> {
    const items = await this.requestItems<KtoDetailItem>('detailCommon2', {
      contentId,
    });

    return items[0] ?? null;
  }

  async fetchImages(contentId: string): Promise<KtoImageItem[]> {
    return this.requestItems<KtoImageItem>('detailImage2', {
      contentId,
      numOfRows: '50',
      pageNo: '1',
    });
  }

  private async requestItems<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
    const url = new URL(`${KTO_BASE_URL}/${endpoint}`);
    url.searchParams.set('MobileOS', this.mobileOS);
    url.searchParams.set('MobileApp', this.mobileApp);
    url.searchParams.set('_type', 'json');

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set('serviceKey', this.serviceKey);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`KTO request failed: ${endpoint} ${response.status}`);
    }

    const payload = (await response.json()) as KtoApiResponse<T>;
    const header = payload.response?.header;

    if (payload.resultCode && payload.resultCode !== '0000') {
      throw new Error(`KTO request failed: ${endpoint} ${payload.resultCode} ${payload.resultMsg ?? ''}`.trim());
    }

    if (header?.resultCode && header.resultCode !== '0000') {
      throw new Error(`KTO request failed: ${endpoint} ${header.resultCode} ${header.resultMsg ?? ''}`.trim());
    }

    const items = payload.response?.body?.items;
    const item = typeof items === 'object' ? items.item : undefined;

    if (!item) {
      return [];
    }

    return Array.isArray(item) ? item : [item];
  }
}
```

- [ ] **Step 3: Create `src/lib/kto/normalize.ts`**

```ts
import type { KtoDetailItem, KtoImageItem, KtoListItem, NormalizedPlace } from './types';

export function normalizeSlug(title: string, contentId: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${base || 'place'}-${contentId}`;
}

export function parseKtoTimestamp(value?: string): string | null {
  if (!value || !/^\d{14}$/.test(value)) {
    return null;
  }

  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  const second = value.slice(12, 14);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`;
}

export function normalizePlace(listItem: KtoListItem, detail: KtoDetailItem | null): NormalizedPlace {
  const lat = Number(listItem.mapy);
  const lng = Number(listItem.mapx);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Invalid coordinates for KTO content ${source.contentid}`);
  }

  const address = [source.addr1, source.addr2].filter(Boolean).join(' ').trim();
  const phone = source.tel?.trim() || null;

  return {
    slug: normalizeSlug(source.title, source.contentid),
    official_name: source.title,
    address_full: address || null,
    lat,
    lng,
    contact_phone: phone,
    source_overview_raw: detail?.overview?.trim() || null,
    source_modified_at: parseKtoTimestamp(source.modifiedtime),
    category: null,
    kto_content_id: source.contentid,
    kto_content_type_id: source.contenttypeid,
  };
}

export function normalizeImages(
  placeId: string,
  listItem: KtoListItem,
  imageItems: KtoImageItem[],
) {
  const rows = [];

  if (listItem.firstimage) {
    rows.push({
      place_id: placeId,
      image_url: listItem.firstimage,
      thumbnail_url: listItem.firstimage2 || null,
      alt_text: listItem.title,
      copyright_type: null,
      source_provider: 'KTO',
      source_image_id: `${listItem.contentid}:firstimage`,
      is_hero: true,
      display_order: 0,
    });
  }

  for (const [index, item] of imageItems.entries()) {
    if (!item.originimgurl) {
      continue;
    }

    rows.push({
      place_id: placeId,
      image_url: item.originimgurl,
      thumbnail_url: item.smallimageurl || null,
      alt_text: item.imgname || listItem.title,
      copyright_type: item.cpyrhtDivCd || null,
      source_provider: 'KTO',
      source_image_id: item.serialnum || `${item.contentid}:image:${index}`,
      is_hero: false,
      display_order: index + 1,
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kto/types.ts src/lib/kto/client.ts src/lib/kto/normalize.ts
git commit -m "feat: add KTO API client"
```

## Task 4: Import KTO Content into Supabase

**Files:**
- Create: `scripts/import-kto-content.ts`

- [ ] **Step 1: Create `scripts/import-kto-content.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '../src/lib/env/server';
import { KtoClient } from '../src/lib/kto/client';
import { normalizeImages, normalizePlace } from '../src/lib/kto/normalize';

const SELECTED_TITLES = new Set([
  '연무대(동장대)',
  '동북공심돈',
  '봉돈',
  '수원통닭거리',
  '수원 지동벽화마을',
  '수원화성박물관',
]);

const supabase = createClient(
  getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const kto = new KtoClient({
  serviceKey: getRequiredServerEnv('KTO_SERVICE_KEY'),
});

async function upsertPlace(listItem: Awaited<ReturnType<KtoClient['fetchSuwonAttractions']>>[number]) {
  const detail = await kto.fetchDetail(listItem.contentid);
  const normalized = normalizePlace(listItem, detail);

  const { data: place, error: placeError } = await supabase
    .schema('core')
    .from('places')
    .upsert(
      {
        slug: normalized.slug,
        official_name: normalized.official_name,
        address_full: normalized.address_full,
        lat: normalized.lat,
        lng: normalized.lng,
        contact_phone: normalized.contact_phone,
        source_overview_raw: normalized.source_overview_raw,
        source_modified_at: normalized.source_modified_at,
        category: normalized.category,
        is_active: true,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();

  if (placeError) {
    throw new Error(`Failed to upsert place ${listItem.contentid}: ${placeError.message}`);
  }

  const { error: sourceError } = await supabase
    .schema('core')
    .from('place_sources')
    .upsert(
      {
        place_id: place.id,
        kto_content_id: normalized.kto_content_id,
        kto_content_type_id: normalized.kto_content_type_id,
        sync_enabled: true,
      },
      { onConflict: 'kto_content_id' },
    );

  if (sourceError) {
    throw new Error(`Failed to upsert source ${listItem.contentid}: ${sourceError.message}`);
  }

  const images = normalizeImages(place.id, listItem, await kto.fetchImages(listItem.contentid));

  if (images.length > 0) {
    const { error: imageError } = await supabase
      .schema('core')
      .from('place_images')
      .upsert(images, { onConflict: 'place_id,source_provider,source_image_id' });

    if (imageError) {
      throw new Error(`Failed to upsert images ${listItem.contentid}: ${imageError.message}`);
    }
  }

  const { error: copyError } = await supabase
    .schema('editorial')
    .from('place_copy')
    .upsert(
      {
        place_id: place.id,
        display_name: normalized.official_name,
        short_description: normalized.source_overview_raw?.slice(0, 120) ?? null,
        og_title: `${normalized.official_name} | 달빛수원`,
        og_description: normalized.source_overview_raw?.slice(0, 150) ?? null,
      },
      { onConflict: 'place_id' },
    );

  if (copyError) {
    throw new Error(`Failed to upsert editorial copy ${listItem.contentid}: ${copyError.message}`);
  }

  return normalized.official_name;
}

async function main() {
  const attractions = await kto.fetchSuwonAttractions();
  const selected = attractions.filter((item) => SELECTED_TITLES.has(item.title));

  process.stdout.write(`Fetched ${attractions.length} KTO Suwon attractions\n`);
  process.stdout.write(`Selected ${selected.length} places for import\n`);

  for (const item of selected) {
    const name = await upsertPlace(item);
    process.stdout.write(`Imported ${name}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Run import**

Run:

```bash
npm run kto:import
```

Expected:

```txt
Fetched 43 KTO Suwon attractions
Selected 5 places for import
Imported 연무대(동장대)
```

If the command fails with `Invalid API key`, update `.env.local` with the current Supabase anon/service-role keys and rerun.

- [ ] **Step 3: Commit**

```bash
git add scripts/import-kto-content.ts
git commit -m "feat: import KTO places into Supabase"
```

## Task 5: Verify Serving View Calls

**Files:**
- Create: `scripts/verify-kto-serving.ts`

- [ ] **Step 1: Create `scripts/verify-kto-serving.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '../src/lib/env/server';

const supabase = createClient(
  getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

async function main() {
  const { data, error } = await supabase
    .schema('serving')
    .from('v_imported_places')
    .select('slug, display_name, address_full, hero_image_url, kto_content_id')
    .limit(20);

  if (error) {
    throw new Error(`Failed to read serving.v_imported_places: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('serving.v_imported_places returned 0 rows');
  }

  process.stdout.write(`Serving rows: ${data.length}\n`);

  for (const row of data) {
    process.stdout.write(`${row.display_name} | ${row.kto_content_id} | ${row.hero_image_url ?? 'no image'}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Run serving verification**

Run:

```bash
npm run kto:verify
```

Expected:

```txt
Serving rows: 5
연무대(동장대) | 1064469 | https://...
```

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-kto-serving.ts
git commit -m "test: verify KTO serving reads"
```

## Task 6: Project Direction Summary

**Files:**
- Create: `docs/kto-content-direction-summary.md`

- [ ] **Step 1: Create summary document**

```md
# 달빛수원 KTO 콘텐츠 적용 방향

## 결론

달빛수원은 공공데이터 기반 관광 DB가 아니라, 공공데이터로 신뢰도를 확보한 야간 큐레이션 서비스로 간다.

## 데이터 역할

- TourAPI: 관광지명, 주소, 좌표, 원문 개요, 이미지, contentid 기준 동기화
- core: 정규화된 기준 데이터
- editorial: 야간 포인트, 포토팁, 미션, SEO 문구
- serving: 앱/웹이 읽는 완성 데이터

## 추천 코스

1. 성곽 야경 입문 코스: 연무대, 동북공심돈, 봉돈, 지동벽화마을, 수원통닭거리
2. 사진 중심 코스: 방화수류정, 화홍문, 용연, 성곽 조망 지점
3. 로컬 상권 연결 코스: 수원통닭거리, 행궁동 카페, 소품샵, 전통시장 후보

## 운영 원칙

- 앱과 웹은 TourAPI를 직접 호출하지 않는다.
- TourAPI 키는 서버/Edge Function Secret에만 둔다.
- KTO에 없는 핵심 스팟은 자체 스팟으로 관리한다.
- 공공데이터 개요는 참고 원문으로 보존하고, 노출 문구는 editorial에서 작성한다.
```

- [ ] **Step 2: Commit**

```bash
git add docs/kto-content-direction-summary.md
git commit -m "docs: summarize KTO content direction"
```

## Task 7: Final Verification

**Files:**
- No new files

- [ ] **Step 1: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run KTO import**

Run:

```bash
npm run kto:import
```

Expected: KTO places imported into Supabase without logging secrets.

- [ ] **Step 4: Run serving verification**

Run:

```bash
npm run kto:verify
```

Expected: `serving.v_imported_places` returns imported rows.

- [ ] **Step 5: Commit any verification fixes**

```bash
git status --short
git add .env.local.example test_kto_api.py package.json package-lock.json src/lib/env/server.ts src/lib/kto scripts supabase/migrations docs/kto-content-direction-summary.md
git commit -m "fix: complete KTO content verification"
```

## Self-Review

- Spec coverage: The plan covers DB status, schema creation, KTO response mapping, Phase 1 import, serving calls, key hygiene, and project direction summary.
- Placeholder scan: No placeholder markers or unstated edge handling is left in the plan.
- Type consistency: `KtoClient`, `KtoListItem`, `KtoDetailItem`, `KtoImageItem`, and `NormalizedPlace` are defined before use. Script names match `package.json` scripts.
