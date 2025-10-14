import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, StyleSheet, Pressable, Dimensions, StatusBar, RefreshControl, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CompactTransactionCard } from '@/components/TransactionCard';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, formatCurrency } from '@/lib/database';
import { Transaction, TransactionSummary, CategorySummary } from '@/types/transaction';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const [summary, setSummary] = useState<TransactionSummary>({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    transactionCount: 0
  });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [topCategories, setTopCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');

  // Load data when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      await database.init();

      // Get summary for current month
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

      const totals = await database.getTotalsByType(startOfMonth, endOfMonth);
      const transactions = await database.getTransactions(10); // Get last 10 transactions
      const categories = await database.getTransactionsByCategory('expense');

      // Calculate percentages for categories
      const totalExpense = totals.expense;
      const categoriesWithPercentage = categories.map(cat => ({
        ...cat,
        percentage: totalExpense > 0 ? (cat.total / totalExpense) * 100 : 0
      })).slice(0, 5); // Top 5 categories

      setSummary({
        totalIncome: totals.income,
        totalExpense: totals.expense,
        balance: totals.income - totals.expense,
        transactionCount: transactions.length
      });
      setRecentTransactions(transactions);
      setTopCategories(categoriesWithPercentage);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData();
  }, []);

  if (loading) {
  return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={styles.loadingText}>Loading dashboard...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor }]} 
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[tintColor]} />}
    >
      <StatusBar style="auto" />
      
      {/* Header with Balance */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ThemedView style={styles.headerContent}>
          <ThemedText style={styles.welcomeText}>Current Balance</ThemedText>
          <ThemedText style={styles.balanceText}>
            {formatCurrency(summary.balance)}
          </ThemedText>
          <ThemedText style={styles.subHeaderText}>
            This month • {summary.transactionCount} transactions
          </ThemedText>
        </ThemedView>
      </LinearGradient>

      {/* Income vs Expense Cards */}
      <ThemedView style={styles.cardsContainer}>
        <ThemedView style={styles.cardRow}>
          <ThemedView style={styles.summaryCard}>
            <ThemedView style={[styles.summaryIconContainer, { backgroundColor: '#22c55e' }]}>
              <Ionicons name="arrow-up" size={24} color="white" />
            </ThemedView>
            <ThemedText style={styles.summaryLabel}>Income</ThemedText>
            <ThemedText style={[styles.summaryAmount, { color: '#22c55e' }]}>
              {formatCurrency(summary.totalIncome)}
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.summaryCard}>
            <ThemedView style={[styles.summaryIconContainer, { backgroundColor: '#ef4444' }]}>
              <Ionicons name="arrow-down" size={24} color="white" />
            </ThemedView>
            <ThemedText style={styles.summaryLabel}>Expenses</ThemedText>
            <ThemedText style={[styles.summaryAmount, { color: '#ef4444' }]}>
              {formatCurrency(summary.totalExpense)}
        </ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {/* Quick Actions */}
      <ThemedView style={styles.actionsContainer}>
        <ThemedText type="title" style={styles.sectionTitle}>Quick Actions</ThemedText>
        
        <ThemedView style={styles.quickActionsRow}>
          <Pressable 
            style={[styles.quickActionButton, { backgroundColor: tintColor }]}
            onPress={() => router.push('/camera')}
          >
            <Ionicons name="camera" size={24} color="white" />
            <ThemedText style={styles.quickActionText}>Scan Statement</ThemedText>
          </Pressable>

          <Pressable 
            style={styles.quickActionButton}
            onPress={() => router.push('/add-transaction')}
          >
            <Ionicons name="add-circle" size={24} color={tintColor} />
            <ThemedText style={[styles.quickActionText, { color: tintColor }]}>Add Transaction</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.quickActionsRow}>
          <Pressable 
            style={styles.quickActionButton}
            onPress={() => router.push('/transactions')}
          >
            <Ionicons name="list" size={24} color={tintColor} />
            <ThemedText style={[styles.quickActionText, { color: tintColor }]}>View All</ThemedText>
          </Pressable>

          <Pressable style={styles.quickActionButton}>
            <Ionicons name="stats-chart" size={24} color={tintColor} />
            <ThemedText style={[styles.quickActionText, { color: tintColor }]}>Analytics</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>

      {/* Top Categories */}
      {topCategories.length > 0 && (
        <ThemedView style={styles.categoriesContainer}>
          <ThemedText type="title" style={styles.sectionTitle}>Top Categories</ThemedText>
          {topCategories.map((category, index) => (
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

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <ThemedView style={styles.recentContainer}>
          <ThemedView style={styles.recentHeader}>
            <ThemedText type="title" style={styles.sectionTitle}>Recent Transactions</ThemedText>
            <Pressable onPress={() => router.push('/transactions')}>
              <ThemedText style={[styles.viewAllText, { color: tintColor }]}>View All</ThemedText>
            </Pressable>
          </ThemedView>
          
          <ThemedView style={styles.recentList}>
            {recentTransactions.slice(0, 5).map((transaction) => (
              <CompactTransactionCard key={transaction.id} transaction={transaction} />
            ))}
          </ThemedView>
        </ThemedView>
      )}

      {/* Empty State */}
      {summary.transactionCount === 0 && (
        <ThemedView style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={64} color={tintColor + '60'} />
          <ThemedText style={styles.emptyTitle}>Start Tracking Your Finances</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Scan a bank statement or add your first transaction to get started
          </ThemedText>
          <Pressable 
            style={[styles.emptyButton, { backgroundColor: tintColor }]}
            onPress={() => router.push('/camera')}
          >
            <Ionicons name="camera" size={20} color="white" />
            <ThemedText style={styles.emptyButtonText}>Scan Statement</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      <ThemedView style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    opacity: 0.7,
  },
  headerGradient: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  headerContent: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 8,
  },
  balanceText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  subHeaderText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  cardsContainer: {
    padding: 20,
    marginTop: -30,
    backgroundColor: 'transparent',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  summaryCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginHorizontal: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    alignItems: 'center',
  },
  summaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionsContainer: {
    padding: 20,
    backgroundColor: 'transparent',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    backgroundColor: 'transparent',
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  categoriesContainer: {
    padding: 20,
    backgroundColor: 'transparent',
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryAmount: {
    fontSize: 14,
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
    minWidth: 40,
    textAlign: 'right',
  },
  recentContainer: {
    padding: 20,
    backgroundColor: 'transparent',
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: 'transparent',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recentList: {
    backgroundColor: 'white',
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    backgroundColor: 'transparent',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  emptyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  bottomSpacer: {
    height: 50,
    backgroundColor: 'transparent',
  },
});
