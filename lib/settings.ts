import AsyncStorage from '@react-native-async-storage/async-storage';

export type HabitSettings = {
  enabled: boolean;
  hour: number; // 0-23 local time
};

const KEY = 'settings.habitReminder.v1';

const DEFAULTS: HabitSettings = { enabled: true, hour: 20 };

export async function getHabitSettings(): Promise<HabitSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
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
  await AsyncStorage.setItem(KEY, JSON.stringify(normalized));
}


