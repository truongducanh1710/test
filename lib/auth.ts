import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function signInWithEmailMagicLink(email: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const redirectTo = Linking.createURL('/auth');
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function handleDeepLink(url: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const parsed = Linking.parse(url);
    const code = (parsed.queryParams?.code as string) || '';
    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession({ code });
      if (error) throw error;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}


