import { createClient } from '@/lib/supabase/server';
import { toSecureImageUrl } from '@/lib/media/urls';

export type UpcomingEvent = {
  id: string;
  eventContentId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  venueAddress: string | null;
  eventPlace: string | null;
  playTime: string | null;
  usageFee: string | null;
  heroImageUrl: string | null;
  programRaw: string | null;
  contactPhone: string | null;
  lat: number | null;
  lng: number | null;
};

type UpcomingEventRow = {
  id: string;
  event_content_id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  venue_address: string | null;
  event_place: string | null;
  play_time: string | null;
  usage_fee: string | null;
  hero_image_url: string | null;
  program_raw?: string | null;
  contact_phone?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
};

const EVENT_SELECT =
  'id, event_content_id, event_name, start_date, end_date, venue_address, event_place, play_time, usage_fee, hero_image_url, program_raw, contact_phone, lat, lng';

function mapEvent(event: UpcomingEventRow): UpcomingEvent {
  return {
    id: event.id,
    eventContentId: event.event_content_id,
    eventName: event.event_name,
    startDate: event.start_date,
    endDate: event.end_date,
    venueAddress: event.venue_address,
    eventPlace: event.event_place,
    playTime: event.play_time,
    usageFee: event.usage_fee,
    heroImageUrl: toSecureImageUrl(event.hero_image_url),
    programRaw: event.program_raw ?? null,
    contactPhone: event.contact_phone ?? null,
    lat: event.lat === null || event.lat === undefined ? null : Number(event.lat),
    lng: event.lng === null || event.lng === undefined ? null : Number(event.lng),
  };
}

export async function getUpcomingEvents(): Promise<{
  events: UpcomingEvent[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_upcoming_events')
    .select(EVENT_SELECT)
    .order('start_date', { ascending: true })
    .limit(6);

  if (error) {
    return { events: [], error: error.message };
  }

  return {
    events: ((data ?? []) as UpcomingEventRow[]).map(mapEvent),
    error: null,
  };
}

/** 전체 행사 목록. 랜딩은 3건만 보여주므로 목록 페이지에서 나머지를 노출한다. */
export async function getAllUpcomingEvents(): Promise<{
  events: UpcomingEvent[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_upcoming_events')
    .select(EVENT_SELECT)
    .order('start_date', { ascending: true });

  if (error) return { events: [], error: error.message };
  return { events: ((data ?? []) as UpcomingEventRow[]).map(mapEvent), error: null };
}

/**
 * 행사 상세. KTO contentId를 URL 식별자로 쓴다. events 테이블의 유일 키이고
 * 이름과 달리 재수집 시에도 안정적이다.
 */
export async function getUpcomingEventByContentId(eventContentId: string): Promise<{
  event: UpcomingEvent | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_upcoming_events')
    .select(EVENT_SELECT)
    .eq('event_content_id', eventContentId)
    .maybeSingle();

  if (error) return { event: null, error: error.message };
  return { event: data ? mapEvent(data as UpcomingEventRow) : null, error: null };
}
