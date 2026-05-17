export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Fixed tenant ID for single-user MVP. Set EXPO_PUBLIC_USER_ID to override
// (useful later when adding real auth or multi-device).
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
export const USER_ID = process.env.EXPO_PUBLIC_USER_ID || DEFAULT_USER_ID;

export function isSyncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
