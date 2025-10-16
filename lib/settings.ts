import AsyncStorage from '@react-native-async-storage/async-storage';

export type HabitSettings = {
  enabled: boolean;
  hour: number; // 0-23 local time
};

export type PrivacySettings = {
  privateMode: boolean; // when true, new transactions default to is_private=true
};

import { nsKey } from '@/lib/user';

const KEY_BASE = 'settings.habitReminder.v1';
const PRIVACY_KEY_BASE = 'settings.privacy.v1';

const DEFAULTS: HabitSettings = { enabled: true, hour: 20 };

export async function getHabitSettings(): Promise<HabitSettings> {
  try {
    const key = await nsKey(KEY_BASE);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      hour: Number.isFinite(parsed.hour) ? Math.max(0, Math.min(23, Number(parsed.hour))) : DEFAULTS.hour,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function setHabitSettings(next: HabitSettings): Promise<void> {
  const normalized: HabitSettings = {
    enabled: !!next.enabled,
    hour: Math.max(0, Math.min(23, Number(next.hour || 0)))
  };
  const key = await nsKey(KEY_BASE);
  await AsyncStorage.setItem(key, JSON.stringify(normalized));
}

const PRIVACY_DEFAULTS: PrivacySettings = { privateMode: false };

export async function getPrivacySettings(): Promise<PrivacySettings> {
  try {
    const key = await nsKey(PRIVACY_KEY_BASE);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return PRIVACY_DEFAULTS;
    const parsed = JSON.parse(raw);
    return { privateMode: !!parsed.privateMode };
  } catch {
    return PRIVACY_DEFAULTS;
  }
}

export async function setPrivacySettings(next: PrivacySettings): Promise<void> {
  const normalized: PrivacySettings = { privateMode: !!next.privateMode };
  const key = await nsKey(PRIVACY_KEY_BASE);
  await AsyncStorage.setItem(key, JSON.stringify(normalized));
}


