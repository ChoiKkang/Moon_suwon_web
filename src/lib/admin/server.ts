import 'server-only';

import { createClient as createSupabaseAdminClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '@/lib/env/server';
import { createClient as createUserClient } from '@/lib/supabase/server';

export type AdminContext = {
  user: User;
  adminClient: SupabaseClient;
};

export function getAdminClient(): SupabaseClient {
  return createSupabaseAdminClient(
    getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

export async function requireAdmin(): Promise<AdminContext> {
  const userClient = await createUserClient();
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    throw new Error('인증 오류가 발생했습니다. 다시 로그인해 주세요.');
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || String(profile?.role ?? '').toUpperCase() !== 'ADMIN') {
    throw new Error('관리자 권한이 필요합니다.');
  }

  return { user, adminClient: getAdminClient() };
}

export function asNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
