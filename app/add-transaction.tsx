import React, { useState, useEffect, useRef } from 'react';
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
import { Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { database, getTodayDateString, getUserHouseholds } from '@/lib/database';
import { getPrivacySettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/auth';
import { getCurrentHouseholdId } from '@/lib/family';
import { logDailyProgress } from '@/lib/gamification';
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
  const [isParseable, setIsParseable] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const formatThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  const router = useRouter();
  const params = useLocalSearchParams();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const primaryColor = useThemeColor({ light: '#2563eb', dark: '#6366f1' }, 'tint');
  const chipBg = useThemeColor({ light: '#f5f5f5', dark: '#2a2a2a' }, 'background');
  const textColor = useThemeColor({}, 'text');

  // Load transaction for editing if ID is provided
  useEffect(() => {
    if (params.id) {
      loadTransaction(params.id as string);
    }
  }, [params.id]);

  // Simple VN parseability heuristic: contains a number and optional k/tr/triệu/tỷ
  useEffect(() => {
    const text = formData.description || '';
    const numberLike = /(\+|-)?\s*([\d.,]+)\s*(k|nghìn|ngan|tr|triệu|m|ty|tỷ)?/i;
    setIsParseable(numberLike.test(text));
  }, [formData.description]);

  useEffect(() => {
    if (isParseable) {
      if (!pulseLoop.current) {
        pulseLoop.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.08, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          ])
        );
      }
      pulseLoop.current.start();
    } else {
      if (pulseLoop.current) {
        pulseLoop.current.stop();
        pulseLoop.current = null;
      }
      pulseAnim.setValue(1);
    }
  }, [isParseable, pulseAnim]);

  const inferCategory = (text: string, assumedType: TransactionType): string | null => {
    const t = text.toLowerCase();
    // Loan-related first (overrides type as needed)
    if (/\bcho vay\b/.test(t)) return 'Cho vay';
    if (/\bvay\b/.test(t)) return 'Vay';

    // Income
    if (assumedType === 'income') {
      if (/(lương|thu nhập|bonus|thưởng)/.test(t)) return 'Lương';
    }

    // Expense common mappings
    if (/(cafe|cà phê|an|ăn |uống|trà sữa|quán)/.test(t)) return 'Ăn uống';
    if (/(grab|be |taxi|xăng|xang|xe bus|bus)/.test(t)) return 'Di chuyển';
    if (/(shopee|lazada|tiki)/.test(t)) return 'Mua sắm';
    if (/(điện|nuoc|nước|internet|wifi|cáp|cap|truyen hinh)/.test(t)) return 'Hóa đơn';
    if (/(tiền nhà|thuê nhà|rent)/.test(t)) return 'Nhà ở';
    if (/(bảo hiểm|bao hiem)/.test(t)) return 'Bảo hiểm';
    if (/(bệnh viện|ben h|thuốc|thuoc|clinic)/.test(t)) return 'Sức khỏe';
    if (/(học|hoc|học phí|hoc phi)/.test(t)) return 'Giáo dục';
    if (/(thẻ tín dụng|the tin dung|credit)/.test(t)) return 'Tín dụng';

    return null;
  };

  const parseVoiceText = (input: string) => {
    const text = (input || '').toLowerCase();
    // amount with unit
    const match = text.match(/(\+|-)?\s*([\d.,]+)\s*(k|nghìn|ngan|tr|triệu|m|ty|tỷ)?/i);
    let amountNumber: number | null = null;
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const raw = match[2].replace(/\./g, '').replace(/,/g, '');
      const unit = (match[3] || '').toLowerCase();
      let base = parseFloat(raw);
      if (!isNaN(base)) {
        if (unit === 'k' || unit === 'nghìn' || unit === 'ngan') base *= 1_000;
        else if (unit === 'tr' || unit === 'triệu' || unit === 'm') base *= 1_000_000;
        else if (unit === 'ty' || unit === 'tỷ') base *= 1_000_000_000;
        amountNumber = Math.round(base * sign);
      }
    }

    // type
    let type: TransactionType | null = null;
    if (/^(\s|)*-/.test(text) || /(mua|chi|trả|thanhtoan|tt)/i.test(text)) type = 'expense';
    if (/^(\s|)*\+/.test(text) || /(thu|lương|nhận|bonus|thưởng)/i.test(text)) type = 'income';

    // date
    let date: string | null = null;
    const today = new Date();
    if (/hôm qua|hom qua|yesterday/i.test(text)) {
      const d = new Date();
      d.setDate(today.getDate() - 1);
      date = d.toISOString().split('T')[0];
    } else if (/hôm nay|hom nay|today/i.test(text)) {
      date = today.toISOString().split('T')[0];
    }

    return { amountNumber, type, date, rawText: text };
  };

  const handleParse = () => {
    const { amountNumber, type, date, rawText } = parseVoiceText(formData.description);
    if (amountNumber == null && !type && !date) return;
    setFormData(prev => ({
      ...prev,
      amount: amountNumber != null ? Math.abs(amountNumber).toString() : prev.amount,
      type: type || prev.type,
      date: date || prev.date,
    }));

    // Category suggestion per option B
    const assumedType = (type || formData.type) as TransactionType;
    const suggestion = inferCategory(rawText, assumedType);
    if (suggestion) {
      if (formData.category === 'Khác') {
        setFormData(prev => ({ ...prev, category: suggestion }));
        setSuggestedCategory(null);
      } else {
        setSuggestedCategory(suggestion);
        setShowCategoryPicker(true);
      }
    }
  };

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
      const [privacy, user, householdId] = await Promise.all([getPrivacySettings(), getCurrentUser(), getCurrentHouseholdId()]);

      // Only set household_id if the user is a member of that household; otherwise null to satisfy RLS
      let safeHouseholdId: string | null = null;
      try {
        if (user?.id && householdId) {
          const households = await getUserHouseholds(user.id);
          if (households.some(h => h.id === householdId)) safeHouseholdId = householdId;
        }
      } catch {}

      const transactionData = {
        amount: parseFloat(formData.amount),
        description: formData.description.trim(),
        category: formData.category,
        date: formData.date,
        type: formData.type,
        source: 'manual' as const,
        currency: 'VND',
        is_private: isPrivate || !!privacy.privateMode,
        owner_user_id: user?.id || null,
        household_id: safeHouseholdId,
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

      // Habit streak logging: mark today's progress after the first transaction
      try {
        await logDailyProgress(getTodayDateString());
      } catch {}

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
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      setFormData(prev => ({
        ...prev,
        date: `${y}-${m}-${d}`
      }));
    }
  };

  const handleDueDateChange = (event: any, selectedDate?: Date) => {
    setShowDuePicker(false);
    if (selectedDate) {
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      setLoanDueDate(`${y}-${m}-${d}`);
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
          <ThemedView style={[styles.typeToggle, { borderColor: tintColor + '30', backgroundColor: chipBg }]}>
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
              value={formData.amount.replace(/\./g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              onChangeText={(text) => {
                // Strip separators to store pure digits
                const digits = text.replace(/[^0-9]/g, '');
                setFormData(prev => ({ ...prev, amount: digits }));
              }}
              keyboardType="number-pad"
            />
          </ThemedView>
        </ThemedView>

        {/* Description */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Mô Tả</ThemedText>
          <ThemedView style={[styles.inputContainer, { borderColor: tintColor + '30' }]}>
            <TextInput
              style={[styles.textInput, { color: textColor }]}
              placeholder="Gõ hoặc nhấn nút ghi âm. Ví dụ: “-45k cafe hôm qua”. Nhấn ✨ để tự điền."
              placeholderTextColor={textColor + '60'}
              value={formData.description}
              onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
              multiline
              numberOfLines={3}
            />
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Pressable
                onPress={handleParse}
                disabled={!isParseable}
                style={{
                  marginLeft: 8,
                  opacity: isParseable ? 1 : 0.4,
                }}
                accessibilityLabel="Tự động điền từ mô tả"
              >
                <MaterialIcons name="auto-awesome" size={22} color={tintColor} />
              </Pressable>
            </Animated.View>
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

        {/* Privacy Toggle */}
        <ThemedView style={styles.section}>
          <Pressable
            style={[styles.privacyToggle, { borderColor: tintColor + '30', backgroundColor: chipBg }]}
            onPress={() => setIsPrivate(!isPrivate)}
          >
            <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'transparent' }}>
              <Ionicons name={isPrivate ? "lock-closed" : "lock-open-outline"} size={20} color={isPrivate ? tintColor : textColor + '80'} />
              <ThemedText style={{ fontWeight: '600' }}>Giao dịch riêng tư</ThemedText>
            </ThemedView>
            <ThemedView style={[styles.switch, { backgroundColor: isPrivate ? tintColor : textColor + '30' }]}>
              <ThemedView style={[styles.switchThumb, { transform: [{ translateX: isPrivate ? 20 : 0 }] }]} />
            </ThemedView>
          </Pressable>
          <ThemedText style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Chỉ bạn mới thấy chi tiết giao dịch này. Tổng số vẫn được tính vào báo cáo gia đình.
          </ThemedText>
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
                      (formData.category === category || suggestedCategory === category) && { backgroundColor: tintColor + '20' }
                    ]}
                    onPress={() => {
                      setFormData(prev => ({ ...prev, category }));
                      setShowCategoryPicker(false);
                      // reset loan fields when switching away
                    const willBeLoan = (formData.type === 'income' && category === 'Vay') || (formData.type === 'expense' && category === 'Cho vay');
                    if (!willBeLoan) {
                      setLoanPerson('');
                      setLoanDueDate(null);
                    }
                    }}
                  >
                    <ThemedText style={styles.categoryIcon}>
                      {getCategoryIcon(category)}
                    </ThemedText>
                    <ThemedText style={styles.categoryName}>{category}</ThemedText>
                    {(formData.category === category || suggestedCategory === category) && (
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
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
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
  privacyToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  switch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
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
