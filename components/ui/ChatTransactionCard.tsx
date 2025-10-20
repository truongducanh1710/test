import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, useColorScheme, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import DateTimePicker from '@react-native-community/datetimepicker';

export type ChatDraftTx = {
  amount: number;
  currency: string;
  description: string;
  category: string;
  date: string; // yyyy-mm-dd
  type: 'income' | 'expense';
};

export type ChatTransactionCardProps = {
  draft: ChatDraftTx;
  onConfirm: (next: ChatDraftTx) => Promise<string>;
  onCancel: () => void;
  onOpenDetail?: (id: string) => void;
};

export default function ChatTransactionCard({ draft, onConfirm, onCancel, onOpenDetail }: ChatTransactionCardProps) {
  const [editing, setEditing] = useState(true);
  const [state, setState] = useState<ChatDraftTx>(draft);
  const [saved, setSaved] = useState<string | null>(null);
  const [showDate, setShowDate] = useState(false);

  const amountDisplay = useMemo(() => new Intl.NumberFormat('vi-VN').format(state.amount), [state.amount]);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const toggleType = () => setState((s) => ({ ...s, type: s.type === 'expense' ? 'income' : 'expense' }));

  const confirm = async () => {
    const id = await onConfirm(state);
    setSaved(id);
    setEditing(false);
  };

  const { icon, bg } = getCategoryVisual(state.category);
  const typeColor = state.type === 'expense' ? '#ef4444' : '#22c55e';
  const bgCard = isDark ? '#1e293b' : '#ffffff';
  const borderCard = isDark ? '#334155' : '#e2e8f0';
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';

  return (
    <View style={[styles.wrapper, { backgroundColor: bgCard, borderColor: borderCard }]}>
      {/* Main content row */}
      <View style={styles.row}>
        {/* Left: Icon */}
        <View style={[styles.iconCircle, { backgroundColor: bg }]}>
          <ThemedText style={styles.iconText}>{icon}</ThemedText>
        </View>

        {/* Center: Category, Description, Date */}
        <View style={styles.centerContent}>
          <View style={styles.topRow}>
            <ThemedText style={[styles.categoryText, { color: textPrimary }]}>{state.category}</ThemedText>
            <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
              <ThemedText style={styles.typeBadgeText}>{state.type === 'expense' ? 'Chi' : 'Thu'}</ThemedText>
            </View>
          </View>

          {editing ? (
            <TextInput
              value={state.description}
              onChangeText={(t: string) => setState((s) => ({ ...s, description: t }))}
              placeholder="Mô tả giao dịch"
              placeholderTextColor={textSecondary}
              style={[styles.descInput, { color: textPrimary, borderColor: borderCard, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}
            />
          ) : (
            <ThemedText style={[styles.descText, { color: textSecondary }]}>{state.description}</ThemedText>
          )}

          <TouchableOpacity onPress={() => setShowDate(true)} style={[styles.dateBtn, { borderColor: borderCard }]}>
            <ThemedText style={[styles.dateText, { color: textSecondary }]}>📅 {state.date}</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Right: Amount */}
        <View style={styles.rightAmount}>
          <ThemedText style={[styles.amountText, { color: typeColor }]}>{amountDisplay}</ThemedText>
          <ThemedText style={[styles.currencyText, { color: textSecondary }]}>{state.currency}</ThemedText>
        </View>
      </View>

      {/* Date picker */}
      {showDate && (
        <DateTimePicker
          value={new Date(state.date)}
          mode="date"
          onChange={(_, d) => {
            setShowDate(false);
            if (!d) return;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            setState((s) => ({ ...s, date: `${y}-${m}-${da}` }));
          }}
        />
      )}

      {/* Bottom actions */}
      <View style={[styles.footer, { borderTopColor: borderCard }]}>
        {!saved ? (
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={onCancel} style={styles.btnCancel}>
              <ThemedText style={[styles.btnCancelText, { color: textSecondary }]}>Hủy</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={editing ? confirm : () => setEditing(true)} style={[styles.btnConfirm, { backgroundColor: '#3b82f6' }]}>
              <ThemedText style={styles.btnConfirmText}>{editing ? 'Xác nhận' : 'Sửa'}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.savedRow}>
            <ThemedText style={[styles.savedText, { color: '#22c55e' }]}>✓ Đã lưu</ThemedText>
            {saved && (
              <TouchableOpacity onPress={() => onOpenDetail && onOpenDetail(saved!)}>
                <ThemedText style={[styles.linkText, { color: '#3b82f6' }]}>Mở chi tiết</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  centerContent: {
    flex: 1,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  descInput: {
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  descText: {
    fontSize: 13,
  },
  dateBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 12,
  },
  rightAmount: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
  },
  currencyText: {
    fontSize: 11,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnCancelText: {
    fontSize: 14,
  },
  btnConfirm: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

function getCategoryVisual(category: string): { icon: string; bg: string } {
  const map: Record<string, { icon: string; bg: string }> = {
    'Ăn uống': { icon: '🍽️', bg: '#fef3c7' },
    'Di chuyển': { icon: '🚗', bg: '#dbeafe' },
    'Xăng xe': { icon: '⛽', bg: '#ccfbf1' },
    'Mua sắm': { icon: '🛍️', bg: '#fce7f3' },
    'Y tế': { icon: '🏥', bg: '#e0e7ff' },
    'Giải trí': { icon: '🎮', bg: '#ede9fe' },
    'Học tập': { icon: '📚', bg: '#fbcfe8' },
    'Nhà ở': { icon: '🏠', bg: '#d1fae5' },
  };
  return map[category] || { icon: '📋', bg: '#f3f4f6' };
}
