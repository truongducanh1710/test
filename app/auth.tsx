import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { signInWithEmail, signUpWithEmail, resetPassword, handleDeepLink, getSession } from '@/lib/auth';
import { useRouter } from 'expo-router';

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sub = Linking.addEventListener('url', async ({ url }) => {
      const ok = await handleDeepLink(url);
      if (ok) {
        const session = await getSession();
        if (session) router.replace('/');
      }
    });
    return () => sub.remove();
  }, [router]);

  const handleAction = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Email không hợp lệ');
      return;
    }
    if (mode !== 'reset' && password.length < 6) {
      Alert.alert('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    try {
      setLoading(true);
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
        const session = await getSession();
        if (session) {
          // On user sign-in, switch per-user storage/DB and reschedule reminders
                     const [{ getHabitSettings }, { scheduleDailyHabitReminder, cancelHabitReminders }, { database }] = await Promise.all([
             import('@/lib/settings'),
             import('@/lib/notifications'),
             import('@/lib/database'),
           ]);
           const hs = await getHabitSettings();
           await cancelHabitReminders();
           if (hs.enabled) await scheduleDailyHabitReminder(hs.hour);
           // Switch DB to the new user's file by closing current connection
                       try { await database.close(); } catch {}
                         try { const { clearFinanceCaches } = await import('@/app/(tabs)/explore'); clearFinanceCaches(); } catch {}
             try { const { clearHomeHabitState } = await import('@/app/(tabs)/index'); clearHomeHabitState(); } catch {}
             router.replace('/');
        }
      } else if (mode === 'signup') {
        await signUpWithEmail(email.trim(), password);
        Alert.alert('Đăng ký thành công!', 'Vui lòng kiểm tra email để xác nhận tài khoản.');
      } else if (mode === 'reset') {
        await resetPassword(email.trim());
        Alert.alert('Email đã gửi!', 'Kiểm tra hộp thư để đặt lại mật khẩu.');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const buttonText =
    mode === 'signin' ? 'Đăng nhập' : mode === 'signup' ? 'Đăng ký' : 'Gửi email reset';

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={{ marginBottom: 12 }}>
          {mode === 'signin' ? 'Đăng nhập' : mode === 'signup' ? 'Đăng ký' : 'Quên mật khẩu'}
        </ThemedText>
        <ThemedText style={{ opacity: 0.8, marginBottom: 16 }}>
          {mode === 'signin'
            ? 'Nhập email và mật khẩu để đăng nhập.'
            : mode === 'signup'
            ? 'Tạo tài khoản mới. Bạn sẽ nhận email xác nhận.'
            : 'Nhập email để nhận liên kết đặt lại mật khẩu.'}
        </ThemedText>

        <TextInput
          style={[styles.input, { borderColor: tint + '30', color: text }]}
          placeholder="Email"
          placeholderTextColor={text + '60'}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {mode !== 'reset' && (
          <TextInput
            style={[styles.input, { borderColor: tint + '30', color: text }]}
            placeholder="Mật khẩu (tối thiểu 6 ký tự)"
            placeholderTextColor={text + '60'}
            autoCapitalize="none"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        )}

        <Pressable
          style={[styles.button, { backgroundColor: tint, opacity: loading ? 0.6 : 1 }]}
          onPress={handleAction}
          disabled={loading}
        >
          <ThemedText style={{ color: '#fff', fontWeight: '700' }}>{buttonText}</ThemedText>
        </Pressable>

        <ThemedView style={{ marginTop: 20, gap: 8 }}>
          {mode === 'signin' && (
            <>
              <Pressable onPress={() => setMode('signup')}>
                <ThemedText style={{ color: tint }}>Chưa có tài khoản? Đăng ký ngay</ThemedText>
              </Pressable>
              <Pressable onPress={() => setMode('reset')}>
                <ThemedText style={{ color: tint }}>Quên mật khẩu?</ThemedText>
              </Pressable>
            </>
          )}
          {mode === 'signup' && (
            <Pressable onPress={() => setMode('signin')}>
              <ThemedText style={{ color: tint }}>Đã có tài khoản? Đăng nhập</ThemedText>
            </Pressable>
          )}
          {mode === 'reset' && (
            <Pressable onPress={() => setMode('signin')}>
              <ThemedText style={{ color: tint }}>Quay lại đăng nhập</ThemedText>
            </Pressable>
          )}
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
});


