import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, Wallet } from '@/lib/database';

export default function WalletDetailScreen() {
  const { walletId } = useLocalSearchParams<{ walletId: string }>();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1f1f1f' }, 'background');
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    (async () => {
      await database.init();
      // Minimal detail: in a full version we'd fetch spend per category for this wallet
      // Here we just list wallet info; category drill-down can be added later.
      // Fetch wallets via active budget then find by id
      const b = await database.getActiveBudget();
      if (b) {
        const ws = await database.listWallets(b.id!);
        setWallet(ws.find(w => w.id === walletId) || null);
      }
    })();
  }, [walletId]);

  return (
    <ScrollView style={[styles.container, { backgroundColor }]} contentContainerStyle={styles.content}>
      <ThemedText type="title" style={styles.title}>Chi Tiết Ví</ThemedText>
      <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
        <ThemedText style={styles.label}>Tên ví</ThemedText>
        <ThemedText style={styles.value}>{wallet?.name || '---'}</ThemedText>
        <ThemedText style={[styles.label, { marginTop: 10 }]}>Tỷ lệ phân bổ</ThemedText>
        <ThemedText style={styles.value}>{wallet?.percent ?? 0}%</ThemedText>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  card: {
    borderRadius: 14,
    padding: 16,
  },
  label: {
    fontSize: 13,
    opacity: 0.7,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
});


