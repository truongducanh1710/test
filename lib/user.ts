import { getCurrentUser as authGetCurrentUser } from '@/lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getActiveUserId(): Promise<string | null> {
  try {
    const user = await authGetCurrentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getUserDbFileName(): Promise<string> {
  const uid = (await getActiveUserId()) || 'anonymous';
  return `finance_${uid}.db`;
}

export async function nsKey(baseKey: string): Promise<string> {
  const uid = (await getActiveUserId()) || 'anonymous';
  return `uid:${uid}:${baseKey}`;
}

// Re-export the authenticated helper for consumers
export { getCurrentUser } from '@/lib/auth';

export async function getCurrentHouseholdId(): Promise<string | null> {
  try {
    const key = await nsKey('current.household.id.v1');
    const raw = await AsyncStorage.getItem(key);
    return raw || null;
  } catch {
    return null;
  }
}
