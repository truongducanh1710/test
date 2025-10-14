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
  
  const router = useRouter();
  const params = useLocalSearchParams();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');

  // Load transaction for editing if ID is provided
  useEffect(() => {
    if (params.id) {
      loadTransaction(parseInt(params.id as string));
    }
  }, [params.id]);

  const loadTransaction = async (id: number) => {
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
      }
    } catch (error) {
      console.error('Error loading transaction:', error);
      Alert.alert('Error', 'Failed to load transaction for editing.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const validationError = validateTransaction(formData);
    if (validationError) {
      Alert.alert('Validation Error', validationError);
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

      if (isEditing && params.id) {
        await database.updateTransaction(parseInt(params.id as string), transactionData);
        Alert.alert('Success', 'Transaction updated successfully!');
      } else {
        await database.addTransaction(transactionData);
        Alert.alert('Success', 'Transaction added successfully!');
      }

      router.back();
    } catch (error) {
      console.error('Error saving transaction:', error);
      Alert.alert('Error', 'Failed to save transaction. Please try again.');
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

  const toggleTransactionType = () => {
    const newType: TransactionType = formData.type === 'expense' ? 'income' : 'expense';
    setFormData(prev => ({
      ...prev,
      type: newType,
      category: 'Khác' // Reset category when type changes
    }));
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
          {isEditing ? 'Loading transaction...' : 'Saving transaction...'}
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
            {isEditing ? 'Edit Transaction' : 'Add Transaction'}
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
          <ThemedText style={styles.sectionTitle}>Transaction Type</ThemedText>
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
                Expense
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
                Income
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {/* Amount */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Amount (VND)</ThemedText>
          <ThemedView style={[styles.inputContainer, { borderColor: tintColor + '30' }]}>
            <ThemedText style={styles.currencySymbol}>₫</ThemedText>
            <TextInput
              style={[styles.amountInput, { color: useThemeColor({}, 'text') }]}
              placeholder="0"
              placeholderTextColor={useThemeColor({}, 'text') + '60'}
              value={formData.amount}
              onChangeText={(text) => {
                // Only allow numbers and decimal point
                const numericText = text.replace(/[^0-9.]/g, '');
                setFormData(prev => ({ ...prev, amount: numericText }));
              }}
              keyboardType="numeric"
              fontSize={24}
              fontWeight="bold"
            />
          </ThemedView>
        </ThemedView>

        {/* Description */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Description</ThemedText>
          <ThemedView style={[styles.inputContainer, { borderColor: tintColor + '30' }]}>
            <TextInput
              style={[styles.textInput, { color: useThemeColor({}, 'text') }]}
              placeholder="Enter transaction description"
              placeholderTextColor={useThemeColor({}, 'text') + '60'}
              value={formData.description}
              onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
              multiline
              numberOfLines={3}
            />
          </ThemedView>
        </ThemedView>

        {/* Category */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Category</ThemedText>
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

        {/* Date */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Date</ThemedText>
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
                <ThemedText style={styles.modalTitle}>Select Category</ThemedText>
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

        <ThemedView style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Actions */}
      <ThemedView style={styles.bottomActions}>
        <Pressable 
          style={[styles.cancelButton, { borderColor: tintColor }]}
          onPress={handleCancel}
        >
          <ThemedText style={[styles.cancelButtonText, { color: tintColor }]}>
            Cancel
          </ThemedText>
        </Pressable>
        <Pressable 
          style={[styles.saveButton, { backgroundColor: tintColor }]}
          onPress={handleSave}
          disabled={loading}
        >
          <ThemedText style={styles.saveButtonText}>
            {isEditing ? 'Update' : 'Save'}
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
