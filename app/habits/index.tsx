import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getStreak, getCoins } from '@/lib/gamification';

export default function HabitsScreen() {
  const tintColor = useThemeColor({}, 'tint');
  const [streak, setStreak] = useState<{ current: number; best: number }>({ current: 0, best: 0 });
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    (async () => {
      setStreak(await getStreak());
      setCoins(await getCoins());
    })();
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Nhật ký chi tiêu</ThemedText>
      <ThemedText>Streak hiện tại: {streak.current} ngày</ThemedText>
      <ThemedText>Streak tốt nhất: {streak.best} ngày</ThemedText>
      <ThemedText style={{ marginTop: 8 }}>Xu hiện có: {coins}</ThemedText>
      <View style={{ height: 16 }} />
      <Pressable style={[styles.btn, { backgroundColor: tintColor }]}>
        <ThemedText style={{ color: '#fff' }}>Đổi thưởng (sắp có)</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { marginBottom: 8 },
  btn: { padding: 12, borderRadius: 10, alignItems: 'center' },
});


