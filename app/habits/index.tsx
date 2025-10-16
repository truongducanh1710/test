import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getStreak, getCoins, getRewardCatalog, redeemReward } from '@/lib/gamification';

export default function HabitsScreen() {
  const tintColor = useThemeColor({}, 'tint');
  const [streak, setStreak] = useState<{ current: number; best: number }>({ current: 0, best: 0 });
  const [coins, setCoins] = useState(0);
  const rewards = getRewardCatalog();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStreak(await getStreak());
      setCoins(await getCoins());
    })();
  }, []);

  const onRedeem = async (code: string) => {
    try {
      setBusy(code);
      const res = await redeemReward(code);
      setCoins(res.coins);
      if (res.ok) Alert.alert('Thành công', 'Đổi thưởng thành công!');
      else Alert.alert('Không thể đổi', res.message || 'Vui lòng thử lại');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Nhật ký chi tiêu</ThemedText>
      <ThemedText>Streak hiện tại: {streak.current} ngày</ThemedText>
      <ThemedText>Streak tốt nhất: {streak.best} ngày</ThemedText>
      <ThemedText style={{ marginTop: 8, marginBottom: 12 }}>Xu hiện có: {coins}</ThemedText>

      <ThemedText type="title" style={styles.subtitle}>Đổi thưởng</ThemedText>
      {rewards.map((r) => {
        const disabled = coins < r.cost || busy === r.code;
        return (
          <View key={r.code} style={styles.rewardRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.rewardName}>{r.name}</ThemedText>
              <ThemedText style={{ opacity: 0.7 }}>{r.cost} xu</ThemedText>
            </View>
            <Pressable 
              style={[styles.redeemBtn, { backgroundColor: disabled ? '#9ca3af' : tintColor }]} 
              disabled={disabled}
              onPress={() => onRedeem(r.code)}
            >
              <ThemedText style={{ color: '#fff' }}>{busy === r.code ? 'Đang đổi...' : 'Đổi'}</ThemedText>
            </Pressable>
          </View>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { marginBottom: 8 },
  subtitle: { marginTop: 8, marginBottom: 8 },
  btn: { padding: 12, borderRadius: 10, alignItems: 'center' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rewardName: { fontSize: 16, fontWeight: '600' },
  redeemBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
});


