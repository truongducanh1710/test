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

/**
 * Đăng ký tài khoản mới với Email + Password.
 * Supabase sẽ gửi email xác nhận.
 */
export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const redirectTo = Linking.createURL('/auth');
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

/**
 * Đăng nhập với Email + Password.
 */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { error } = await sb.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

/**
 * Gửi email reset mật khẩu.
 */
export async function resetPassword(email: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const redirectTo = Linking.createURL('/reset-password');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

/**
 * Cập nhật mật khẩu mới (sau khi reset).
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { error } = await sb.auth.updateUser({
    password: newPassword,
  });
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
  try {
    const { cancelHabitReminders } = await import('@/lib/notifications');
    await cancelHabitReminders();
  } catch {}
  await sb.auth.signOut();
}


