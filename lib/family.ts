import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { nsKey } from '@/lib/user';

const KEY_BASE = 'family.currentHouseholdId.v1';

export async function getCurrentHouseholdId(): Promise<string | null> {
  try {
    const key = await nsKey(KEY_BASE);
    return (await AsyncStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

export async function setCurrentHouseholdId(id: string | null): Promise<void> {
  try {
    const key = await nsKey(KEY_BASE);
    if (!id) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, id);
  } catch {}
}

function getSb() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function createInviteLink(householdId: string): Promise<string> {
  const sb = getSb();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await sb.rpc('create_household_invite', { p_household_id: householdId });
  if (error) throw new Error(error.message);
  return data?.url as string;
}

export async function acceptInviteToken(token: string): Promise<string> {
  const sb = getSb();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await sb.rpc('accept_household_invite', { p_token: token });
  if (error) throw new Error(error.message);
  const id = data?.household_id as string;
  if (!id) throw new Error('Token không hợp lệ');
  await setCurrentHouseholdId(id);
  return id;
}


