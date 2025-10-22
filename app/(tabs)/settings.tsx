import React, { useEffect, useState } from 'react';
import { StyleSheet, Pressable, Alert, Switch, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getHabitSettings, setHabitSettings, getPrivacySettings, setPrivacySettings } from '@/lib/settings';
import { scheduleDailyHabitReminder } from '@/lib/notifications';
import { useRouter } from 'expo-router';
import { getCurrentUser, signOut } from '@/lib/auth';
import { HourPickerSheet } from '@/components/HourPickerSheet';

export default function SettingsTabScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const bg = useThemeColor({}, 'background');

  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(20);
  const [showHourPicker, setShowHourPicker] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const hs = await getHabitSettings();
      setEnabled(!!hs.enabled);
      setHour(hs.hour ?? 20);
      const ps = await getPrivacySettings();
      setPrivateMode(!!ps.privateMode);
      const u = await getCurrentUser();
      setUserEmail(u?.email ?? null);
    })();
  }, []);

  const togglePrivateMode = async (val: boolean) => { setPrivateMode(val); await setPrivacySettings({ privateMode: val }); };
  const toggleHabit = async (val: boolean) => { setEnabled(val); await setHabitSettings({ enabled: val, hour }); if (val) { try { await scheduleDailyHabitReminder(hour); } catch {} } };

  const saveHour = async (h: number) => {
    setShowHourPicker(false);
    setHour(h);
    await setHabitSettings({ enabled, hour: h });
    if (enabled) {
      try { await scheduleDailyHabitReminder(h); } catch {}
    }
  };

  const handleSignOut = async () => { try { await signOut(); router.replace('/auth'); } catch (e: any) { Alert.alert('Lỗi', e?.message || 'Không thể đăng xuất'); } };

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={styles.containerScroll} showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.container}> 
        <ThemedText type="title" style={{ marginBottom: 12 }}>Cài đặt</ThemedText>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Tài khoản</ThemedText>
          <ThemedText style={{ opacity: 0.8, marginBottom: 8 }}>{userEmail || 'Chưa đăng nhập'}</ThemedText>
          {userEmail ? (
            <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={handleSignOut}><ThemedText style={styles.buttonText}>Đăng xuất</ThemedText></Pressable>
          ) : (
            <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={() => router.push('/auth')}><ThemedText style={styles.buttonText}>Đăng nhập</ThemedText></Pressable>
          )}
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Gia đình</ThemedText>
          <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={() => router.push('/family' as any)}><ThemedText style={styles.buttonText}>Quản lý Gia đình</ThemedText></Pressable>
          <Pressable style={[styles.button, { backgroundColor: '#4B5563', marginTop: 8 }]} onPress={() => router.push('/paywall' as any)}><ThemedText style={styles.buttonText}>Nâng cấp Pro</ThemedText></Pressable>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Quyền riêng tư</ThemedText>
          <ThemedView style={styles.row}><ThemedText>Chế độ riêng tư</ThemedText><Switch value={privateMode} onValueChange={togglePrivateMode} trackColor={{ true: tint }} /></ThemedView>
          <ThemedText style={{ opacity: 0.6, marginTop: 6, fontSize: 12 }}>Khi bật, các giao dịch mới mặc định là riêng tư (chỉ bạn thấy chi tiết).</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Nhắc nhở thói quen</ThemedText>
          <ThemedView style={styles.row}><ThemedText>Bật nhắc nhở hàng ngày</ThemedText><Switch value={enabled} onValueChange={toggleHabit} trackColor={{ true: tint }} /></ThemedView>
          <ThemedView style={[styles.row, { marginTop: 8 }]}>
            <ThemedText>Giờ nhắc</ThemedText>
            <Pressable style={[styles.outlineBtn, { borderColor: tint }]} onPress={() => setShowHourPicker(true)}>
              <ThemedText style={{ color: tint, fontWeight: '700' }}>{String(hour).padStart(2, '0')}:00</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        <HourPickerSheet visible={showHourPicker} initialHour={hour} onClose={() => setShowHourPicker(false)} onSave={saveHour} />

      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  containerScroll: { padding: 16 },
  container: { flex: 1 },
  card: { padding: 16, borderRadius: 12, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  button: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  outlineBtn: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8 },
});


