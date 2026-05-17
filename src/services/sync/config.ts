export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_AUTH_TOKEN = process.env.EXPO_PUBLIC_SUPABASE_AUTH_TOKEN ?? '';
export const USER_ID = process.env.EXPO_PUBLIC_USER_ID ?? '';

export function isSyncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_AUTH_TOKEN && USER_ID);
}
