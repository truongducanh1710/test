import AsyncStorage from '@react-native-async-storage/async-storage';

export type HabitSettings = {
  enabled: boolean;
  hour: number; // 0-23 local time
};

export type PrivacySettings = {
  privateMode: boolean; // when true, new transactions default to is_private=true
};

export type AssistantPersonality =
  | 'friendly_scold' // bạn thân mắng yêu, thẳng mà ấm
  | 'serious'        // nghiêm túc, chuẩn mực
  | 'humor'          // hài hước, nhẹ nhàng
  | 'custom_angry';  // “giọng gắt” hơn theo yêu cầu

export type PersonalitySettings = {
  enabled: boolean; // bật/tắt cá tính tuỳ chỉnh
  style: AssistantPersonality; // phong cách chính
  intensity: 'light' | 'medium' | 'hard'; // độ “mắng yêu”
};

import { nsKey } from '@/lib/user';

const KEY_BASE = 'settings.habitReminder.v1';
const PRIVACY_KEY_BASE = 'settings.privacy.v1';
const PERSONALITY_KEY_BASE = 'settings.personality.v1';

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

const PERSONALITY_DEFAULTS: PersonalitySettings = {
  enabled: true,
  style: 'friendly_scold',
  intensity: 'medium',
};

export async function getPersonalitySettings(): Promise<PersonalitySettings> {
  try {
    const key = await nsKey(PERSONALITY_KEY_BASE);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return PERSONALITY_DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      style: (['friendly_scold','serious','humor','custom_angry'] as const).includes(parsed.style)
        ? parsed.style
        : PERSONALITY_DEFAULTS.style,
      intensity: (['light','medium','hard'] as const).includes(parsed.intensity)
        ? parsed.intensity
        : PERSONALITY_DEFAULTS.intensity,
    };
  } catch {
    return PERSONALITY_DEFAULTS;
  }
}

export async function setPersonalitySettings(next: PersonalitySettings): Promise<void> {
  const normalized: PersonalitySettings = {
    enabled: !!next.enabled,
    style: (['friendly_scold','serious','humor','custom_angry'] as const).includes(next.style)
      ? next.style
      : 'friendly_scold',
    intensity: (['light','medium','hard'] as const).includes(next.intensity)
      ? next.intensity
      : 'medium',
  };
  const key = await nsKey(PERSONALITY_KEY_BASE);
  await AsyncStorage.setItem(key, JSON.stringify(normalized));
}


