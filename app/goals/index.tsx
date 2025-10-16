import React, { useEffect, useState } from 'react';
import { StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, formatCurrency, type Goal } from '@/lib/database';

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1f1f1f' }, 'background');

  const load = async () => {
    setLoading(true);
    await database.init();
    const data = await database.listGoals();
    setGoals(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim() || !amount) {
      Alert.alert('Thiếu thông tin', 'Nhập tên và số tiền mục tiêu');
      return;
    }
    try {
      await database.createGoal({ name: name.trim(), target_amount: Number(amount), deadline, wallet_id: null, priority: 0 });
      setName(''); setAmount(''); setDeadline(null); setShowCreate(false);
      load();
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể tạo mục tiêu');
    }
  };

  const contribute = async (goal: Goal) => {
    Alert.prompt(
      'Góp vào mục tiêu',
      `Nhập số tiền góp cho "${goal.name}"`,
      async (val) => {
        const v = Number((val || '').replace(/[^0-9.]/g, ''));
        if (!v || v <= 0) return;
        try {
          await database.addContribution({ goal_id: goal.id!, amount: v, date: new Date().toISOString().slice(0,10), source: 'manual', note: null });
          load();
        } catch (e: any) { Alert.alert('Lỗi', e?.message || 'Không thể góp'); }
      },
      'plain-text'
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}> 
      <ThemedText type="title" style={styles.title}>Mục tiêu</ThemedText>

      {/* Create form */}
      {showCreate ? (
        <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
          <ThemedText style={styles.label}>Tên mục tiêu</ThemedText>
          <TextInput value={name} onChangeText={setName} placeholder="VD: Quỹ dự phòng" placeholderTextColor={textColor + '60'} style={[styles.input, { color: textColor, borderColor: tintColor + '30' }]} />
          <ThemedText style={styles.label}>Số tiền đích</ThemedText>
          <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} placeholder="0" keyboardType="numeric" placeholderTextColor={textColor + '60'} style={[styles.input, { color: textColor, borderColor: tintColor + '30' }]} />
          <Pressable style={[styles.dateBtn, { borderColor: tintColor + '30' }]} onPress={() => setShowDeadlinePicker(true)}>
            <Ionicons name="calendar" size={18} color={tintColor} />
            <ThemedText style={{ marginLeft: 8 }}>{deadline ? new Date(deadline).toLocaleDateString('vi-VN') : 'Chọn hạn (tùy chọn)'}</ThemedText>
          </Pressable>
          {showDeadlinePicker && (
            <DateTimePicker value={deadline ? new Date(deadline) : new Date()} mode="date" display="default" onChange={(_, d) => { setShowDeadlinePicker(false); if (d) setDeadline(d.toISOString().slice(0,10)); }} />
          )}
          <Pressable style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={create}>
            <ThemedText style={styles.primaryText}>Tạo mục tiêu</ThemedText>
          </Pressable>
        </ThemedView>
      ) : (
        <Pressable style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={() => setShowCreate(true)}>
          <ThemedText style={styles.primaryText}>+ Tạo mục tiêu</ThemedText>
        </Pressable>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={tintColor} style={{ marginTop: 20 }} />
      ) : (
        <ScrollView>
          {goals.map(g => (
            <GoalRow key={g.id} goal={g} onContribute={() => contribute(g)} />
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

function GoalRow({ goal, onContribute }: { goal: Goal; onContribute: () => void }) {
  const [progress, setProgress] = useState<{ contributed: number; remaining: number; percent: number }>({ contributed: 0, remaining: 0, percent: 0 });
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1f1f1f' }, 'background');
  const tintColor = useThemeColor({}, 'tint');

  useEffect(() => { (async () => { try { await database.init(); const p = await database.computeGoalProgress(goal.id!); setProgress(p); } catch {} })(); }, [goal.id]);

  return (
    <ThemedView style={[styles.card, { backgroundColor: cardBg }]}> 
      <ThemedText style={styles.goalName}>{goal.name}</ThemedText>
      <ThemedText style={styles.goalMeta}>{formatCurrency(progress.contributed)} / {formatCurrency(Number(goal.target_amount || 0))} ({progress.percent.toFixed(0)}%)</ThemedText>
      <ThemedView style={{ height: 8, borderRadius: 4, backgroundColor: '#333', overflow: 'hidden', marginTop: 8 }}>
        <ThemedView style={{ height: '100%', width: `${Math.min(100, progress.percent)}%`, backgroundColor: tintColor }} />
      </ThemedView>
      <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <ThemedText style={styles.goalMeta}>{goal.deadline ? new Date(goal.deadline).toLocaleDateString('vi-VN') : 'Không hạn'}</ThemedText>
        <Pressable style={[styles.smallBtn, { borderColor: tintColor }]} onPress={onContribute}>
          <ThemedText style={[styles.smallBtnText, { color: tintColor }]}>+ Góp</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  card: { borderRadius: 12, padding: 14, marginBottom: 12 },
  label: { fontSize: 12, opacity: 0.7, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginVertical: 8 },
  primaryText: { color: 'white', fontWeight: '700' },
  goalName: { fontSize: 16, fontWeight: '700' },
  goalMeta: { fontSize: 12, opacity: 0.7, marginTop: 4 },
  smallBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  smallBtnText: { fontWeight: '600' },
});



