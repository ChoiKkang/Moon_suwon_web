import type {
  KtoDetailItem,
  KtoFestivalItem,
  KtoImageItem,
  KtoListItem,
  NormalizedEvent,
  NormalizedPlace,
} from './types';
import { toSecureImageUrl } from '@/lib/media/urls';

export function normalizeSlug(title: string, contentId: string): string {
  // NFKD folds compatibility forms (full-width, ligatures) but also splits
  // Hangul syllables into conjoining jamo. Recomposing with NFC afterwards
  // keeps the folding while storing "봉돈" as one code point per syllable, so a
  // slug typed or shared from a browser matches the stored value exactly.
  const base = title
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .normalize('NFC');

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
    throw new Error(`Invalid coordinates for KTO content ${listItem.contentid}`);
  }

  const address = [listItem.addr1, listItem.addr2].filter(Boolean).join(' ').trim();
  const phone = (detail?.tel ?? listItem.tel)?.trim() || null;

  return {
    slug: normalizeSlug(listItem.title, listItem.contentid),
    official_name: listItem.title,
    address_full: address || null,
    lat,
    lng,
    contact_phone: phone,
    source_overview_raw: detail?.overview?.trim() || null,
    source_modified_at: parseKtoTimestamp(detail?.modifiedtime ?? listItem.modifiedtime),
    category: null,
    kto_content_id: listItem.contentid,
    kto_content_type_id: listItem.contenttypeid,
  };
}

export function normalizeImages(
  placeId: string,
  listItem: KtoListItem,
  imageItems: KtoImageItem[],
) {
  const rows = [];

  // 목록 응답의 firstimage를 대표 이미지로 쓴다. KTO가 이 필드를 비워 보내는
  // 경우가 있어 그때는 상세 이미지 첫 장을 대표로 올린다. 비워 보낸 장소가
  // 수원화성 장안문·팔달문·화홍문·방화수류정과 화성행궁이었는데, 상세로는
  // 19~22장이 오는데도 대표가 없어 목록과 상세에서 "이미지 준비 중"이 떴다.
  const hasFirstImage = Boolean(listItem.firstimage);

  if (hasFirstImage) {
    rows.push({
      place_id: placeId,
      image_url: toSecureImageUrl(listItem.firstimage)!,
      thumbnail_url: toSecureImageUrl(listItem.firstimage2),
      alt_text: listItem.title,
      copyright_type: null,
      source_provider: 'KTO',
      source_image_id: `${listItem.contentid}:firstimage`,
      is_hero: true,
      display_order: 0,
    });
  }

  let heroAssigned = hasFirstImage;

  for (const [index, item] of imageItems.entries()) {
    if (!item.originimgurl) {
      continue;
    }

    const isHero = !heroAssigned;
    if (isHero) heroAssigned = true;

    rows.push({
      place_id: placeId,
      image_url: toSecureImageUrl(item.originimgurl)!,
      thumbnail_url: toSecureImageUrl(item.smallimageurl),
      alt_text: item.imgname || listItem.title,
      copyright_type: item.cpyrhtDivCd || null,
      source_provider: 'KTO',
      source_image_id: item.serialnum || `${item.contentid}:image:${index}`,
      is_hero: isHero,
      display_order: index + 1,
    });
  }

  return rows;
}

function parseKtoDate(value?: string): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function normalizeFestival(item: KtoFestivalItem): NormalizedEvent {
  const startDate = parseKtoDate(item.eventstartdate);
  const endDate = parseKtoDate(item.eventenddate);
  if (!startDate || !endDate) {
    throw new Error(`Invalid festival dates for KTO content ${item.contentid}`);
  }

  const lat = item.mapy ? Number(item.mapy) : null;
  const lng = item.mapx ? Number(item.mapx) : null;

  return {
    content_id: item.contentid,
    event_name: item.title,
    start_date: startDate,
    end_date: endDate,
    venue_address: [item.addr1, item.addr2].filter(Boolean).join(' ').trim() || null,
    lat: lat !== null && Number.isFinite(lat) ? lat : null,
    lng: lng !== null && Number.isFinite(lng) ? lng : null,
    hero_image_url: toSecureImageUrl(item.firstimage),
    contact_phone: item.tel?.trim() || null,
    event_place: item.eventplace?.trim() || null,
    play_time: item.playtime?.trim() || null,
    usage_fee: item.usetimefestival?.trim() || null,
    program_raw: item.program?.trim() || null,
    source_modified_at: parseKtoTimestamp(item.modifiedtime),
  };
}

// searchFestival2 ignores areaCode/sigunguCode and returns items whose own
// areacode/sigungucode fields are empty, so Suwon events are selected from the
// nationwide list by matching the address, venue, or title text instead.
export function isSuwonFestival(item: KtoFestivalItem): boolean {
  const haystack = [item.addr1, item.addr2, item.eventplace, item.title]
    .filter(Boolean)
    .join(' ');
  return haystack.includes('수원');
}
