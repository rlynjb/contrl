import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};
const supabase = (extra.supabase ?? {}) as {
  url?: string;
  anonKey?: string;
  authToken?: string;
};

export const SUPABASE_URL = supabase.url ?? '';
export const SUPABASE_ANON_KEY = supabase.anonKey ?? '';
export const SUPABASE_AUTH_TOKEN = supabase.authToken ?? '';
export const USER_ID = (extra.userId ?? '') as string;

export function isSyncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_AUTH_TOKEN && USER_ID);
}
