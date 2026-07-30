import { createClient } from '@/lib/supabase/server';
import { LandingClient } from '@/components/landing-client';
import { getImportedPlaces } from '@/lib/places/queries';

// Next.js 16/React 19 Server Component
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();

  // 현재 로그인한 사용자 정보 조회
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { places, error: placesError } = await getImportedPlaces();
  const { 'auth-error': authErrorParam, 'account-deleted': accountDeletedParam } = await searchParams;
  const hasAuthError = authErrorParam === 'true';
  const hasAccountDeleted = accountDeletedParam === 'true';

  return (
    <LandingClient
      initialUser={user}
      importedPlaces={places}
      placesError={placesError}
      hasAuthError={hasAuthError}
      hasAccountDeleted={hasAccountDeleted}
    />
  );
}
