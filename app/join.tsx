import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getSession } from '@/lib/auth';
import { acceptInviteToken } from '@/lib/family';

export default function JoinScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const { hid, t } = useLocalSearchParams<{ hid?: string; t?: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const session = await getSession();
        if (!session) {
          setError('Bạn cần đăng nhập trước khi tham gia gia đình.');
          return;
        }
        if (!t) {
          setError('Thiếu token tham gia.');
          return;
        }
        await acceptInviteToken(String(t));
        Alert.alert('Thành công', 'Bạn đã tham gia gia đình!');
        router.replace('/family');
      } catch (e: any) {
        setError(e?.message || 'Không thể tham gia gia đình.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router, t]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={tint} />
        <ThemedText style={{ marginTop: 10, opacity: 0.7 }}>Đang xử lý lời mời…</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={{ color: text }}>{error}</ThemedText>
        <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={() => router.replace('/auth')}>
          <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Đến màn đăng nhập</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginTop: 12 },
});
