import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Pressable, 
  TextInput, 
  ScrollView, 
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database } from '@/lib/database';
import { 
  TransactionFormData, 
  TransactionType, 
  EXPENSE_CATEGORIES, 
  INCOME_CATEGORIES,
  DEFAULT_TRANSACTION,
  validateTransaction,
  getCategoryIcon
} from '@/types/transaction';

export default function AddTransactionScreen() {
  const [formData, setFormData] = useState<TransactionFormData>(DEFAULT_TRANSACTION);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loanPerson, setLoanPerson] = useState('');
  const [loanDueDate, setLoanDueDate] = useState<string | null>(null);
  const [showDuePicker, setShowDuePicker] = useState(false);
  
  const router = useRouter();
  const params = useLocalSearchParams();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const primaryColor = useThemeColor({ light: '#2563eb', dark: '#6366f1' }, 'tint');
  const textColor = useThemeColor({}, 'text');

  // Load transaction for editing if ID is provided
  useEffect(() => {
    if (params.id) {
      loadTransaction(params.id as string);
    }
  }, [params.id]);

  const loadTransaction = async (id: string) => {
    try {
      setLoading(true);
      await database.init();
      const transaction = await database.getTransactionById(id);
      
      if (transaction) {
        setFormData({
          amount: transaction.amount.toString(),
          description: transaction.description,
          category: transaction.category,
          date: transaction.date,
          type: transaction.type,
        });
        setIsEditing(true);
      } else {
        Alert.alert('Lỗi', 'Không tìm thấy giao dịch này.');
        router.back();
      }
    } catch (error) {
      console.error('Error loading transaction:', error);
      Alert.alert('Lỗi', 'Không thể tải thông tin giao dịch để chỉnh sửa.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const isLoanCategory = () => {
    return (formData.type === 'income' && formData.category === 'Vay') || (formData.type === 'expense' && formData.category === 'Cho vay');
  };

  const handleSave = async () => {
    const validationError = validateTransaction(formData);
    if (validationError) {
      Alert.alert('Lỗi Xác Thực', validationError);
      return;
    }

    if (isLoanCategory() && !loanPerson.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập Người liên quan cho khoản vay/cho vay');
      return;
    }

    try {
      setLoading(true);
      await database.init();

      const transactionData = {
        amount: parseFloat(formData.amount),
        description: formData.description.trim(),
        category: formData.category,
        date: formData.date,
        type: formData.type,
        source: 'manual' as const,
      };

      let newId: string | undefined;
      if (isEditing && params.id) {
        await database.updateTransaction(params.id as string, transactionData);
        newId = params.id as string;
        Alert.alert('Thành Công', 'Giao dịch đã được cập nhật!');
      } else {
        newId = await database.addTransaction(transactionData);
        Alert.alert('Thành Công', 'Giao dịch đã được thêm!');
      }

      // Create loan record if applicable (only when creating new or editing category accordingly)
      if (newId && isLoanCategory()) {
        await database.addLoanForTransaction({
          transaction_id: newId,
          kind: formData.category === 'Vay' ? 'borrow' : 'lend',
          person: loanPerson.trim(),
          due_date: loanDueDate || null,
        });
      }

      router.back();
    } catch (error) {
      console.error('Error saving transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Không thể lưu giao dịch. Vui lòng thử lại.';
      Alert.alert('Lỗi', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFormData(prev => ({
        ...prev,
        date: selectedDate.toISOString().split('T')[0]
      }));
    }
  };

  const handleDueDateChange = (event: any, selectedDate?: Date) => {
    setShowDuePicker(false);
    if (selectedDate) {
      setLoanDueDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const toggleTransactionType = () => {
    const newType: TransactionType = formData.type === 'expense' ? 'income' : 'expense';
    setFormData(prev => ({
      ...prev,
      type: newType,
      category: 'Khác' // Reset category when type changes
    }));
    setLoanPerson('');
    setLoanDueDate(null);
  };

  const getCategoriesForType = () => {
    return formData.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={styles.loadingText}>
          {isEditing ? 'Đang tải giao dịch...' : 'Đang lưu giao dịch...'}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
      >
        <ThemedView style={styles.headerContent}>
          <Pressable style={styles.headerButton} onPress={handleCancel}>
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>
            {isEditing ? 'Chỉnh Sửa Giao Dịch' : 'Thêm Giao Dịch'}
          </ThemedText>
          <Pressable 
            style={[styles.headerButton, { opacity: loading ? 0.5 : 1 }]} 
            onPress={handleSave}
            disabled={loading}
          >
            <Ionicons name="checkmark" size={24} color="white" />
          </Pressable>
        </ThemedView>
      </LinearGradient>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* Transaction Type Toggle */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Loại Giao Dịch</ThemedText>
          <ThemedView style={styles.typeToggle}>
            <Pressable 
              style={[
                styles.typeButton, 
                formData.type === 'expense' && [styles.typeButtonActive, { backgroundColor: '#ef4444' }]
              ]}
              onPress={() => formData.type !== 'expense' && toggleTransactionType()}
            >
              <Ionicons 
                name="arrow-down" 
                size={20} 
                color={formData.type === 'expense' ? 'white' : '#ef4444'} 
              />
              <ThemedText 
                style={[
                  styles.typeButtonText, 
                  formData.type === 'expense' && styles.typeButtonTextActive
                ]}
              >
                Chi Tiêu
              </ThemedText>
            </Pressable>
            <Pressable 
              style={[
                styles.typeButton, 
                formData.type === 'income' && [styles.typeButtonActive, { backgroundColor: '#22c55e' }]
              ]}
              onPress={() => formData.type !== 'income' && toggleTransactionType()}
            >
              <Ionicons 
                name="arrow-up" 
                size={20} 
                color={formData.type === 'income' ? 'white' : '#22c55e'} 
              />
              <ThemedText 
                style={[
                  styles.typeButtonText, 
                  formData.type === 'income' && styles.typeButtonTextActive
                ]}
              >
                Thu Nhập
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {/* Amount */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Số Tiền (VNĐ)</ThemedText>
          <ThemedView style={[styles.inputContainer, { borderColor: tintColor + '30' }]}>
            <ThemedText style={styles.currencySymbol}>₫</ThemedText>
            <TextInput
              style={[styles.amountInput, { color: textColor }]}
              placeholder="0"
              placeholderTextColor={textColor + '60'}
              value={formData.amount}
              onChangeText={(text) => {
                // Only allow numbers and decimal point
                const numericText = text.replace(/[^0-9.]/g, '');
                setFormData(prev => ({ ...prev, amount: numericText }));
              }}
              keyboardType="numeric"
            />
          </ThemedView>
        </ThemedView>

        {/* Description */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Mô Tả</ThemedText>
          <ThemedView style={[styles.inputContainer, { borderColor: tintColor + '30' }]}>
            <TextInput
              style={[styles.textInput, { color: textColor }]}
              placeholder="Nhập mô tả giao dịch"
              placeholderTextColor={textColor + '60'}
              value={formData.description}
              onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
              multiline
              numberOfLines={3}
            />
          </ThemedView>
        </ThemedView>

        {/* Category */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Danh Mục</ThemedText>
          <Pressable 
            style={[styles.inputContainer, styles.pickerButton, { borderColor: tintColor + '30' }]}
            onPress={() => setShowCategoryPicker(true)}
          >
            <ThemedText style={styles.categoryIcon}>
              {getCategoryIcon(formData.category)}
            </ThemedText>
            <ThemedText style={styles.pickerText}>{formData.category}</ThemedText>
            <Ionicons name="chevron-down" size={20} color={tintColor} />
          </Pressable>
        </ThemedView>

        {/* Loan-specific fields */}
        {isLoanCategory() && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Thông tin vay/cho vay</ThemedText>
            <ThemedView style={[styles.inputContainer, { borderColor: tintColor + '30' }]}>
              <Ionicons name="person-outline" size={20} color={tintColor} />
              <TextInput
                style={[styles.pickerText, { color: textColor }]}
                placeholder={formData.category === 'Vay' ? 'Vay của ai?' : 'Cho ai vay?'}
                placeholderTextColor={textColor + '60'}
                value={loanPerson}
                onChangeText={setLoanPerson}
              />
            </ThemedView>
            <Pressable 
              style={[styles.inputContainer, styles.pickerButton, { borderColor: tintColor + '30', marginTop: 12 }]}
              onPress={() => setShowDuePicker(true)}
            >
              <Ionicons name="time-outline" size={20} color={tintColor} />
              <ThemedText style={styles.pickerText}>{loanDueDate ? formatDate(loanDueDate) : 'Ngày đến hạn (tùy chọn)'}</ThemedText>
              <Ionicons name="chevron-down" size={20} color={tintColor} />
            </Pressable>
          </ThemedView>
        )}

        {/* Date */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Ngày</ThemedText>
          <Pressable 
            style={[styles.inputContainer, styles.pickerButton, { borderColor: tintColor + '30' }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar" size={20} color={tintColor} />
            <ThemedText style={styles.pickerText}>{formatDate(formData.date)}</ThemedText>
            <Ionicons name="chevron-down" size={20} color={tintColor} />
          </Pressable>
        </ThemedView>

        {/* Category Picker Modal */}
        {showCategoryPicker && (
          <ThemedView style={styles.modal}>
            <ThemedView style={[styles.modalContent, { backgroundColor }]}> 
              <ThemedView style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Chọn danh mục</ThemedText>
                <Pressable onPress={() => setShowCategoryPicker(false)}>
                  <Ionicons name="close" size={24} color={tintColor} />
                </Pressable>
              </ThemedView>
              <ScrollView style={styles.categoryList}>
                {getCategoriesForType().map((category) => (
                  <Pressable
                    key={category}
                    style={[
                      styles.categoryItem,
                      formData.category === category && { backgroundColor: tintColor + '20' }
                    ]}
                    onPress={() => {
                      setFormData(prev => ({ ...prev, category }));
                      setShowCategoryPicker(false);
                      // reset loan fields when switching away
                      if (!((prev) => (formData.type === 'income' && category === 'Vay') || (formData.type === 'expense' && category === 'Cho vay'))) {
                        setLoanPerson('');
                        setLoanDueDate(null);
                      }
                    }}
                  >
                    <ThemedText style={styles.categoryIcon}>
                      {getCategoryIcon(category)}
                    </ThemedText>
                    <ThemedText style={styles.categoryName}>{category}</ThemedText>
                    {formData.category === category && (
                      <Ionicons name="checkmark" size={20} color={tintColor} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </ThemedView>
          </ThemedView>
        )}

        {/* Date Picker */}
        {showDatePicker && (
          <DateTimePicker
            value={new Date(formData.date)}
            mode="date"
            display="default"
            onChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Due Date Picker */}
        {showDuePicker && (
          <DateTimePicker
            value={loanDueDate ? new Date(loanDueDate) : new Date()}
            mode="date"
            display="default"
            onChange={handleDueDateChange}
          />
        )}

        <ThemedView style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Actions */}
      <ThemedView style={styles.bottomActions}>
        <Pressable 
          style={[styles.cancelButton, { borderColor: tintColor }]}
          onPress={handleCancel}
        >
          <ThemedText style={[styles.cancelButtonText, { color: tintColor }]}> 
            Hủy
          </ThemedText>
        </Pressable>
        <Pressable 
          style={[styles.saveButton, { backgroundColor: primaryColor }]}
          onPress={handleSave}
          disabled={loading}
        >
          <ThemedText style={styles.saveButtonText}>
            {isEditing ? 'Cập Nhật' : 'Lưu'}
          </ThemedText>
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
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
  headerButton: {
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
  form: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 25,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    opacity: 0.8,
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  typeButtonActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  typeButtonTextActive: {
    color: 'white',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 10,
    opacity: 0.6,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  pickerButton: {
    justifyContent: 'space-between',
  },
  pickerText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 10,
  },
  categoryIcon: {
    fontSize: 20,
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '70%',
    borderRadius: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: 'transparent',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  categoryList: {
    maxHeight: 400,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: 'transparent',
  },
  categoryName: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  bottomSpacer: {
    height: 100,
    backgroundColor: 'transparent',
  },
  bottomActions: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: 'transparent',
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginLeft: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
