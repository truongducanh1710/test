import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getHabitSettings, setHabitSettings, HabitSettings, getPrivacySettings, setPrivacySettings, PrivacySettings } from '@/lib/settings';
import { ensureNotificationPermissions, scheduleDailyHabitReminder } from '@/lib/notifications';

export default function SettingsScreen() {
  const tint = useThemeColor({}, 'tint');
  const [settings, setSettings] = useState<HabitSettings>({ enabled: true, hour: 20 });
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState<PrivacySettings>({ privateMode: false });

  useEffect(() => {
    (async () => {
      setSettings(await getHabitSettings());
      setPrivacy(await getPrivacySettings());
      setLoading(false);
    })();
  }, []);

  const save = async (next: HabitSettings) => {
    setSettings(next);
    await setHabitSettings(next);
    try {
      const ok = await ensureNotificationPermissions();
      if (ok && next.enabled) await scheduleDailyHabitReminder(next.hour);
    } catch {}
  };

  if (loading) return <ThemedView style={styles.container}><ThemedText>Đang tải…</ThemedText></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Cài đặt</ThemedText>

      <ThemedText style={{ marginBottom: 8 }}>Nhắc ghi chi tiêu hằng ngày</ThemedText>
      <View style={styles.row}>
        <Pressable
          style={[styles.toggle, { backgroundColor: settings.enabled ? tint : '#ccc' }]}
          onPress={() => save({ ...settings, enabled: !settings.enabled })}
        >
          <ThemedText style={{ color: '#fff' }}>{settings.enabled ? 'Bật' : 'Tắt'}</ThemedText>
        </Pressable>
      </View>

      <ThemedText style={{ marginTop: 16, marginBottom: 8 }}>Giờ nhắc (0–23)</ThemedText>
      <View style={styles.row}>
        <Pressable style={[styles.hourBtn, { borderColor: tint }]} onPress={() => save({ ...settings, hour: Math.max(0, settings.hour - 1) })}>
          <ThemedText style={{ color: tint }}>-</ThemedText>
        </Pressable>
        <ThemedText style={styles.hourText}>{settings.hour}:00</ThemedText>
        <Pressable style={[styles.hourBtn, { borderColor: tint }]} onPress={() => save({ ...settings, hour: Math.min(23, settings.hour + 1) })}>
          <ThemedText style={{ color: tint }}>+</ThemedText>
        </Pressable>
      </View>
      <ThemedText style={{ opacity: 0.7, marginTop: 8 }}>Thông báo lặp lại mỗi ngày vào giờ đã chọn.</ThemedText>

      <ThemedText type="title" style={[styles.title, { marginTop: 24 }]}>Quyền riêng tư</ThemedText>
      <ThemedText style={{ marginBottom: 8 }}>Chế độ riêng tư (giao dịch mới của bạn mặc định ẩn chi tiết với người khác)</ThemedText>
      <View style={styles.row}>
        <Pressable
          style={[styles.toggle, { backgroundColor: privacy.privateMode ? tint : '#ccc' }]}
          onPress={async () => {
            const next = { privateMode: !privacy.privateMode };
            setPrivacy(next);
            await setPrivacySettings(next);
          }}
        >
          <ThemedText style={{ color: '#fff' }}>{privacy.privateMode ? 'Bật' : 'Tắt'}</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggle: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  hourBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  hourText: { fontSize: 18, fontWeight: '600', minWidth: 80, textAlign: 'center' },
});


