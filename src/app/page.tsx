import { createClient } from '@/lib/supabase/server';
import { LandingClient } from '@/components/landing-client';
import { getPublishedPlaces } from '@/lib/places/queries';
import { getPublishedCourses } from '@/lib/courses/queries';
import { getNowGoodSpots } from '@/lib/crowd/queries';

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
  ] = await Promise.all([supabase.auth.getUser(), getPublishedPlaces(), getPublishedCourses(), getNowGoodSpots()]);

  const { places, error: placesError } = placesResult;
  const { courses, error: coursesError } = coursesResult;
  const { spots: nowGoodSpots, error: crowdError } = crowdResult;
  const { 'auth-error': authErrorParam, 'account-deleted': accountDeletedParam } = await searchParams;
  const hasAuthError = authErrorParam === 'true';
  const hasAccountDeleted = accountDeletedParam === 'true';

  return (
    <LandingClient
      initialUser={user}
      importedPlaces={places}
      placesError={placesError}
      courses={courses}
      coursesError={coursesError}
      nowGoodSpots={nowGoodSpots}
      crowdError={crowdError}
      hasAuthError={hasAuthError}
      hasAccountDeleted={hasAccountDeleted}
    />
  );
}
