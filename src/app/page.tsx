import { createClient } from '@/lib/supabase/server';
import { LandingClient } from '@/components/landing-client';
import { getPublishedPlaces } from '@/lib/places/queries';
import { getPublishedCourses } from '@/lib/courses/queries';
import { getNowGoodSpots } from '@/lib/crowd/queries';
import { getUpcomingEvents } from '@/lib/events/queries';

// Next.js 16/React 19 Server Component
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    placesResult,
    coursesResult,
    crowdResult,
    eventsResult,
  ] = await Promise.all([supabase.auth.getUser(), getPublishedPlaces(), getPublishedCourses(), getNowGoodSpots(), getUpcomingEvents()]);

  const { places, error: placesError } = placesResult;
  const { courses, error: coursesError } = coursesResult;
  const { spots: nowGoodSpots, error: crowdError } = crowdResult;
  const { events, error: eventsError } = eventsResult;
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const isAdmin = String(profile?.role ?? '').toUpperCase() === 'ADMIN';
  const {
    'auth-error': authErrorParam,
    'admin-error': adminErrorParam,
    'account-deleted': accountDeletedParam,
  } = await searchParams;
  const hasAuthError = authErrorParam === 'true';
  const hasAdminError = adminErrorParam === 'true';
  const hasAccountDeleted = accountDeletedParam === 'true';

  return (
    <LandingClient
      initialUser={user}
      initialIsAdmin={isAdmin}
      importedPlaces={places}
      placesError={placesError}
      courses={courses}
      coursesError={coursesError}
      nowGoodSpots={nowGoodSpots}
      crowdError={crowdError}
      events={events}
      eventsError={eventsError}
      hasAuthError={hasAuthError}
      hasAdminError={hasAdminError}
      hasAccountDeleted={hasAccountDeleted}
    />
  );
}
