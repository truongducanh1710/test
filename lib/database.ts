import * as SQLite from 'expo-sqlite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Transaction {
  id?: string; // uuid on Supabase; numeric only for legacy SQLite
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'income' | 'expense';
  source: 'manual' | 'ai'; // Để biết giao dịch được thêm thủ công hay AI
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseError {
  code: string;
  message: string;
  originalError?: Error;
}

export class DatabaseException extends Error {
  public code: string;
  public originalError?: Error;

  constructor(code: string, message: string, originalError?: Error) {
    super(message);
    this.name = 'DatabaseException';
    this.code = code;
    this.originalError = originalError;
  }
}

// Validation functions
const validateTransaction = (transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): string | null => {
  if (!transaction.amount || transaction.amount <= 0) {
    return 'Số tiền phải lớn hơn 0';
  }
  
  if (!transaction.description || transaction.description.trim().length === 0) {
    return 'Mô tả không được để trống';
  }
  
  if (!transaction.category || transaction.category.trim().length === 0) {
    return 'Danh mục không được để trống';
  }
  
  if (!transaction.date) {
    return 'Ngày không được để trống';
  }
  
  const date = new Date(transaction.date);
  if (isNaN(date.getTime())) {
    return 'Định dạng ngày không hợp lệ';
  }
  
  if (!['income', 'expense'].includes(transaction.type)) {
    return 'Loại giao dịch không hợp lệ';
  }
  
  if (!['manual', 'ai'].includes(transaction.source)) {
    return 'Nguồn giao dịch không hợp lệ';
  }
  
  return null;
};

class DatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitializing: boolean = false;
  private sb: SupabaseClient | null = null;

  async init(): Promise<void> {
    if (this.db) {
      return; // Already initialized
    }
    
    if (this.isInitializing) {
      // Wait for existing initialization to complete
      while (this.isInitializing && !this.db) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.isInitializing = true;
      // Initialize Supabase client if env is provided
      const sbUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const sbKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      if (sbUrl && sbKey) {
        this.sb = createClient(sbUrl, sbKey);
      }
      this.db = await SQLite.openDatabaseAsync('finance_tracker.db');
      
      // Enable foreign key constraints and WAL mode for better performance
      await this.db.execAsync('PRAGMA foreign_keys = ON');
      await this.db.execAsync('PRAGMA journal_mode = WAL');
      
      await this.createTables();
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      this.db = null;
      throw new DatabaseException('INIT_FAILED', 'Không thể khởi tạo cơ sở dữ liệu', error as Error);
    } finally {
      this.isInitializing = false;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        await this.db.closeAsync();
        this.db = null;
        console.log('Database closed successfully');
      } catch (error) {
        console.error('Failed to close database:', error);
        throw new DatabaseException('CLOSE_FAILED', 'Không thể đóng cơ sở dữ liệu', error as Error);
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new DatabaseException('DB_NOT_INITIALIZED', 'Cơ sở dữ liệu chưa được khởi tạo');

    try {
      const createTransactionsTable = `
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amount REAL NOT NULL CHECK (amount > 0),
          description TEXT NOT NULL CHECK (length(trim(description)) > 0),
          category TEXT NOT NULL CHECK (length(trim(category)) > 0),
          date TEXT NOT NULL CHECK (date(date) IS NOT NULL),
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          source TEXT NOT NULL CHECK (source IN ('manual', 'ai')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source)'
      ];

      await this.db.execAsync(createTransactionsTable);
      
      for (const indexQuery of createIndexes) {
        await this.db.execAsync(indexQuery);
      }

      console.log('Database tables and indexes created successfully');
    } catch (error) {
      throw new DatabaseException('TABLE_CREATION_FAILED', 'Không thể tạo bảng dữ liệu', error as Error);
    }
  }

  // CRUD Operations
  async addTransaction(transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    await this.ensureInitialized();
    
    // Validate input
    const validationError = validateTransaction(transaction);
    if (validationError) {
      throw new DatabaseException('VALIDATION_ERROR', validationError);
    }

    try {
      const { amount, description, category, date, type, source } = transaction;
      // Supabase-first
      if (this.sb) {
        const { data, error } = await this.sb
          .from('transactions')
          .insert({ amount, description: description.trim(), category: category.trim(), date, type, source })
          .select('id')
          .single();
        if (error) throw new DatabaseException('INSERT_FAILED', error.message as any);
        return data!.id as string;
      }

      const result = await this.db!.runAsync(
        `INSERT INTO transactions (amount, description, category, date, type, source) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [amount, description.trim(), category.trim(), date, type, source]
      );

      if (!result.lastInsertRowId) {
        throw new DatabaseException('INSERT_FAILED', 'Không thể thêm giao dịch');
      }

      return String(result.lastInsertRowId);
    } catch (error) {
      if (error instanceof DatabaseException) {
        throw error;
      }
      throw new DatabaseException('INSERT_ERROR', 'Lỗi khi thêm giao dịch', error as Error);
    }
  }

  async getTransactions(limit?: number, offset?: number): Promise<Transaction[]> {
    await this.ensureInitialized();
    
    try {
      // Supabase
      if (this.sb) {
        let query = this.sb
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });
        if (limit !== undefined) query = query.limit(limit);
        // Offset support in Supabase: range
        if (limit !== undefined && offset !== undefined) {
          query = query.range(offset, offset + limit - 1);
        }
        const { data, error } = await query;
        if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
        return (data || []) as Transaction[];
      }

      // Validate input parameters
      if (limit !== undefined && (limit < 0 || !Number.isInteger(limit))) {
        throw new DatabaseException('INVALID_LIMIT', 'Giới hạn phải là số nguyên dương');
      }
      
      if (offset !== undefined && (offset < 0 || !Number.isInteger(offset))) {
        throw new DatabaseException('INVALID_OFFSET', 'Offset phải là số nguyên không âm');
      }

      let query = `SELECT * FROM transactions ORDER BY date DESC, created_at DESC`;
      const params: any[] = [];

      if (limit) {
        query += ` LIMIT ?`;
        params.push(limit);
        
        if (offset) {
          query += ` OFFSET ?`;
          params.push(offset);
        }
      }

      const result = await this.db!.getAllAsync(query, params);
      // Map numeric id to string for consistency
      return (result as any[]).map(r => ({ ...r, id: r.id != null ? String(r.id) : undefined })) as Transaction[];
    } catch (error) {
      if (error instanceof DatabaseException) {
        throw error;
      }
      throw new DatabaseException('QUERY_ERROR', 'Lỗi khi truy vấn giao dịch', error as Error);
    }
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    
    try {
      // Supabase path (uuid)
      if (this.sb) {
        const { data, error } = await this.sb
          .from('transactions')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
        return data as Transaction;
      }
      // SQLite fallback expects numeric id
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        throw new DatabaseException('INVALID_ID', 'ID giao dịch không hợp lệ');
      }
      const result = await this.db!.getFirstAsync(
        `SELECT * FROM transactions WHERE id = ?`,
        [numericId]
      );
      if (!result) return null;
      return { ...(result as any), id: String((result as any).id) } as Transaction;
    } catch (error) {
      if (error instanceof DatabaseException) {
        throw error;
      }
      throw new DatabaseException('QUERY_ERROR', 'Lỗi khi truy vấn giao dịch theo ID', error as Error);
    }
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
    await this.ensureInitialized();
    
    try {
      // Supabase
      if (this.sb) {
        const safeUpdates: any = { ...updates };
        delete safeUpdates.id;
        delete safeUpdates.created_at;
        const { error } = await this.sb.from('transactions').update(safeUpdates).eq('id', id);
        if (error) throw new DatabaseException('UPDATE_ERROR', error.message as any);
        return;
      }

      const setClause = Object.keys(updates)
        .filter(key => key !== 'id' && key !== 'created_at')
        .map(key => `${key} = ?`)
        .join(', ');

      if (!setClause) return;

      const values = Object.entries(updates)
        .filter(([key]) => key !== 'id' && key !== 'created_at')
        .map(([, value]) => value);

      const result = await this.db!.runAsync(
        `UPDATE transactions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, Number(id)]
      );

      if (result.changes === 0) {
        throw new DatabaseException('TRANSACTION_NOT_FOUND', 'Không tìm thấy giao dịch để cập nhật');
      }
    } catch (error) {
      if (error instanceof DatabaseException) {
        throw error;
      }
      throw new DatabaseException('UPDATE_ERROR', 'Lỗi khi cập nhật giao dịch', error as Error);
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      if (this.sb) {
        const { error } = await this.sb.from('transactions').delete().eq('id', id);
        if (error) throw new DatabaseException('DELETE_ERROR', error.message as any);
        return;
      }
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        throw new DatabaseException('INVALID_ID', 'ID giao dịch không hợp lệ');
      }
      const result = await this.db!.runAsync(`DELETE FROM transactions WHERE id = ?`, [numericId]);
      if (result.changes === 0) {
        throw new DatabaseException('TRANSACTION_NOT_FOUND', 'Không tìm thấy giao dịch để xóa');
      }
    } catch (error) {
      if (error instanceof DatabaseException) {
        throw error;
      }
      throw new DatabaseException('DELETE_ERROR', 'Lỗi khi xóa giao dịch', error as Error);
    }
  }

  // Analytics functions
  async getTotalsByType(startDate?: string, endDate?: string): Promise<{ income: number; expense: number }> {
    if (this.sb) {
      // Fetch and reduce client-side for simplicity
      let q = this.sb.from('transactions').select('amount,type,date');
      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);
      const { data, error } = await q;
      if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
      const totals = { income: 0, expense: 0 } as { income: number; expense: number };
      (data || []).forEach(r => {
        if (r.type === 'income') totals.income += Number(r.amount);
        if (r.type === 'expense') totals.expense += Number(r.amount);
      });
      return totals;
    }
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT 
        type,
        SUM(amount) as total
      FROM transactions 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      query += ` AND date >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND date <= ?`;
      params.push(endDate);
    }

    query += ` GROUP BY type`;

    const results = await this.db.getAllAsync(query, params) as { type: string; total: number }[];
    
    const totals = { income: 0, expense: 0 };
    results.forEach(row => {
      if (row.type === 'income' || row.type === 'expense') {
        totals[row.type] = row.total;
      }
    });

    return totals;
  }

  async getTransactionsByCategory(type?: 'income' | 'expense'): Promise<{ category: string; total: number; count: number }[]> {
    if (this.sb) {
      let q = this.sb.from('transactions').select('category, amount, type');
      if (type) q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
      const map = new Map<string, { total: number; count: number }>();
      (data || []).forEach(r => {
        const key = r.category as string;
        const prev = map.get(key) || { total: 0, count: 0 };
        prev.total += Number(r.amount);
        prev.count += 1;
        map.set(key, prev);
      });
      return Array.from(map.entries()).map(([category, v]) => ({ category, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total);
    }
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT 
        category,
        SUM(amount) as total,
        COUNT(*) as count
      FROM transactions
    `;
    const params: any[] = [];

    if (type) {
      query += ` WHERE type = ?`;
      params.push(type);
    }

    query += ` GROUP BY category ORDER BY total DESC`;

    const results = await this.db.getAllAsync(query, params);
    return results as { category: string; total: number; count: number }[];
  }

  async searchTransactions(searchTerm: string): Promise<Transaction[]> {
    if (this.sb) {
      const { data, error } = await this.sb
        .from('transactions')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
      return (data || []) as Transaction[];
    }
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      `SELECT * FROM transactions 
       WHERE description LIKE ? OR category LIKE ?
       ORDER BY date DESC, created_at DESC`,
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );

    return (result as any[]).map(r => ({ ...r, id: r.id != null ? String(r.id) : undefined })) as Transaction[];
  }

  // Add multiple transactions (for AI batch import)
  async addTransactionsBatch(transactions: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]): Promise<string[]> {
    await this.ensureInitialized();
    if (this.sb) {
      const payload = transactions.map(t => ({
        amount: t.amount,
        description: t.description.trim(),
        category: t.category.trim(),
        date: t.date,
        type: t.type,
        source: t.source
      }));
      const { data, error } = await this.sb.from('transactions').insert(payload).select('id');
      if (error) throw new DatabaseException('BATCH_INSERT_ERROR', error.message as any);
      return (data || []).map(r => r.id as string);
    }

    if (!this.db) throw new Error('Database not initialized');
    const ids: string[] = [];
    await this.db.withTransactionAsync(async () => {
      for (const transaction of transactions) {
        const { amount, description, category, date, type, source } = transaction;
        const result = await this.db!.runAsync(
          `INSERT INTO transactions (amount, description, category, date, type, source) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [amount, description, category, date, type, source]
        );
        ids.push(String(result.lastInsertRowId));
      }
    });
    return ids;
  }
}

// Singleton instance
export const database = new DatabaseManager();

// Helper function to format currency
export const formatCurrency = (amount: number): string => {
  const formatted = new Intl.NumberFormat('vi-VN').format(amount);
  return `${formatted} ₫`;
};

// Helper function to format date
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// Helper function to get date string for today
export const getTodayDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Helper function to categorize transactions automatically
export const getCategoryFromDescription = (description: string): string => {
  const lowerDesc = description.toLowerCase();
  
  if (lowerDesc.includes('ăn') || lowerDesc.includes('food') || lowerDesc.includes('grab food') || lowerDesc.includes('bep')) {
    return 'Ăn uống';
  }
  if (lowerDesc.includes('xăng') || lowerDesc.includes('gas') || lowerDesc.includes('petrol')) {
    return 'Xăng xe';
  }
  if (lowerDesc.includes('grab') || lowerDesc.includes('taxi') || lowerDesc.includes('bus')) {
    return 'Di chuyển';
  }
  if (lowerDesc.includes('atm') || lowerDesc.includes('rút tiền')) {
    return 'Rút tiền';
  }
  if (lowerDesc.includes('chuyển') || lowerDesc.includes('transfer')) {
    return 'Chuyển khoản';
  }
  if (lowerDesc.includes('lương') || lowerDesc.includes('salary')) {
    return 'Lương';
  }
  if (lowerDesc.includes('shopping') || lowerDesc.includes('mua sắm')) {
    return 'Mua sắm';
  }
  
  return 'Khác';
};
