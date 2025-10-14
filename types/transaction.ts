// Import types
import type { Transaction } from '../lib/database';
import type { AIExtractedTransaction } from '../lib/openai';

// Re-export database types for consistency  
export type { Transaction } from '../lib/database';
export type { AIExtractedTransaction } from '../lib/openai';

// Additional types for the app
export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'manual' | 'ai';

export interface TransactionFormData {
  amount: string; // String for form input, will be converted to number
  description: string;
  category: string;
  date: string;
  type: TransactionType;
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  transactionCount: number;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
  percentage: number; // Percentage of total spending/income
}

export interface MonthlyData {
  month: string; // YYYY-MM format
  income: number;
  expense: number;
  balance: number;
  transactionCount: number;
}

// For chart/visualization components
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

// Filter options for transaction list
export interface TransactionFilters {
  type?: TransactionType;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  source?: TransactionSource;
  minAmount?: number;
  maxAmount?: number;
  searchTerm?: string;
}

// Sort options
export type SortField = 'date' | 'amount' | 'description' | 'category';
export type SortOrder = 'asc' | 'desc';

export interface SortOptions {
  field: SortField;
  order: SortOrder;
}

// Camera/Image processing states
export type CameraState = 'idle' | 'taking_photo' | 'processing' | 'success' | 'error';

export interface ProcessingResult {
  success: boolean;
  transactions: AIExtractedTransaction[];
  error?: string;
  processingTime?: number;
}

// App state types
export interface AppError {
  message: string;
  code?: string;
  details?: any;
}

// Predefined categories for Vietnamese users
export const EXPENSE_CATEGORIES = [
  'Ăn uống',
  'Di chuyển', 
  'Xăng xe',
  'Mua sắm',
  'Y tế',
  'Giải trí',
  'Học tập',
  'Tiền điện',
  'Tiền nước',
  'Internet',
  'Điện thoại',
  'Nhà ở',
  'Bảo hiểm',
  'Khác'
] as const;

export const INCOME_CATEGORIES = [
  'Lương',
  'Thưởng',
  'Làm thêm',
  'Bán hàng',
  'Đầu tư',
  'Quà tặng',
  'Khác'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export type IncomeCategory = typeof INCOME_CATEGORIES[number];

// Default values
export const DEFAULT_TRANSACTION: TransactionFormData = {
  amount: '',
  description: '',
  category: 'Khác',
  date: new Date().toISOString().split('T')[0],
  type: 'expense'
};

// Validation functions
export const validateTransaction = (transaction: TransactionFormData): string | null => {
  if (!transaction.amount || parseFloat(transaction.amount) <= 0) {
    return 'Số tiền phải lớn hơn 0';
  }
  
  if (!transaction.description.trim()) {
    return 'Vui lòng nhập mô tả';
  }
  
  if (!transaction.category.trim()) {
    return 'Vui lòng chọn danh mục';
  }
  
  if (!transaction.date) {
    return 'Vui lòng chọn ngày';
  }
  
  const date = new Date(transaction.date);
  if (isNaN(date.getTime())) {
    return 'Ngày không hợp lệ';
  }
  
  return null;
};

// Utility functions
export const formatTransactionAmount = (amount: number, type: TransactionType): string => {
  const formatted = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
  
  return type === 'expense' ? `-${formatted}` : `+${formatted}`;
};

export const getTransactionColor = (type: TransactionType): string => {
  return type === 'expense' ? '#ef4444' : '#22c55e'; // red for expense, green for income
};

export const getCategoryIcon = (category: string): string => {
  const iconMap: { [key: string]: string } = {
    'Ăn uống': '🍽️',
    'Di chuyển': '🚗',
    'Xăng xe': '⛽',
    'Mua sắm': '🛍️',
    'Y tế': '🏥',
    'Giải trí': '🎉',
    'Học tập': '📚',
    'Tiền điện': '💡',
    'Tiền nước': '💧',
    'Internet': '🌐',
    'Điện thoại': '📱',
    'Nhà ở': '🏠',
    'Bảo hiểm': '🛡️',
    'Lương': '💰',
    'Thưởng': '🎁',
    'Làm thêm': '💼',
    'Bán hàng': '🛒',
    'Đầu tư': '📈',
    'Quà tặng': '🎀',
    'Khác': '📋'
  };
  
  return iconMap[category] || '📋';
};
