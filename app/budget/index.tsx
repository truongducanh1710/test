import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, Pressable, Alert, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, Budget, Wallet } from '@/lib/database';
import { EXPENSE_CATEGORIES } from '@/types/transaction';

type Cycle = 'weekly' | 'monthly';

const DEFAULT_WALLETS: { key: string; name: string; color: string; percent: number }[] = [
  { key: 'essentials', name: 'Essentials', color: '#2563eb', percent: 55 },
  { key: 'savings', name: 'Savings', color: '#16a34a', percent: 10 },
  { key: 'education', name: 'Education', color: '#f59e0b', percent: 10 },
  { key: 'lifestyle', name: 'Lifestyle', color: '#ec4899', percent: 25 },
];

export default function BudgetSetupScreen() {
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1f1f1f' }, 'background');
  const chipBg = useThemeColor({ light: '#f3f4f6', dark: '#2a2a2a' }, 'background');
  const textColor = useThemeColor({}, 'text');

  const [loading, setLoading] = useState(true);
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [rollover, setRollover] = useState<boolean>(false);
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categoryWallet, setCategoryWallet] = useState<Record<string, string | null>>({});

  const totalPercent = useMemo(() => {
    return wallets.reduce((acc, w) => acc + (Number(w.percent || 0)), 0);
  }, [wallets]);

  const vnNameOf = (name: string) => name === 'Essentials' ? 'Thiết yếu' : name === 'Savings' ? 'Tiết kiệm' : name === 'Education' ? 'Học tập' : name === 'Lifestyle' ? 'Lối sống' : name;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await database.init();
      const existing = await database.getActiveBudget();
      if (existing) {
        setBudgetId(existing.id!);
        setCycle(existing.cycle);
        setRollover(!!existing.rollover);
        setMonthlyIncome(existing.monthly_income != null ? String(existing.monthly_income) : '');
        const ws = await database.listWallets(existing.id!);
        if (ws.length > 0) {
          setWallets(ws);
        } else {
          setWallets(DEFAULT_WALLETS.map(w => ({ id: undefined, budget_id: existing.id!, name: w.name, percent: w.percent, color: w.color })));
        }
        // load mapping
        const map = await database.getWalletCategoriesMap(existing.id!);
        const reverse: Record<string, string | null> = {};
        EXPENSE_CATEGORIES.forEach(cat => {
          let found: string | null = null;
          map.forEach((arr, wid) => { if (!found && arr.includes(cat)) found = wid; });
          reverse[cat] = found;
        });
        setCategoryWallet(reverse);
      } else {
        const start = new Date();
        const payload: Omit<Budget, 'id' | 'created_at'> = {
          cycle: 'monthly',
          start_date: new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1)).toISOString().slice(0,10),
          rollover: false,
        } as any;
        const id = await database.upsertBudget(payload);
        setBudgetId(id);
        setCycle('monthly');
        setRollover(false);
        setWallets(DEFAULT_WALLETS.map(w => ({ id: undefined, budget_id: id, name: w.name, percent: w.percent, color: w.color })));
        setCategoryWallet({});
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể tải ngân sách');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateWalletPercent = (index: number, next: string) => {
    const val = Math.max(0, Math.min(100, Number(next.replace(/[^0-9.]/g, '')) || 0));
    setWallets(prev => prev.map((w, i) => i === index ? { ...w, percent: val } : w));
  };

  const handleSave = async () => {
    if (!budgetId) return;
    if (Math.round(totalPercent) !== 100) {
      Alert.alert('Phân bổ chưa hợp lệ', 'Tổng phần trăm 4 ví phải bằng 100%');
      return;
    }
    try {
      const start = new Date();
      const payload = {
        id: budgetId,
        cycle,
        start_date: new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1)).toISOString().slice(0,10),
        rollover,
        monthly_income: monthlyIncome ? Number(monthlyIncome) : null,
      } as any;
      const id = await database.upsertBudget(payload);
      setBudgetId(id);
      const upsertWallets = wallets.map(w => {
        const base: any = {
          budget_id: id,
          name: w.name,
          percent: w.percent ?? null,
          color: w.color ?? null,
        };
        if (w.id) base.id = w.id; // only keep id for existing rows
        return base;
      });
      await database.upsertWallets(upsertWallets);
      // save mapping
      const walletIdByName = new Map<string, string>();
      const currentWallets = await database.listWallets(id);
      currentWallets.forEach(w => walletIdByName.set(w.name, w.id!));
      const items = Object.entries(categoryWallet).map(([category, wid]) => ({
        budget_id: id,
        category,
        wallet_id: wid || null,
        limit_amount: 0,
      }));
      await database.upsertCategoryBudgets(items as any);
      Alert.alert('Thành công', 'Đã lưu thiết lập ngân sách');
      router.back();
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể lưu ngân sách');
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <ThemedText type="title" style={styles.title}>Thiết Lập Ngân Sách</ThemedText>

      <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
        <ThemedText style={styles.sectionLabel}>Chu kỳ</ThemedText>
        <View style={styles.rowBetween}>
          <Pressable
            style={[
              styles.chip,
              { backgroundColor: cycle === 'weekly' ? (tintColor + '20') : chipBg, borderColor: cycle === 'weekly' ? tintColor : (tintColor + '30') },
            ]}
            onPress={() => setCycle('weekly')}
          >
            <ThemedText style={[styles.chipText, { color: cycle === 'weekly' ? tintColor : textColor }]}>Tuần</ThemedText>
          </Pressable>
          <Pressable
            style={[
              styles.chip,
              { backgroundColor: cycle === 'monthly' ? (tintColor + '20') : chipBg, borderColor: cycle === 'monthly' ? tintColor : (tintColor + '30') },
            ]}
            onPress={() => setCycle('monthly')}
          >
            <ThemedText style={[styles.chipText, { color: cycle === 'monthly' ? tintColor : textColor }]}>Tháng</ThemedText>
          </Pressable>
        </View>

        <View style={[styles.rowBetween, { marginTop: 16 }]}> 
          <ThemedText style={styles.sectionLabel}>Gộp phần dư (rollover)</ThemedText>
          <Switch value={rollover} onValueChange={setRollover} thumbColor={rollover ? tintColor : undefined} />
        </View>

        <ThemedText style={{ opacity: 0.7 }}>Hạn mức 4 ví sẽ tự tính theo % × Thu nhập tháng này</ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
        <ThemedText style={styles.sectionLabel}>Phân bổ 4 ví (tổng 100%)</ThemedText>
        {wallets.map((w, i) => (
          <View key={`${w.name}-${i}`} style={styles.walletRow}>
            <View style={[styles.colorDot, { backgroundColor: w.color || '#888' }]} />
            <ThemedText style={styles.walletName}>{w.name}</ThemedText>
            <TextInput
              value={String(w.percent ?? '')}
              onChangeText={(t) => updateWalletPercent(i, t)}
              keyboardType="numeric"
              selectionColor={tintColor}
              style={[styles.percentInput, { borderColor: tintColor + '60', backgroundColor: chipBg, color: textColor }]}
              placeholder="0"
              placeholderTextColor={'#9ca3af'}
            />
            <ThemedText style={[styles.percentSuffix, { color: textColor }]}>%</ThemedText>
          </View>
        ))}
        <ThemedText style={[styles.totalText, { color: Math.round(totalPercent) === 100 ? '#16a34a' : '#ef4444' }]}>Tổng: {totalPercent}%</ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
        <ThemedText style={styles.sectionLabel}>Gán danh mục vào ví</ThemedText>
        {EXPENSE_CATEGORIES.map((cat) => (
          <View key={cat} style={styles.mapRow}>
            <ThemedText style={styles.mapCat}>{cat}</ThemedText>
            <View style={styles.mapActions}>
              {wallets.map(w => (
                <Pressable key={w.id || w.name} style={[styles.mapChip, (categoryWallet[cat] === w.id) ? { borderColor: tintColor } : null]} onPress={() => setCategoryWallet(prev => ({ ...prev, [cat]: w.id || null }))}>
                  <ThemedText style={[styles.mapChipText, { color: (categoryWallet[cat] === w.id) ? tintColor : textColor }]}>{vnNameOf(w.name)}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ThemedView>

      <Pressable style={[styles.saveBtn, { backgroundColor: tintColor }]} onPress={handleSave} disabled={loading}>
        <Ionicons name="save-outline" size={18} color="#fff" />
        <ThemedText style={styles.saveText}>Lưu</ThemedText>
      </Pressable>
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
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  walletName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  percentInput: {
    width: 70,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'right',
    fontSize: 16,
    marginRight: 6,
  },
  percentSuffix: {
    width: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  totalText: {
    marginTop: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8,
    fontSize: 16,
  },
  mapRow: {
    marginTop: 10,
  },
  mapCat: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  mapActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8 as any,
  },
  mapChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  mapChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
