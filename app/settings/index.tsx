import React, { useEffect, useState } from 'react';
import { StyleSheet, Pressable, Alert, Switch, Platform, ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getHabitSettings, setHabitSettings, getPrivacySettings, setPrivacySettings, getPersonalitySettings, setPersonalitySettings } from '@/lib/settings';
import { scheduleDailyHabitReminder } from '@/lib/notifications';
import { useRouter } from 'expo-router';
import { getCurrentUser, signOut } from '@/lib/auth';

export default function SettingsScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const bg = useThemeColor({}, 'background');

  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(20);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [personaEnabled, setPersonaEnabled] = useState(true);
  const [personaStyle, setPersonaStyle] = useState<'friendly_scold' | 'serious' | 'humor' | 'custom_angry'>('friendly_scold');
  const [personaIntensity, setPersonaIntensity] = useState<'light' | 'medium' | 'hard'>('medium');

  useEffect(() => {
    (async () => {
      const hs = await getHabitSettings();
      setEnabled(!!hs.enabled);
      setHour(hs.hour ?? 20);
      const ps = await getPrivacySettings();
      setPrivateMode(!!ps.privateMode);
      const u = await getCurrentUser();
      setUserEmail(u?.email ?? null);
      const pers = await getPersonalitySettings();
      setPersonaEnabled(!!pers.enabled);
      setPersonaStyle(pers.style);
      setPersonaIntensity(pers.intensity);
    })();
  }, []);

  const togglePrivateMode = async (val: boolean) => {
    setPrivateMode(val);
    await setPrivacySettings({ privateMode: val });
    Alert.alert('Đã lưu', val ? 'Bật chế độ riêng tư' : 'Tắt chế độ riêng tư');
  };

  const togglePersona = async (val: boolean) => {
    setPersonaEnabled(val);
    await setPersonalitySettings({ enabled: val, style: personaStyle, intensity: personaIntensity });
    Alert.alert('Đã lưu', val ? 'Bật cá tính trợ lý' : 'Tắt cá tính trợ lý');
  };

  const cycleStyle = async () => {
    const order: Array<'friendly_scold' | 'serious' | 'humor' | 'custom_angry'> = ['friendly_scold','serious','humor','custom_angry'];
    const idx = order.indexOf(personaStyle);
    const next = order[(idx + 1) % order.length];
    setPersonaStyle(next);
    await setPersonalitySettings({ enabled: personaEnabled, style: next, intensity: personaIntensity });
  };

  const cycleIntensity = async () => {
    const order: Array<'light' | 'medium' | 'hard'> = ['light','medium','hard'];
    const idx = order.indexOf(personaIntensity);
    const next = order[(idx + 1) % order.length];
    setPersonaIntensity(next);
    await setPersonalitySettings({ enabled: personaEnabled, style: personaStyle, intensity: next });
  };

  const toggleHabit = async (val: boolean) => {
    setEnabled(val);
    await setHabitSettings({ enabled: val, hour });
    if (val) {
      try { await scheduleDailyHabitReminder(hour); } catch {}
      Alert.alert('Đã bật nhắc nhở', `Hàng ngày lúc ${hour}:00`);
    } else {
      Alert.alert('Đã tắt nhắc nhở');
    }
  };

  const onChangeTime = async (_: any, selected?: Date) => {
    setShowTimePicker(false);
    if (selected) {
      const newHour = selected.getHours();
      setHour(newHour);
      await setHabitSettings({ enabled, hour: newHour });
      if (enabled) {
        try { await scheduleDailyHabitReminder(newHour); } catch {}
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/auth');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể đăng xuất');
    }
  };

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={styles.containerScroll} showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.container}> 
        <ThemedText type="title" style={{ marginBottom: 12 }}>Cài đặt</ThemedText>

        {/* Account */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Tài khoản</ThemedText>
          <ThemedText style={{ opacity: 0.8, marginBottom: 8 }}>{userEmail || 'Chưa đăng nhập'}</ThemedText>
          {userEmail ? (
            <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={handleSignOut}>
              <ThemedText style={styles.buttonText}>Đăng xuất</ThemedText>
            </Pressable>
          ) : (
            <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={() => router.push('/auth')}>
              <ThemedText style={styles.buttonText}>Đăng nhập</ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {/* Family */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Gia đình</ThemedText>
          <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={() => router.push('/family' as any)}>
            <ThemedText style={styles.buttonText}>Quản lý Gia đình</ThemedText>
          </Pressable>
          {/* Upgrade just below family management */}
          <Pressable style={[styles.button, { backgroundColor: '#4B5563', marginTop: 8 }]} onPress={() => router.push('/paywall' as any)}>
            <ThemedText style={styles.buttonText}>Nâng cấp Pro</ThemedText>
          </Pressable>
        </ThemedView>

        {/* Privacy */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Quyền riêng tư</ThemedText>
          <ThemedView style={styles.row}>
            <ThemedText>Chế độ riêng tư</ThemedText>
            <Switch value={privateMode} onValueChange={togglePrivateMode} trackColor={{ true: tint }} />
          </ThemedView>
          <ThemedText style={{ opacity: 0.6, marginTop: 6, fontSize: 12 }}>
            Khi bật, các giao dịch mới mặc định là riêng tư (chỉ bạn thấy chi tiết).
          </ThemedText>
        </ThemedView>

        {/* Assistant personality */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Phong cách trợ lý</ThemedText>
          <ThemedView style={styles.row}>
            <ThemedText>Bật cá tính tuỳ chỉnh</ThemedText>
            <Switch value={personaEnabled} onValueChange={togglePersona} trackColor={{ true: tint }} />
          </ThemedView>
          <ThemedView style={[styles.row, { marginTop: 8 }]}> 
            <ThemedText>Kiểu</ThemedText>
            <Pressable style={[styles.outlineBtn, { borderColor: tint }]} onPress={cycleStyle}>
              <ThemedText style={{ color: tint, fontWeight: '700' }}>
                {personaStyle === 'friendly_scold' ? 'Mắng yêu (bạn thân)' : personaStyle === 'serious' ? 'Nghiêm túc' : personaStyle === 'humor' ? 'Hài hước' : 'Gắt hơn' }
              </ThemedText>
            </Pressable>
          </ThemedView>
          <ThemedView style={[styles.row, { marginTop: 8 }]}> 
            <ThemedText>Cường độ</ThemedText>
            <Pressable style={[styles.outlineBtn, { borderColor: tint }]} onPress={cycleIntensity}>
              <ThemedText style={{ color: tint, fontWeight: '700' }}>
                {personaIntensity === 'light' ? 'Nhẹ' : personaIntensity === 'medium' ? 'Vừa' : 'Cứng'}
              </ThemedText>
            </Pressable>
          </ThemedView>
          <ThemedText style={{ opacity: 0.6, marginTop: 6, fontSize: 12 }}>
            Phản hồi sẽ điều chỉnh giọng điệu theo lựa chọn của bạn.
          </ThemedText>
        </ThemedView>

        {/* Habit reminders */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Nhắc nhở thói quen</ThemedText>
          <ThemedView style={styles.row}>
            <ThemedText>Bật nhắc nhở hàng ngày</ThemedText>
            <Switch value={enabled} onValueChange={toggleHabit} trackColor={{ true: tint }} />
          </ThemedView>
          <ThemedView style={[styles.row, { marginTop: 8 }]}> 
            <ThemedText>Giờ nhắc</ThemedText>
            <Pressable style={[styles.outlineBtn, { borderColor: tint }]} onPress={() => setShowTimePicker(true)}>
              <ThemedText style={{ color: tint, fontWeight: '700' }}>{hour}:00</ThemedText>
            </Pressable>
          </ThemedView>
          {showTimePicker && (
            <DateTimePicker
              value={new Date(2020, 0, 1, hour, 0)}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeTime}
            />
          )}
        </ThemedView>
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
})


