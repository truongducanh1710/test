import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  StyleSheet, 
  Pressable, 
  Dimensions, 
  Alert, 
  SectionList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionCard } from '@/components/TransactionCard';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database } from '@/lib/database';
import { 
  Transaction, 
  TransactionFilters, 
  TransactionType, 
  EXPENSE_CATEGORIES, 
  INCOME_CATEGORIES,
  SortOptions,
  SortField,
  SortOrder
} from '@/types/transaction';

const { width } = Dimensions.get('window');

type Section = { title: string; data: Transaction[] };

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [sortOptions, setSortOptions] = useState<SortOptions>({ field: 'date', order: 'desc' });
  const [showFilters, setShowFilters] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'from' | 'to'>('from');
  
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const primaryColor = useThemeColor({ light: '#2563eb', dark: '#6366f1' }, 'tint');
  const textColor = useThemeColor({}, 'text');

  // Initialize database and load transactions
  useEffect(() => {
    initializeData();
  }, []);

  // Apply filters and sorting when they change
  useEffect(() => {
    loadTransactions();
  }, [filters, sortOptions, searchTerm]);

  const initializeData = async () => {
    try {
      await database.init();
      await loadTransactions();
    } catch (error) {
      console.error('Error initializing data:', error);
      Alert.alert('Error', 'Failed to load transactions. Please try again.');
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      let result: Transaction[] = [];

      if (searchTerm) {
        result = await database.searchTransactions(searchTerm);
      } else {
        result = await database.getTransactions();
      }

      // Apply filters
      if (filters.type) {
        result = result.filter(t => t.type === filters.type);
      }
      if (filters.category) {
        result = result.filter(t => t.category === filters.category);
      }
      if (filters.source) {
        result = result.filter(t => t.source === filters.source);
      }
      if (filters.dateFrom) {
        result = result.filter(t => t.date >= filters.dateFrom!);
      }
      if (filters.dateTo) {
        result = result.filter(t => t.date <= filters.dateTo!);
      }
      if (filters.minAmount !== undefined) {
        result = result.filter(t => t.amount >= filters.minAmount!);
      }
      if (filters.maxAmount !== undefined) {
        result = result.filter(t => t.amount <= filters.maxAmount!);
      }

      // Apply sorting
      result.sort((a, b) => {
        let aValue: any, bValue: any;
        
        switch (sortOptions.field) {
          case 'date':
            aValue = new Date(a.date);
            bValue = new Date(b.date);
            break;
          case 'amount':
            aValue = a.amount;
            bValue = b.amount;
            break;
          case 'description':
            aValue = a.description.toLowerCase();
            bValue = b.description.toLowerCase();
            break;
          case 'category':
            aValue = a.category.toLowerCase();
            bValue = b.category.toLowerCase();
            break;
          default:
            aValue = a.date;
            bValue = b.date;
        }

        if (sortOptions.order === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      setTransactions(result);
    } catch (error) {
      console.error('Error loading transactions:', error);
      Alert.alert('Error', 'Failed to load transactions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTransactions();
  }, []);

  const handleTransactionPress = (transaction: Transaction) => {
    if (isSelectionMode) {
      toggleTransactionSelection(transaction.id!);
    } else {
      router.push(`/add-transaction?id=${transaction.id}`);
    }
  };

  const handleTransactionLongPress = (transaction: Transaction) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedTransactions(new Set([transaction.id!]));
    } else {
      handleDeleteTransaction(transaction);
    }
  };

  const toggleTransactionSelection = (id: string) => {
    const newSelection = new Set(selectedTransactions);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedTransactions(newSelection);
    
    if (newSelection.size === 0) {
      setIsSelectionMode(false);
    }
  };


  const selectAllTransactions = () => {
    const allIds = new Set(transactions.map(t => t.id!.toString()));
    setSelectedTransactions(allIds);
  };

  const deselectAllTransactions = () => {
    setSelectedTransactions(new Set());
    setIsSelectionMode(false);
  };

  const handleDeleteTransaction = async (transaction: Transaction) => {
    Alert.alert(
      'Xác nhận xóa',
      `Bạn có chắc chắn muốn xóa giao dịch "${transaction.description}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa', style: 'destructive', onPress: async () => {
          try {
            await database.deleteTransaction(transaction.id!);
            await loadTransactions();
            Alert.alert('Thành công', 'Đã xóa giao dịch');
          } catch (error) {
            console.error('Error deleting transaction:', error);
            Alert.alert('Lỗi', 'Không thể xóa giao dịch');
          }
        }}
      ]
    );
  };

  const handleBulkDelete = () => {
    Alert.alert(
      'Xác nhận xóa',
      `Bạn có chắc chắn muốn xóa ${selectedTransactions.size} giao dịch đã chọn?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa', style: 'destructive', onPress: async () => {
          try {
            for (const id of selectedTransactions) {
              await database.deleteTransaction(id);
            }
            await loadTransactions();
            setSelectedTransactions(new Set());
            setIsSelectionMode(false);
            Alert.alert('Thành công', `Đã xóa ${selectedTransactions.size} giao dịch`);
          } catch (error) {
            console.error('Error deleting transactions:', error);
            Alert.alert('Lỗi', 'Không thể xóa các giao dịch');
          }
        }}
      ]
    );
  };

  const applyDateFilter = (field: 'from' | 'to', date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    setFilters(prev => ({
      ...prev,
      [field === 'from' ? 'dateFrom' : 'dateTo']: dateString
    }));
  };

  const clearDateFilter = (field: 'from' | 'to') => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[field === 'from' ? 'dateFrom' : 'dateTo'];
      return newFilters;
    });
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
    setSortOptions({ field: 'date', order: 'desc' });
  };

  const getFilteredCount = () => {
    const filterCount = Object.values(filters).filter(v => v !== undefined && v !== '').length;
    return filterCount + (searchTerm ? 1 : 0);
  };

  const formatSectionTitle = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const ymd = (dt: Date) => dt.toISOString().slice(0,10);
    const title = (() => {
      if (ymd(d) === ymd(today)) return 'Hôm nay';
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (ymd(d) === ymd(yesterday)) return 'Hôm qua';
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    })();
    return title;
  };

  const sections: Section[] = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const key = new Date(t.date).toISOString().slice(0,10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    const sortedKeys = Array.from(groups.keys()).sort((a,b) => (a > b ? -1 : 1));
    return sortedKeys.map(k => ({ title: formatSectionTitle(k), data: groups.get(k)!.sort((a,b) => (a.date < b.date ? 1 : -1)) }));
  }, [transactions]);

  const renderLeftActions = (item: Transaction) => (_progress: any, _dragX: any) => (
    <Pressable
      style={[styles.leftAction, { backgroundColor: '#ef4444' }]}
      onPress={() => handleDeleteTransaction(item)}
    >
      <Ionicons name="trash" size={24} color="white" />
      <ThemedText style={styles.leftActionText}>Xóa</ThemedText>
    </Pressable>
  );

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isSelected = selectedTransactions.has(item.id!.toString());
    
    return (
      <Swipeable renderLeftActions={renderLeftActions(item)} overshootLeft={false}>
        <ThemedView style={[styles.transactionRow, isSelected && styles.selectedTransactionRow]}>
          {isSelectionMode && (
            <Pressable 
              style={styles.selectionCheckbox}
              onPress={() => toggleTransactionSelection(item.id!)}
            >
              <Ionicons 
                name={isSelected ? 'checkbox' : 'square-outline'} 
                size={24} 
                color={isSelected ? tintColor : '#666'} 
              />
            </Pressable>
          )}
          <ThemedView style={styles.transactionCardWrapper}>
            <TransactionCard
              transaction={item}
              onPress={handleTransactionPress}
              onLongPress={handleTransactionLongPress}
              hideDate
            />
          </ThemedView>
        </ThemedView>
      </Swipeable>
    );
  };

  const renderHeader = () => (
    <ThemedView style={styles.header}>
      <LinearGradient
        colors={isSelectionMode ? ['#ef4444', '#dc2626'] : ['#667eea', '#764ba2']}
        style={styles.headerGradient}
      >
        <ThemedView style={styles.headerContent}>
          <Pressable style={styles.backButton} onPress={() => {
            if (isSelectionMode) {
              deselectAllTransactions();
            } else {
              router.back();
            }
          }}>
            <Ionicons name={isSelectionMode ? "close" : "arrow-back"} size={24} color="white" />
          </Pressable>
          
          <ThemedText style={styles.headerTitle}>
            {isSelectionMode ? `${selectedTransactions.size} đã chọn` : 'Giao Dịch'}
          </ThemedText>
          
          {isSelectionMode ? (
            <ThemedView style={styles.selectionActions}>
              <Pressable style={styles.headerAction} onPress={selectAllTransactions}>
                <Ionicons name="checkmark-done" size={24} color="white" />
              </Pressable>
              <Pressable style={styles.headerAction} onPress={handleBulkDelete}>
                <Ionicons name="trash" size={24} color="white" />
              </Pressable>
            </ThemedView>
          ) : (
            <Pressable style={[styles.headerButton, { backgroundColor: primaryColor }]} onPress={() => router.push('/camera')}>
              <Ionicons name="camera" size={24} color="white" />
            </Pressable>
          )}
        </ThemedView>
      </LinearGradient>

      {!isSelectionMode && (
        <>
          {/* Search and Filters */}
          <ThemedView style={styles.searchContainer}>
            <ThemedView style={[styles.searchBox, { borderColor: tintColor + '30' }]}>
              <Ionicons name="search" size={20} color={tintColor} />
              <TextInput
                style={[styles.searchInput, { color: textColor }]}
                placeholder="Tìm kiếm giao dịch..."
                placeholderTextColor={textColor + '60'}
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
              {searchTerm ? (
                <Pressable onPress={() => setSearchTerm('')}>
                  <Ionicons name="close-circle" size={20} color={tintColor} />
                </Pressable>
              ) : null}
            </ThemedView>

            <Pressable 
              style={[styles.filterButton, { backgroundColor: tintColor }]} 
              onPress={() => setShowFilters(true)}
            >
              <Ionicons name="filter" size={20} color="white" />
              {getFilteredCount() > 0 && (
                <ThemedView style={styles.filterBadge}>
                  <ThemedText style={styles.filterBadgeText}>{getFilteredCount()}</ThemedText>
                </ThemedView>
              )}
            </Pressable>
          </ThemedView>

          {/* Quick Stats */}
          <ThemedView style={styles.statsRow}>
            <ThemedText style={styles.transactionCount}>
              {transactions.length} giao dịch
            </ThemedText>
            {getFilteredCount() > 0 && (
              <Pressable style={styles.clearFiltersButton} onPress={clearFilters}>
                <ThemedText style={[styles.clearFiltersText, { color: tintColor }]}>
                  Xóa bộ lọc
                </ThemedText>
              </Pressable>
            )}
          </ThemedView>
        </>
      )}
    </ThemedView>
  );

  const renderEmptyState = () => (
    <ThemedView style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={64} color={tintColor + '60'} />
      <ThemedText style={styles.emptyTitle}>Không Tìm Thấy Giao Dịch</ThemedText>
      <ThemedText style={styles.emptySubtitle}>
        {searchTerm || getFilteredCount() > 0 
          ? 'Try adjusting your search or filters'
          : 'Start by scanning a bank statement or adding a transaction manually'
        }
      </ThemedText>
      <Pressable 
        style={[styles.emptyButton, { backgroundColor: tintColor }]}
        onPress={() => router.push('/camera')}
      >
        <Ionicons name="camera" size={20} color="white" />
        <ThemedText style={styles.emptyButtonText}>Quét Sao Kê</ThemedText>
      </Pressable>
    </ThemedView>
  );

  if (loading && !refreshing) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={styles.loadingText}>Đang tải giao dịch...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemedView style={[styles.container, { backgroundColor }]}> 
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id || ''}
        renderItem={renderTransaction}
        renderSectionHeader={({ section }) => (
          <ThemedView style={styles.sectionHeader}>
            <ThemedText style={styles.sectionHeaderText}>{section.title}</ThemedText>
          </ThemedView>
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[tintColor]} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={transactions.length === 0 ? styles.emptyContainer : undefined}
        stickySectionHeadersEnabled={false}
      />

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <ThemedView style={[styles.modalContainer, { backgroundColor }]}>
          <ThemedView style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Lọc & Sắp Xếp</ThemedText>
            <Pressable style={styles.modalCloseButton} onPress={() => setShowFilters(false)}>
              <Ionicons name="close" size={24} color={tintColor} />
            </Pressable>
          </ThemedView>
          
          {/* Filter options would go here */}
          <ThemedText style={styles.comingSoon}>Bộ lọc nâng cao sắp ra mắt!</ThemedText>
          
          <Pressable 
            style={[styles.modalButton, { backgroundColor: tintColor }]}
            onPress={() => setShowFilters(false)}
          >
            <ThemedText style={styles.modalButtonText}>Áp Dụng Bộ Lọc</ThemedText>
          </Pressable>
        </ThemedView>
      </Modal>

      {/* Floating Add Button */}
      <Pressable 
        style={[styles.fab, { backgroundColor: primaryColor }]}
        onPress={() => router.push('/add-transaction')}
      >
        <Ionicons name="add" size={24} color="white" />
      </Pressable>
    </ThemedView>
    </GestureHandlerRootView>
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
  header: {
    backgroundColor: 'transparent',
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'transparent',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  filterButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: 'transparent',
  },
  transactionCount: {
    fontSize: 14,
    opacity: 0.7,
  },
  clearFiltersButton: {
    padding: 5,
  },
  clearFiltersText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
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
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalContainer: {
    flex: 1,
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: 'transparent',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 5,
  },
  comingSoon: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    opacity: 0.7,
    marginTop: 50,
  },
  modalButton: {
    margin: 20,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  headerAction: {
    padding: 8,
    marginLeft: 8,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  selectedTransactionRow: {
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  selectionCheckbox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  transactionCardWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  leftAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    marginVertical: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  leftActionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
});
