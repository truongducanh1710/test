import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { signInWithEmailMagicLink, handleDeepLink, getSession } from '@/lib/auth';
import { useRouter } from 'expo-router';

export default function AuthScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
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

  const onSend = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Email không hợp lệ');
      return;
    }
    try {
      setLoading(true);
      await signInWithEmailMagicLink(email.trim());
      setSent(true);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể gửi liên kết');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={{ marginBottom: 12 }}>Đăng nhập</ThemedText>
      <ThemedText style={{ opacity: 0.8, marginBottom: 10 }}>Nhập email để nhận liên kết đăng nhập nhanh.</ThemedText>
      <TextInput
        style={[styles.input, { borderColor: tint + '30', color: text }]}
        placeholder="you@example.com"
        placeholderTextColor={text + '60'}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Pressable style={[styles.button, { backgroundColor: tint, opacity: loading ? 0.6 : 1 }]} onPress={onSend} disabled={loading}>
        <ThemedText style={{ color: '#fff', fontWeight: '700' }}>{sent ? 'Đã gửi! Kiểm tra email' : 'Gửi liên kết đăng nhập'}</ThemedText>
      </Pressable>
      <ThemedText style={{ marginTop: 12, opacity: 0.7 }}>Liên kết sẽ mở lại ứng dụng tự động.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
});


