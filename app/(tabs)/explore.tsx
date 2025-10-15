import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, Pressable, Dimensions, Alert, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, formatCurrency, type Budget, databaseEvents } from '@/lib/database';
import { ensureNotificationPermissions, notifyBudgetThreshold, setupAndroidChannels, scheduleDailyDigest } from '@/lib/notifications';
import { TransactionSummary, CategorySummary } from '@/types/transaction';

const { width } = Dimensions.get('window');

type RangeKey = 'week' | 'thisMonth' | 'lastMonth';

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

// Module-level caches to persist across tab unmounts
let financeSummaryCache: TransactionSummary | null = null;
let financeMonthlyCache: MonthlyData[] | null = null;
const financeTopCache: Map<string, CategorySummary[]> = new Map();
// Budget cache
let financeBudgetCache: { budget: Budget | null; wallets: { id: string; name: string; color?: string | null; spend: number; limit: number; usedPct: number }[] } | null = null;

export default function FinanceScreen() {
  const [loading, setLoading] = useState(true);
  const [currentMonthSummary, setCurrentMonthSummary] = useState<TransactionSummary>({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    transactionCount: 0
  });
  const [topCategories, setTopCategories] = useState<CategorySummary[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [range, setRange] = useState<RangeKey>('thisMonth');
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [loadingTop, setLoadingTop] = useState(false);
  const cacheRef = useRef<Map<string, CategorySummary[]>>(financeTopCache);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [walletProgress, setWalletProgress] = useState<{ id: string; name: string; color?: string | null; spend: number; limit: number; usedPct: number }[]>([]);
  const [incomeThisMonth, setIncomeThisMonth] = useState<number>(0);
  const [walletCategories, setWalletCategories] = useState<Map<string, string[]>>(new Map());
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1f1f1f' }, 'background');
  const dividerColor = useThemeColor({ light: '#e5e7eb', dark: '#2a2a2a' }, 'background');
  const router = useRouter();

  // Helpers
  const toDateString = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0,10);
  const getRangeDates = (key: RangeKey, base = new Date()) => {
    if (key === 'thisMonth') return { start: toDateString(new Date(base.getFullYear(), base.getMonth(), 1)), end: toDateString(new Date(base.getFullYear(), base.getMonth() + 1, 0)) };
    if (key === 'lastMonth') return { start: toDateString(new Date(base.getFullYear(), base.getMonth() - 1, 1)), end: toDateString(new Date(base.getFullYear(), base.getMonth(), 0)) };
    const day = base.getDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: toDateString(monday), end: toDateString(sunday) };
  };
  const cacheKeyOf = (key: RangeKey, base = new Date()) => {
    const { start, end } = getRangeDates(key, base);
    return `${key}:${start}_${end}`;
  };

  // Load base data once; hydrate from module cache; prefetch in background
  useFocusEffect(
    useCallback(() => {
      // Hydrate from module-level caches if available to avoid full-screen loading
      if (financeSummaryCache) setCurrentMonthSummary(financeSummaryCache);
      if (financeMonthlyCache) setMonthlyData(financeMonthlyCache);
      if (financeBudgetCache) {
        setBudget(financeBudgetCache.budget);
        setWalletProgress(financeBudgetCache.wallets);
      }
      const initialTop = cacheRef.current.get(cacheKeyOf(range));
      if (initialTop) setTopCategories(initialTop);
      setLoading(!(financeSummaryCache && financeMonthlyCache));

      (async () => {
        try {
          // Always refresh background
          await database.init();
          database.enableRealtime();
          await setupAndroidChannels();
          await ensureNotificationPermissions();
          const now = new Date();
          // Summary
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
          const totals = await database.getTotalsByType(startOfMonth, endOfMonth);
          const tx = await database.getTransactions(100);
          const nextSummary = { totalIncome: totals.income, totalExpense: totals.expense, balance: totals.income - totals.expense, transactionCount: tx.length };
          setCurrentMonthSummary(nextSummary);
          financeSummaryCache = nextSummary;

          // Monthly trends
          const months: MonthlyData[] = [];
          for (let i = 5; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStart = monthDate.toISOString().split('T')[0];
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).toISOString().split('T')[0];
            const monthTotals = await database.getTotalsByType(monthStart, monthEnd);
            months.push({ month: monthDate.toLocaleDateString('vi-VN', { month: 'short' }), income: monthTotals.income, expense: monthTotals.expense, balance: monthTotals.income - monthTotals.expense });
          }
          setMonthlyData(months);
          financeMonthlyCache = months;

          // Ensure current range data exists
          await fetchTopCategories(range, false);
          // Prefetch others
          fetchTopCategories('week', true);
          fetchTopCategories('lastMonth', true);

          // Ensure default mapping exists then load budget & wallets progress
          if (financeBudgetCache?.budget?.id) {
            try { await database.seedDefaultCategoryWalletsIfEmpty(financeBudgetCache.budget.id!); } catch {}
          }
          await loadBudgetAndWallets(range);
          // schedule digest once (idempotent-ish; harmless if repeats)
          scheduleDailyDigest(9).catch(() => {});
        } finally {
          setLoading(false);
        }
      })();

      // Live refresh when transactions or mappings change
      const onChange = () => {
        fetchTopCategories(range, true);
        loadBudgetAndWallets(range);
      };
      databaseEvents.on('transactions_changed', onChange);
      databaseEvents.on('category_budgets_changed', onChange);
      return () => {
        databaseEvents.off('transactions_changed', onChange);
        databaseEvents.off('category_budgets_changed', onChange);
      };
    }, [range])
  );

  // Fetch Top 5 with SWR-like behavior
  const fetchTopCategories = async (key: RangeKey, background = false) => {
    const now = new Date();
    const cacheKey = cacheKeyOf(key, now);
    const cached = cacheRef.current.get(cacheKey);
    if (!background) {
      if (cached) setTopCategories(cached);
      setLoadingTop(!cached);
    }
    const { start, end } = getRangeDates(key, now);
    const categories = await database.getTransactionsByCategory('expense', start, end);
    const { expense: totalExpenseRange } = await database.getTotalsByType(start, end);
    const computed = categories.map(cat => ({ ...cat, percentage: totalExpenseRange > 0 ? (cat.total / totalExpenseRange) * 100 : 0 })).slice(0, 5);
    cacheRef.current.set(cacheKey, computed);
    if (!background && key === range) {
      setTopCategories(computed);
      setLoadingTop(false);
    }
  };

  const loadBudgetAndWallets = async (key: RangeKey) => {
    setBudgetLoading(!financeBudgetCache);
    const b = await database.getActiveBudget();
    if (!b) {
      setBudget(null);
      setWalletProgress([]);
      financeBudgetCache = { budget: null, wallets: [] };
      setBudgetLoading(false);
      return;
    }
    const now = new Date();
    const { start, end } = getRangeDates(key, now);
    const [computedBudgets, spendByWallet, totals] = await Promise.all([
      database.computeWalletBudgets(b.id!, start, end),
      database.getSpendByWalletRange(b.id!, start, end),
      database.getTotalsByType(start, end),
    ]);
    const income = Number(totals.income || 0);
    const computed = computedBudgets.map(w => {
      const spend = spendByWallet.get(w.id) || 0;
      const usedPct = w.limit > 0 ? (spend / w.limit) * 100 : 0;
      return { id: w.id, name: w.name, color: w.color, spend, limit: w.limit, usedPct };
    });
    setBudget(b);
    setWalletProgress(computed);
    setIncomeThisMonth(income);
    setWalletCategories(await database.getWalletCategoriesMap(b.id!));
    financeBudgetCache = { budget: b, wallets: computed };
    setBudgetLoading(false);

    // Threshold notifications (80% warn, 100% critical)
    try {
      for (const w of computed) {
        if (w.limit <= 0) continue;
        const used = w.usedPct;
        if (used >= 100) {
          await notifyBudgetThreshold('⚠️ Vượt ngân sách', `${w.name}: đã vượt ${formatCurrency(w.spend)} / ${formatCurrency(w.limit)}`);
        } else if (used >= 80) {
          await notifyBudgetThreshold('Cảnh báo ngân sách', `${w.name}: ${used.toFixed(0)}% (${formatCurrency(w.spend)} / ${formatCurrency(w.limit)})`);
        }
      }
    } catch {}
  };

  const handleExportData = () => {
    Alert.alert('Xuất Dữ Liệu', 'Tính năng xuất dữ liệu sẽ ra mắt sớm!');
    setShowExportModal(false);
  };

  const handleBudgetManagement = () => {
    router.push({ pathname: '/budget' } as any);
  };

  const handleFinancialGoals = () => {
    Alert.alert('Mục Tiêu Tài Chính', 'Tính năng mục tiêu tài chính sẽ ra mắt sớm!');
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ActivityIndicator size="large" color={tintColor} style={styles.loader} />
        <ThemedText style={styles.loadingText}>Đang tải dữ liệu tài chính...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor }]} showsVerticalScrollIndicator={false}>
      {/* Financial Overview Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.financeHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ThemedView style={styles.headerContent}>
          <Ionicons name="analytics" size={48} color="white" style={styles.headerIcon} />
          <ThemedText style={styles.headerTitle}>Báo Cáo Tài Chính</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
           {new Date().toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
          </ThemedText>
          <ThemedText style={styles.balanceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatCurrency(currentMonthSummary.balance)}
          </ThemedText>
          <ThemedText style={styles.balanceLabel}>Số Dư Hiện Tại</ThemedText>
        </ThemedView>
      </LinearGradient>

      {/* Financial Summary Cards */}
      <ThemedView style={styles.summaryContainer}>
        <ThemedView style={[styles.summaryCard, { backgroundColor: '#22c55e' }]}>
          <Ionicons name="arrow-up" size={24} color="white" />
          <ThemedText style={styles.summaryAmount}>{formatCurrency(currentMonthSummary.totalIncome)}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Thu Nhập Tháng Này</ThemedText>
        </ThemedView>
        <ThemedView style={[styles.summaryCard, { backgroundColor: '#ef4444' }]}>
          <Ionicons name="arrow-down" size={24} color="white" />
          <ThemedText style={styles.summaryAmount}>{formatCurrency(currentMonthSummary.totalExpense)}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Chi Tiêu Tháng Này</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Budget Card (moved below summary) */}
      <ThemedView style={[styles.categoriesContainer, { backgroundColor: cardBg }]}> 
        <ThemedText type="title" style={styles.sectionTitle}>Ngân Sách</ThemedText>
        <ThemedText style={{ opacity: 0.8, marginBottom: 8 }}>Thu nhập tháng này: {formatCurrency(incomeThisMonth)}</ThemedText>
        <ThemedText style={{ opacity: 0.6, marginBottom: 12 }}>Ngân sách = % × Thu nhập tháng này</ThemedText>
        {!budget ? (
          <Pressable style={[styles.rangeSelector, { borderColor: tintColor + '60' }]} onPress={handleBudgetManagement}>
            <ThemedText style={[styles.rangeSelectorText, { color: tintColor }]}>Thiết lập ngân sách</ThemedText>
            <Ionicons name="chevron-forward" size={18} color={tintColor} />
          </Pressable>
        ) : walletProgress.length > 0 ? (
          walletProgress.map(w => {
            const vnName = w.name === 'Essentials' ? 'Thiết yếu' : w.name === 'Savings' ? 'Tiết kiệm' : w.name === 'Education' ? 'Học tập' : w.name === 'Lifestyle' ? 'Lối sống' : w.name;
            const cats = walletCategories.get(w.id) || [];
            const barColor = w.usedPct < 80 ? tintColor : w.usedPct <= 100 ? '#f59e0b' : '#ef4444';
            const statusLabel = w.usedPct > 100 ? 'Vượt' : w.usedPct >= 80 ? 'Gần ngưỡng' : 'Ổn định';
            const statusColor = w.usedPct > 100 ? '#ef4444' : w.usedPct >= 80 ? '#f59e0b' : '#22c55e';
            const isExpanded = expandedWallets.has(w.id);
            
            return (
              <ThemedView key={w.id} style={styles.walletCard}>
                {/* Wallet Header - Compact */}
                <ThemedView style={styles.walletTitleRow}>
                  <ThemedText style={styles.walletName}>{vnName}</ThemedText>
                  <ThemedView style={[styles.statusChip, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
                    <ThemedText style={[styles.statusChipText, { color: statusColor }]}>{statusLabel}</ThemedText>
                  </ThemedView>
                </ThemedView>

                {/* Amount & Progress in one line */}
                <ThemedView style={styles.walletProgressRow}>
                  <ThemedText style={styles.walletAmountCompact}>
                    {formatCurrency(w.spend)} / {formatCurrency(w.limit)}
                  </ThemedText>
                  <ThemedText style={[styles.walletPercentage, { color: barColor }]}>
                    {w.usedPct.toFixed(0)}%
                  </ThemedText>
                </ThemedView>

                {/* Progress Bar */}
                <ThemedView style={[styles.walletProgressBar, { backgroundColor: dividerColor }]}>
                  <ThemedView 
                    style={[styles.walletProgressFill, { width: `${Math.min(100, w.usedPct)}%`, backgroundColor: barColor }]} 
                  />
                </ThemedView>

                {/* Categories - Compact */}
                {cats.length > 0 && (
                  <ThemedView style={styles.categoryChipsContainer}>
                    {(isExpanded ? cats : cats.slice(0, 4)).map((cat, idx) => (
                      <ThemedView key={idx} style={[styles.categoryChip, { backgroundColor: tintColor + '15', borderColor: tintColor + '40' }]}>
                        <ThemedText style={[styles.categoryChipText, { color: tintColor }]}>{cat}</ThemedText>
                      </ThemedView>
                    ))}
                    {cats.length > 4 && (
                      <Pressable onPress={() => {
                        const newSet = new Set(expandedWallets);
                        if (isExpanded) newSet.delete(w.id);
                        else newSet.add(w.id);
                        setExpandedWallets(newSet);
                      }}>
                        <ThemedView style={[styles.categoryChip, { backgroundColor: tintColor + '25', borderColor: tintColor }]}>
                          <ThemedText style={[styles.categoryChipText, { color: tintColor, fontWeight: '600' }]}>
                            {isExpanded ? 'Thu gọn' : `+${cats.length - 4}`}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    )}
                  </ThemedView>
                )}
              </ThemedView>
            );
          })
        ) : (
          <ThemedText style={{ opacity: 0.7 }}>{budgetLoading ? 'Đang tải...' : 'Không có dữ liệu'}</ThemedText>
        )}
      </ThemedView>

      {/* Top Categories */}
      <ThemedView style={[styles.categoriesContainer, { backgroundColor: cardBg }]}> 
        <ThemedText type="title" style={styles.sectionTitle}>Danh Mục Chi Tiêu Hàng Đầu</ThemedText>
        <Pressable style={[styles.rangeSelector, { borderColor: tintColor + '60' }]} onPress={() => setShowRangeModal(true)}>
          <ThemedText style={[styles.rangeSelectorText, { color: tintColor }]}>
            {range === 'week' ? 'Tuần này' : range === 'thisMonth' ? 'Tháng này' : 'Tháng trước'}
          </ThemedText>
          <Ionicons name="chevron-down" size={18} color={tintColor} />
        </Pressable>
        {topCategories.length > 0 ? topCategories.map((category) => (
            <ThemedView key={category.category} style={styles.categoryItem}>
              <ThemedView style={styles.categoryInfo}>
                <ThemedText style={styles.categoryName}>{category.category}</ThemedText>
                <ThemedText style={styles.categoryAmount}>
                  {formatCurrency(category.total)}
                </ThemedText>
              </ThemedView>
              <ThemedView style={[styles.categoryBar, { backgroundColor: dividerColor }]}> 
                <ThemedView 
                  style={[
                    styles.categoryBarFill, 
                    { 
                      width: `${category.percentage}%`,
                      backgroundColor: tintColor 
                    }
                  ]} 
                />
              </ThemedView>
              <ThemedText style={styles.categoryPercentage}>
                {category.percentage.toFixed(1)}%
              </ThemedText>
            </ThemedView>
          )) : (
            <ThemedText style={{ opacity: 0.7 }}>Không có dữ liệu</ThemedText>
          )}
      </ThemedView>

      {/* Monthly Trends */}
      <ThemedView style={[styles.trendsContainer, { backgroundColor: cardBg }]}>
        <ThemedText type="title" style={styles.sectionTitle}>Xu Hướng 6 Tháng Gần Đây</ThemedText>
        <ThemedView style={styles.trendsChart}>
          {monthlyData.map((month, index) => {
            const maxAmount = Math.max(...monthlyData.map(m => Math.max(m.income, m.expense)));
            const incomeHeight = maxAmount > 0 ? (month.income / maxAmount) * 100 : 0;
            const expenseHeight = maxAmount > 0 ? (month.expense / maxAmount) * 100 : 0;
            
            return (
              <ThemedView key={index} style={styles.chartMonth}>
                <ThemedView style={styles.chartBars}>
                  <ThemedView 
                    style={[
                      styles.chartBar,
                      { height: `${incomeHeight}%`, backgroundColor: '#22c55e' }
                    ]} 
                  />
                  <ThemedView 
                    style={[
                      styles.chartBar,
                      { height: `${expenseHeight}%`, backgroundColor: '#ef4444' }
                    ]} 
                  />
                </ThemedView>
                <ThemedText style={styles.chartLabel}>{month.month}</ThemedText>
              </ThemedView>
            );
          })}
        </ThemedView>
        <ThemedView style={styles.chartLegend}>
          <ThemedView style={styles.legendItem}>
            <ThemedView style={[styles.legendColor, { backgroundColor: '#22c55e' }]} />
            <ThemedText style={styles.legendText}>Thu Nhập</ThemedText>
          </ThemedView>
          <ThemedView style={styles.legendItem}>
            <ThemedView style={[styles.legendColor, { backgroundColor: '#ef4444' }]} />
            <ThemedText style={styles.legendText}>Chi Tiêu</ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {/* Financial Tools */}
      <ThemedView style={[styles.toolsContainer, { backgroundColor: cardBg }]}>
        <ThemedText type="title" style={styles.sectionTitle}>Công Cụ Tài Chính</ThemedText>
        
        <ThemedView style={styles.toolsGrid}>
        <Pressable 
            style={[styles.toolCard, { backgroundColor: '#6366f1' }]}
            onPress={handleBudgetManagement}
          >
            <Ionicons name="wallet-outline" size={32} color="white" />
            <ThemedText style={styles.toolTitle}>Ngân Sách</ThemedText>
            <ThemedText style={styles.toolSubtitle}>Quản lý chi tiêu</ThemedText>
        </Pressable>

        <Pressable 
            style={[styles.toolCard, { backgroundColor: '#8b5cf6' }]}
            onPress={handleFinancialGoals}
          >
            <Ionicons name="flag-outline" size={32} color="white" />
            <ThemedText style={styles.toolTitle}>Mục Tiêu</ThemedText>
            <ThemedText style={styles.toolSubtitle}>Kế hoạch tài chính</ThemedText>
        </Pressable>

        <Pressable 
            style={[styles.toolCard, { backgroundColor: '#06b6d4' }]}
            onPress={() => setShowExportModal(true)}
          >
            <Ionicons name="download-outline" size={32} color="white" />
            <ThemedText style={styles.toolTitle}>Xuất Dữ Liệu</ThemedText>
            <ThemedText style={styles.toolSubtitle}>Backup & báo cáo</ThemedText>
        </Pressable>

        <Pressable 
            style={[styles.toolCard, { backgroundColor: '#10b981' }]}
            onPress={() => router.push('/camera')}
          >
            <Ionicons name="camera-outline" size={32} color="white" />
            <ThemedText style={styles.toolTitle}>Quét Sao Kê</ThemedText>
            <ThemedText style={styles.toolSubtitle}>AI tự động</ThemedText>
          </Pressable>
          </ThemedView>
      </ThemedView>

      {/* Export Data Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showExportModal}
        onRequestClose={() => setShowExportModal(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor }]}>
            <ThemedView style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Xuất Dữ Liệu</ThemedText>
              <Pressable onPress={() => setShowExportModal(false)}>
                <Ionicons name="close" size={24} color={tintColor} />
        </Pressable>
      </ThemedView>
            
            <ThemedView style={styles.exportOptions}>
              <Pressable style={styles.exportOption} onPress={handleExportData}>
                <Ionicons name="document-text-outline" size={24} color={tintColor} />
                <ThemedText style={styles.exportOptionText}>Xuất CSV</ThemedText>
                <ThemedText style={styles.exportOptionSubtext}>Tất cả giao dịch</ThemedText>
              </Pressable>
              
              <Pressable style={styles.exportOption} onPress={handleExportData}>
                <Ionicons name="document-outline" size={24} color={tintColor} />
                <ThemedText style={styles.exportOptionText}>Xuất PDF</ThemedText>
                <ThemedText style={styles.exportOptionSubtext}>Báo cáo tháng này</ThemedText>
              </Pressable>
              
              <Pressable style={styles.exportOption} onPress={handleExportData}>
                <Ionicons name="cloud-upload-outline" size={24} color={tintColor} />
                <ThemedText style={styles.exportOptionText}>Backup Dữ Liệu</ThemedText>
                <ThemedText style={styles.exportOptionSubtext}>Lưu trữ an toàn</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Range Picker Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showRangeModal}
        onRequestClose={() => setShowRangeModal(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor }]}> 
            <ThemedText style={styles.modalTitle}>Chọn phạm vi</ThemedText>
            {([
              { key: 'week', label: 'Tuần này' },
              { key: 'thisMonth', label: 'Tháng này' },
              { key: 'lastMonth', label: 'Tháng trước' },
            ] as { key: 'week' | 'thisMonth' | 'lastMonth'; label: string }[]).map(opt => (
              <Pressable
                key={opt.key}
                style={[styles.exportOption, range === opt.key ? { backgroundColor: tintColor + '15' } : null]}
                onPress={() => { setRange(opt.key); setShowRangeModal(false); }}
              >
                <ThemedText style={styles.exportOptionText}>{opt.label}</ThemedText>
              </Pressable>
            ))}
          </ThemedView>
        </ThemedView>
      </Modal>

      <ThemedView style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 100,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 20,
    opacity: 0.7,
  },
  financeHeader: {
    height: 260,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 70,
    paddingBottom: 20,
  },
  headerContent: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  headerIcon: {
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 15,
  },
  balanceText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
    lineHeight: 40,
    textAlign: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: 'transparent',
  },
  summaryCard: {
    flex: 1,
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginVertical: 5,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  categoriesContainer: {
    margin: 20,
    backgroundColor: 'transparent',
    borderRadius: 15,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  rangeSelector: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  rangeSelectorText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: 'transparent',
  },
  categoryInfo: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryAmount: {
    fontSize: 12,
    opacity: 0.7,
  },
  categoryBar: {
    flex: 2,
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginHorizontal: 15,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryPercentage: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 35,
    textAlign: 'right',
  },
  trendsContainer: {
    margin: 20,
    backgroundColor: 'transparent',
    borderRadius: 15,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  trendsChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    marginVertical: 20,
    backgroundColor: 'transparent',
  },
  chartMonth: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  chartBar: {
    width: 8,
    marginHorizontal: 1,
    borderRadius: 4,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 10,
    opacity: 0.7,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    backgroundColor: 'transparent',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 5,
  },
  legendText: {
    fontSize: 12,
    opacity: 0.7,
  },
  toolsContainer: {
    margin: 20,
    backgroundColor: 'transparent',
    borderRadius: 15,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  toolCard: {
    width: '48%',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    marginBottom: 5,
  },
  toolSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    borderRadius: 20,
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'transparent',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  exportOptions: {
    backgroundColor: 'transparent',
  },
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  exportOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 15,
  },
  exportOptionSubtext: {
    fontSize: 12,
    opacity: 0.6,
  },
  bottomSpacer: {
    height: 50,
    backgroundColor: 'transparent',
  },
  walletCard: {
    backgroundColor: 'transparent',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  walletName: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  walletProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  walletAmountCompact: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: '500',
  },
  walletPercentage: {
    fontSize: 13,
    fontWeight: '700',
  },
  walletProgressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  walletProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    backgroundColor: 'transparent',
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 5,
    marginBottom: 5,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
