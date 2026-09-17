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
};

export async function getUpcomingEvents(): Promise<{
  events: UpcomingEvent[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_upcoming_events')
    .select('id, event_content_id, event_name, start_date, end_date, venue_address, event_place, play_time, usage_fee, hero_image_url')
    .order('start_date', { ascending: true })
    .limit(6);

  if (error) {
    return { events: [], error: error.message };
  }

  return {
    events: ((data ?? []) as UpcomingEventRow[]).map((event) => ({
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
    })),
    error: null,
  };
}
