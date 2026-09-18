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

  if (listItem.firstimage) {
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

  for (const [index, item] of imageItems.entries()) {
    if (!item.originimgurl) {
      continue;
    }

    rows.push({
      place_id: placeId,
      image_url: toSecureImageUrl(item.originimgurl)!,
      thumbnail_url: toSecureImageUrl(item.smallimageurl),
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
