import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Pressable, ActivityIndicator, Alert, FlatList } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, type Loan } from '@/lib/database';
import { formatCurrency } from '@/lib/database';

export default function LoansListScreen() {
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1f1f1f' }, 'background');
  const router = useRouter();

  const load = async () => {
    setLoading(true);
    await database.init();
    const list = await database.listLoans('open');
    setLoans(list);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const settle = async (loan: Loan) => {
    Alert.alert('Tất toán khoản', `${loan.kind === 'borrow' ? 'Vay' : 'Cho vay'}: ${loan.person}`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Tất toán', style: 'destructive', onPress: async () => {
        try {
          await database.closeLoanAndCreateSettlement(String(loan.id!));
          Alert.alert('Thành công', 'Đã tạo giao dịch tất toán');
          load();
        } catch (e: any) {
          Alert.alert('Lỗi', e?.message || 'Không thể tất toán');
        }
      } }
    ]);
  };

  const renderItem = ({ item }: { item: Loan }) => (
    <Pressable style={[styles.card, { backgroundColor: cardBg }]} onPress={() => router.push(`/loans/${item.id}` as any)}>
      <ThemedText style={styles.title}>{item.kind === 'borrow' ? 'Vay' : 'Cho vay'} • {item.person}</ThemedText>
      <ThemedText style={{ opacity: 0.7 }}>Đến hạn: {item.due_date ? new Date(item.due_date).toLocaleDateString('vi-VN') : '—'}</ThemedText>
      <Pressable style={[styles.settleBtn, { borderColor: tintColor }]} onPress={() => settle(item)}>
        <Ionicons name="checkmark-circle" size={16} color={tintColor} />
        <ThemedText style={[styles.settleText, { color: tintColor }]}>Tất toán</ThemedText>
      </Pressable>
    </Pressable>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}> 
      <ThemedText type="title" style={styles.screenTitle}>Vay & Cho vay</ThemedText>
      {loading ? (
        <ActivityIndicator size="large" color={tintColor} />
      ) : loans.length === 0 ? (
        <ThemedText style={{ opacity: 0.7 }}>Không có khoản nào</ThemedText>
      ) : (
        <FlatList
          data={loans}
          keyExtractor={(l) => String(l.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  screenTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  card: { borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  settleBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  settleText: { marginLeft: 6, fontWeight: '600' },
});
