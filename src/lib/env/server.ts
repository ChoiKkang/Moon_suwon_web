type RequiredServerEnvKey =
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'KTO_SERVICE_KEY';

type PublicDataProvider = 'kto' | 'kma' | 'gyeonggi';

export function getRequiredServerEnv(key: RequiredServerEnvKey): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required server environment variable: ${key}`);
  }

  return value;
}

export function getPublicDataServiceKey(provider: PublicDataProvider): string {
  const providerKey = provider === 'kma'
    ? process.env.KMA_SERVICE_KEY
    : provider === 'gyeonggi'
      ? process.env.GG_BUS_SERVICE_KEY
      : process.env.KTO_SERVICE_KEY;
  const value = providerKey || process.env.KTO_SERVICE_KEY;

  if (!value) {
    throw new Error(`Missing server-only public data service key for provider: ${provider}`);
  }

  return value;
}
