import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database } from '@/lib/database';
import { useRouter } from 'expo-router';

type DayCell = { date: string; day: number; net: number; count: number };

export default function CalendarScreen() {
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const bg = useThemeColor({}, 'background');
  const cardBg = useThemeColor({ light: '#fff', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#374151' }, 'border');
  const subText = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const router = useRouter();

  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [daily, setDaily] = useState<Record<string, { net: number; count: number }>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{ category: string; total: number; type: 'income'|'expense'; count: number }>>([]);

  useEffect(() => {
    (async () => {
      await database.init();
      // preload prev, current, next
      const months = [ -1, 0, 1 ];
      const map: Record<string, { net: number; count: number }> = {};
      for (const m of months) {
        const d = new Date(cursor.getFullYear(), cursor.getMonth() + m, 1);
        const arr = await database.getDailyNetForMonth(d.getFullYear(), d.getMonth() + 1);
        for (const item of arr) {
          map[item.date] = { net: Number(item.net || 0), count: Number(item.count || 0) };
        }
      }
      setDaily(map);
    })();
  }, [cursor]);

  const days: DayCell[] = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const firstWeekday = (start.getDay() + 6) % 7; // Mon=0
    const arr: DayCell[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      arr.push({ date: '', day: 0, net: 0, count: 0 });
    }
    for (let d = 1; d <= end.getDate(); d++) {
      const dateKey = new Date(year, month, d).toISOString().slice(0,10);
      const v = daily[dateKey] || { net: 0, count: 0 };
      arr.push({ date: dateKey, day: d, net: v.net, count: v.count });
    }
    return arr;
  }, [cursor, daily]);

  useEffect(() => {
    (async () => {
      if (!selected) { setCategories([]); return; }
      const rows = await database.getCategoryTotalsForDate(selected);
      setCategories(rows);
    })();
  }, [selected]);

  const monthLabel = cursor.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  const colorForNet = (net: number) => {
    const mag = Math.min(1, Math.abs(net) / 1000000); // scale
    const alpha = 0.15 + mag * 0.7;
    if (net < 0) return `rgba(239,68,68,${alpha})`; // red
    if (net > 0) return `rgba(34,197,94,${alpha})`; // green
    return 'transparent';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const getCategoryVisual = (category: string): { icon: string; bg: string } => {
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
  };

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <ThemedView style={[styles.header, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <Pressable 
          style={[styles.navButton, { backgroundColor: tint + '15' }]} 
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))}
        >
          <Ionicons name="chevron-back" size={22} color={tint} />
        </Pressable>
        
        <View style={styles.monthTitleContainer}>
          <ThemedText type="title" style={styles.monthTitle}>{monthLabel}</ThemedText>
        </View>
        
        <Pressable 
          style={[styles.navButton, { backgroundColor: tint + '15' }]} 
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))}
        >
          <Ionicons name="chevron-forward" size={22} color={tint} />
        </Pressable>
      </ThemedView>

      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        {/* Weekday Header */}
        <View style={styles.weekdayRow}>
          {['T2','T3','T4','T5','T6','T7','CN'].map(w => (
            <ThemedText key={w} style={[styles.weekdayLabel, { color: subText }]}>{w}</ThemedText>
          ))}
        </View>

        {/* Calendar Grid */}
        <Animated.View 
          entering={FadeIn.duration(300)} 
          exiting={FadeOut.duration(200)} 
          style={styles.grid}
        >
          {days.map((d, idx) => {
            const isSel = selected === d.date;
            const bgHeat = colorForNet(d.net);
            const isToday = d.date === today.toISOString().slice(0, 10);
            
            return (
              <Pressable
                key={idx}
                disabled={!d.date}
                onPressIn={() => d.date && setPressed(d.date)}
                onPressOut={() => setPressed(null)}
                style={[
                  styles.cell,
                  { backgroundColor: bgHeat },
                  isSel && { borderColor: tint, borderWidth: 2.5 },
                  isToday && !isSel && { borderColor: tint + '50', borderWidth: 1.5 },
                  d.date && styles.cellShadow,
                  { transform: [{ scale: pressed === d.date ? 0.92 : 1 }] },
                ]}
                onPress={() => setSelected(d.date!)}
              >
                {isSel && (
                  <LinearGradient 
                    colors={[tint + '20', tint + '05']} 
                    style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} 
                  />
                )}
                
                <ThemedText style={[
                  styles.dayNumber,
                  isSel && { color: tint, fontWeight: '800' },
                  isToday && { color: tint }
                ]}>
                  {d.day || ''}
                </ThemedText>
                
                {!!d.date && d.net !== 0 && (
                  <ThemedText style={[
                    styles.netAmount,
                    { color: d.net < 0 ? '#ef4444' : '#22c55e' },
                    isSel && { fontWeight: '700' }
                  ]}>
                    {new Intl.NumberFormat('vi-VN', { notation: 'compact', compactDisplay: 'short' }).format(Math.abs(d.net))}
                  </ThemedText>
                )}
                
                {!!(d.count && d.date) && (
                  <View style={[styles.badge, { backgroundColor: tint }]}>
                    <ThemedText style={styles.badgeText}>{d.count}</ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Heatmap Legend */}
        <View style={styles.legendContainer}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: 'rgba(239,68,68,0.6)' }]} />
            <ThemedText style={[styles.legendText, { color: subText }]}>Chi tiêu</ThemedText>
          </View>
          <LinearGradient 
            colors={['rgba(239,68,68,0.3)', 'transparent', 'rgba(34,197,94,0.3)']} 
            start={{ x: 0, y: 0 }} 
            end={{ x: 1, y: 0 }} 
            style={styles.legendGradient} 
          />
          <View style={styles.legendRow}>
            <ThemedText style={[styles.legendText, { color: subText }]}>Thu nhập</ThemedText>
            <View style={[styles.legendDot, { backgroundColor: 'rgba(34,197,94,0.6)' }]} />
          </View>
        </View>

        {/* Selected Date Details */}
        {selected ? (
          <Animated.View 
            entering={SlideInRight.duration(300)} 
            exiting={SlideOutLeft.duration(200)}
            style={[styles.detailCard, { backgroundColor: cardBg, borderColor }]}
          >
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText type="subtitle" style={styles.detailTitle}>
                  {formatDate(selected)}
                </ThemedText>
                <View style={styles.totalRow}>
                  <ThemedText style={[styles.totalLabel, { color: subText }]}>Tổng: </ThemedText>
                  <ThemedText style={[
                    styles.totalAmount,
                    { color: (daily[selected]?.net || 0) < 0 ? '#ef4444' : '#22c55e' }
                  ]}>
                    {new Intl.NumberFormat('vi-VN').format(daily[selected]?.net || 0)} ₫
                  </ThemedText>
                </View>
              </View>
              <Pressable onPress={() => setSelected(null)} style={styles.closeButton}>
                <Ionicons name="close-circle" size={28} color={subText} />
              </Pressable>
            </View>

            {categories.length > 0 ? (
              <View style={styles.categoryList}>
                {categories.map((c, i) => {
                  const { icon, bg } = getCategoryVisual(c.category);
                  return (
                    <Pressable 
                      key={i} 
                      onPress={() => router.push({ pathname: '/transactions', params: { date: selected, category: c.category } as any })}
                      style={[styles.categoryItem, { borderBottomColor: borderColor }]}
                    >
                      <View style={[styles.categoryIcon, { backgroundColor: bg }]}>
                        <ThemedText style={styles.categoryIconText}>{icon}</ThemedText>
                      </View>
                      <View style={styles.categoryContent}>
                        <ThemedText style={styles.categoryName}>{c.category}</ThemedText>
                        <ThemedText style={[styles.categoryCount, { color: subText }]}>
                          {c.count} giao dịch
                        </ThemedText>
                      </View>
                      <ThemedText style={[
                        styles.categoryAmount,
                        { color: c.type === 'expense' ? '#ef4444' : '#22c55e' }
                      ]}>
                        {new Intl.NumberFormat('vi-VN').format(c.total)} ₫
                      </ThemedText>
                      <Ionicons name="chevron-forward" size={20} color={subText} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <ThemedText style={[styles.emptyText, { color: subText }]}>
                  Không có giao dịch
                </ThemedText>
              </View>
            )}
          </Animated.View>
        ) : (
          <Animated.View 
            entering={FadeIn.delay(200)} 
            style={[styles.emptyCard, { backgroundColor: cardBg + '80', borderColor: borderColor + '50' }]}
          >
            <Ionicons name="calendar-outline" size={48} color={subText + '60'} />
            <ThemedText style={[styles.emptyHint, { color: subText }]}>
              Chạm vào ngày để xem chi tiết giao dịch
            </ThemedText>
          </Animated.View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  weekdayLabel: {
    width: 44,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cell: {
    width: 44,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    position: 'relative',
  },
  cellShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  netAmount: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
  },
  legendGradient: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  detailCard: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  totalLabel: {
    fontSize: 14,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  categoryList: {
    paddingVertical: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconText: {
    fontSize: 20,
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryCount: {
    fontSize: 12,
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  emptyCard: {
    marginTop: 24,
    padding: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 12,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
  },
});
