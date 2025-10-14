import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, StyleSheet, Pressable, Dimensions, Alert, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, formatCurrency } from '@/lib/database';
import { TransactionSummary, CategorySummary } from '@/types/transaction';

const { width } = Dimensions.get('window');

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

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
  
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const router = useRouter();

  // Load data when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadFinanceData();
    }, [])
  );

  const loadFinanceData = async () => {
    try {
      setLoading(true);
      await database.init();

      // Get current month summary
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

      const totals = await database.getTotalsByType(startOfMonth, endOfMonth);
      const transactions = await database.getTransactions(100);
      const categories = await database.getTransactionsByCategory('expense');

      setCurrentMonthSummary({
        totalIncome: totals.income,
        totalExpense: totals.expense,
        balance: totals.income - totals.expense,
        transactionCount: transactions.length
      });

      // Calculate percentages for top categories
      const totalExpense = totals.expense;
      const categoriesWithPercentage = categories.map(cat => ({
        ...cat,
        percentage: totalExpense > 0 ? (cat.total / totalExpense) * 100 : 0
      })).slice(0, 3);

      setTopCategories(categoriesWithPercentage);

      // Get last 6 months data
      const monthsData: MonthlyData[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthStart = monthDate.toISOString().split('T')[0];
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).toISOString().split('T')[0];
        
        const monthTotals = await database.getTotalsByType(monthStart, monthEnd);
        monthsData.push({
          month: monthDate.toLocaleDateString('vi-VN', { month: 'short' }),
          income: monthTotals.income,
          expense: monthTotals.expense,
          balance: monthTotals.income - monthTotals.expense
        });
      }

      setMonthlyData(monthsData);
    } catch (error) {
      console.error('Error loading finance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = () => {
    Alert.alert('Xuất Dữ Liệu', 'Tính năng xuất dữ liệu sẽ ra mắt sớm!');
    setShowExportModal(false);
  };

  const handleBudgetManagement = () => {
    Alert.alert('Quản Lý Ngân Sách', 'Tính năng quản lý ngân sách sẽ ra mắt sớm!');
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
            Tháng {new Date().toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
          </ThemedText>
          <ThemedText style={styles.balanceText}>
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

      {/* Top Categories */}
      {topCategories.length > 0 && (
        <ThemedView style={styles.categoriesContainer}>
          <ThemedText type="title" style={styles.sectionTitle}>Danh Mục Chi Tiêu Hàng Đầu</ThemedText>
          {topCategories.map((category) => (
            <ThemedView key={category.category} style={styles.categoryItem}>
              <ThemedView style={styles.categoryInfo}>
                <ThemedText style={styles.categoryName}>{category.category}</ThemedText>
                <ThemedText style={styles.categoryAmount}>
                  {formatCurrency(category.total)}
                </ThemedText>
              </ThemedView>
              <ThemedView style={styles.categoryBar}>
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
          ))}
        </ThemedView>
      )}

      {/* Monthly Trends */}
      <ThemedView style={styles.trendsContainer}>
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
      <ThemedView style={styles.toolsContainer}>
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
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
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
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -30,
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
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
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
    backgroundColor: 'white',
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
    backgroundColor: 'white',
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
});
