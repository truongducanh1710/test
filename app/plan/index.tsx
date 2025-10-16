import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, type FinancialPlan, formatCurrency } from '@/lib/database';

export default function PlanScreen() {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<FinancialPlan | null>(null);
  const [actions, setActions] = useState<{ id?: string; title: string; status?: 'todo' | 'done'; due_date?: string | null }[]>([]);

  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1f1f1f' }, 'background');

  useEffect(() => { (async () => {
    setLoading(true);
    await database.init();
    const p = await database.getFinancialPlan();
    if (p) {
      setPlan(p);
      setActions(await database.listPlanActions(p.id!));
    } else {
      const id = await database.upsertFinancialPlan({});
      const np = await database.getFinancialPlan();
      setPlan(np);
      setActions([]);
    }
    setLoading(false);
  })(); }, []);

  const health = useMemo(() => {
    // Simple score A-E: placeholder using income vs expense this month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0,10);
    return { start, end };
  }, []);

  const [totals, setTotals] = useState<{ income: number; expense: number }>({ income: 0, expense: 0 });
  useEffect(() => { (async () => {
    await database.init();
    const t = await database.getTotalsByType(health.start, health.end);
    setTotals(t);
  })(); }, [health]);

  const score = useMemo(() => {
    const ratio = totals.income > 0 ? (totals.expense / totals.income) : 1;
    if (ratio <= 0.5) return 'A';
    if (ratio <= 0.7) return 'B';
    if (ratio <= 0.85) return 'C';
    if (ratio <= 1.0) return 'D';
    return 'E';
  }, [totals]);

  const [reco, setReco] = useState<Record<string, number> | null>(null);
  useEffect(() => { (async () => {
    await database.init();
    const r = await database.getRecommendedWalletPercents(health.start, health.end);
    setReco(r);
  })(); }, [health]);

  const toggleAction = async (a: any) => {
    await database.upsertPlanAction({ id: a.id, plan_id: plan!.id!, title: a.title, status: a.status === 'done' ? 'todo' : 'done', due_date: a.due_date || null });
    setActions(await database.listPlanActions(plan!.id!));
  };

  if (loading || !plan) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}> 
        <ActivityIndicator size="large" color={tintColor} style={{ marginTop: 40 }} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}> 
      <ThemedText type="title" style={styles.title}>Kế hoạch tài chính</ThemedText>

      <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
        <ThemedText style={styles.blockTitle}>Điểm sức khỏe</ThemedText>
        <ThemedText style={{ fontSize: 48, fontWeight: '800' }}>{score}</ThemedText>
        <ThemedText style={{ opacity: 0.7 }}>Tháng này: Thu {formatCurrency(totals.income)} • Chi {formatCurrency(totals.expense)}</ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
        <ThemedText style={styles.blockTitle}>Tỷ lệ 4 ví gợi ý</ThemedText>
        {reco ? (
          Object.entries(reco).map(([k, v]) => (
            <ThemedText key={k} style={{ marginTop: 4 }}>{k}: {v}%</ThemedText>
          ))
        ) : (
          <ThemedText style={{ opacity: 0.7 }}>Đang tính...</ThemedText>
        )}
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
        <ThemedText style={styles.blockTitle}>Hành động ưu tiên</ThemedText>
        {actions.length === 0 ? (
          <ThemedText style={{ opacity: 0.7 }}>Chưa có</ThemedText>
        ) : (
          actions.map(a => (
            <Pressable key={a.id} onPress={() => toggleAction(a)} style={styles.actionRow}>
              <ThemedText style={{ textDecorationLine: a.status === 'done' ? 'line-through' : 'none' }}>{a.title}</ThemedText>
              <ThemedText style={{ opacity: 0.6 }}>{a.status === 'done' ? 'Hoàn thành' : 'Chưa làm'}</ThemedText>
            </Pressable>
          ))
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  card: { borderRadius: 12, padding: 14, marginBottom: 12 },
  blockTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
});



