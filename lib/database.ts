import * as SQLite from 'expo-sqlite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
// Simple event emitter to notify UI of database changes
type DbEvent = 'transactions_changed' | 'category_budgets_changed';
class DbEventEmitter {
  private listeners = new Map<DbEvent, Set<(...args: any[]) => void>>();
  on(event: DbEvent, cb: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }
  off(event: DbEvent, cb: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(cb);
  }
  emit(event: DbEvent, ...args: any[]) {
    this.listeners.get(event)?.forEach(cb => cb(...args));
  }
}
export const databaseEvents = new DbEventEmitter();

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

// Budgeting models
export interface Budget {
  id?: string;
  cycle: 'weekly' | 'monthly';
  start_date: string; // yyyy-mm-dd start of cycle
  rollover: boolean;
  created_at?: string;
  monthly_income?: number | null;
}

export interface Wallet {
  id?: string;
  budget_id: string;
  name: string; // Essentials/Savings/Education/Lifestyle
  percent?: number | null; // optional allocation
  color?: string | null;
}

export interface CategoryBudget {
  id?: string;
  budget_id: string;
  category: string;
  wallet_id?: string | null;
  limit_amount: number; // planned amount for cycle
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
  private toDateString(d: Date): string {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      .toISOString()
      .slice(0, 10);
  }

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

  // ----- Cycle helpers -----
  getCycleRange(date: Date, cycle: 'weekly' | 'monthly'): { start: string; end: string } {
    if (cycle === 'monthly') {
      const start = this.toDateString(new Date(date.getFullYear(), date.getMonth(), 1));
      const end = this.toDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
      return { start, end };
    }
    // weekly (ISO: Monday-Sunday)
    const day = date.getDay(); // 0 Sun..6 Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: this.toDateString(monday), end: this.toDateString(sunday) };
  }

  // ----- Budget APIs (Supabase only; fallback: throw if not configured) -----
  private assertSupabase() {
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
  }

  async getActiveBudget(cycle?: 'weekly' | 'monthly'): Promise<Budget | null> {
    await this.ensureInitialized();
    this.assertSupabase();
    let q = this.sb!.from('budgets').select('*').order('created_at', { ascending: false }).limit(1);
    if (cycle) q = q.eq('cycle', cycle);
    const { data, error } = await q;
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    return (data && data[0]) || null;
  }

  async upsertBudget(payload: Omit<Budget, 'id' | 'created_at'> & { id?: string }): Promise<string> {
    await this.ensureInitialized();
    this.assertSupabase();
    const { data, error } = await this.sb!
      .from('budgets')
      .upsert(payload as any)
      .select('id')
      .single();
    if (error) throw new DatabaseException('UPSERT_ERROR', error.message as any);
    databaseEvents.emit('category_budgets_changed');
    return data!.id as string;
  }

  async listWallets(budgetId: string): Promise<Wallet[]> {
    await this.ensureInitialized();
    this.assertSupabase();
    const { data, error } = await this.sb!.from('wallets').select('*').eq('budget_id', budgetId).order('name');
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    return (data || []) as Wallet[];
  }

  async upsertWallets(wallets: Wallet[]): Promise<void> {
    await this.ensureInitialized();
    this.assertSupabase();
    // Remove id for new rows so Postgres default (gen_random_uuid) applies
    const payload = wallets.map((w) => {
      const base: any = {
        budget_id: w.budget_id,
        name: w.name,
        percent: w.percent ?? null,
        color: w.color ?? null,
      };
      if (w.id) base.id = w.id; // only include when updating existing
      return base;
    });
    const { error } = await this.sb!.from('wallets').upsert(payload, { onConflict: 'id' } as any);
    if (error) throw new DatabaseException('UPSERT_ERROR', error.message as any);
  }

  async listCategoryBudgets(budgetId: string): Promise<CategoryBudget[]> {
    await this.ensureInitialized();
    this.assertSupabase();
    const { data, error } = await this.sb!.from('category_budgets').select('*').eq('budget_id', budgetId);
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    return (data || []) as CategoryBudget[];
  }

  async upsertCategoryBudgets(items: CategoryBudget[]): Promise<void> {
    await this.ensureInitialized();
    this.assertSupabase();
    const { error } = await this.sb!.from('category_budgets').upsert(items as any);
    if (error) throw new DatabaseException('UPSERT_ERROR', error.message as any);
  }

  // Seed default category -> wallet mapping if none exists for this budget
  async seedDefaultCategoryWalletsIfEmpty(budgetId: string): Promise<boolean> {
    await this.ensureInitialized();
    this.assertSupabase();
    const { count, error } = await this.sb!
      .from('category_budgets')
      .select('id', { count: 'exact', head: true })
      .eq('budget_id', budgetId);
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    if ((count || 0) > 0) return false;

    const wallets = await this.listWallets(budgetId);
    const nameToId = new Map<string, string>();
    wallets.forEach(w => nameToId.set(w.name.toLowerCase(), w.id!));

    // Defaults (vi-VN):
    const essentials = ['Ăn uống','Di chuyển','Xăng xe','Nhà ở','Tiền điện','Tiền nước','Internet','Điện thoại','Y tế','Khác'];
    const lifestyle = ['Mua sắm','Giải trí'];
    const education = ['Học tập'];
    const savings = ['Bảo hiểm'];

    const items: CategoryBudget[] = [];
    const pushFor = (cats: string[], walletName: string) => {
      const wid = nameToId.get(walletName.toLowerCase());
      cats.forEach(category => items.push({ budget_id: budgetId, category, wallet_id: wid || null, limit_amount: 0 }));
    };

    pushFor(essentials, 'Essentials');
    pushFor(lifestyle, 'Lifestyle');
    pushFor(education, 'Education');
    pushFor(savings, 'Savings');

    const { error: insertError } = await this.sb!.from('category_budgets').insert(items as any);
    if (insertError) throw new DatabaseException('INSERT_ERROR', insertError.message as any);
    databaseEvents.emit('category_budgets_changed');
    return true;
  }

  async getSpendByCategoryRange(start: string, end: string): Promise<Map<string, number>> {
    const rows = await this.getTransactionsByCategory('expense', start, end);
    const map = new Map<string, number>();
    rows.forEach(r => map.set(r.category, r.total));
    return map;
  }

  async getSpendByWalletRange(budgetId: string, start: string, end: string): Promise<Map<string, number>> {
    const [categoryBudgets, spendByCat] = await Promise.all([
      this.listCategoryBudgets(budgetId),
      this.getSpendByCategoryRange(start, end),
    ]);
    const walletToSpend = new Map<string, number>();
    categoryBudgets.forEach(cb => {
      const spent = spendByCat.get(cb.category) || 0;
      const key = cb.wallet_id || 'unassigned';
      walletToSpend.set(key, (walletToSpend.get(key) || 0) + spent);
    });
    return walletToSpend;
  }

  // Compute wallet limits from actual income in range based on wallet percent
  async computeWalletBudgets(
    budgetId: string,
    start: string,
    end: string
  ): Promise<Array<{ id: string; name: string; percent: number; color?: string | null; limit: number }>> {
    await this.ensureInitialized();
    this.assertSupabase();

    const [wallets, totals] = await Promise.all([
      this.listWallets(budgetId),
      this.getTotalsByType(start, end),
    ]);
    const income = Number(totals.income || 0);
    return wallets.map(w => ({
      id: w.id!,
      name: w.name,
      percent: Number(w.percent || 0),
      color: w.color,
      limit: income * (Number(w.percent || 0) / 100),
    }));
  }

  // ----- Existing transactions APIs below -----
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
        const newId = data!.id as string;
        databaseEvents.emit('transactions_changed');
        return newId;
      }

      const result = await this.db!.runAsync(
      `INSERT INTO transactions (amount, description, category, date, type, source) 
       VALUES (?, ?, ?, ?, ?, ?)`,
        [amount, description.trim(), category.trim(), date, type, source]
      );

      if (!result.lastInsertRowId) {
        throw new DatabaseException('INSERT_FAILED', 'Không thể thêm giao dịch');
      }

      const newId = String(result.lastInsertRowId);
      databaseEvents.emit('transactions_changed');
      return newId;
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
        databaseEvents.emit('transactions_changed');
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
      databaseEvents.emit('transactions_changed');
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
        databaseEvents.emit('transactions_changed');
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
      databaseEvents.emit('transactions_changed');
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

  async getTransactionsByCategory(type?: 'income' | 'expense', startDate?: string, endDate?: string): Promise<{ category: string; total: number; count: number }[]> {
    if (this.sb) {
      let q = this.sb.from('transactions').select('category, amount, type, date');
      if (type) q = q.eq('type', type);
      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);
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

    const whereClauses: string[] = [];
    if (type) { whereClauses.push(`type = ?`); params.push(type); }
    if (startDate) { whereClauses.push(`date >= ?`); params.push(startDate); }
    if (endDate) { whereClauses.push(`date <= ?`); params.push(endDate); }
    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
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
      databaseEvents.emit('transactions_changed');
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
    databaseEvents.emit('transactions_changed');
    return ids;
  }

  // Seed helpers (for demo data)
  async seedFakeMonthIfEmpty(month: number, year: number): Promise<boolean> {
    await this.ensureInitialized();
    const start = this.toDateString(new Date(year, month - 1, 1));
    const end = this.toDateString(new Date(year, month, 0));

    // Check existing
    let hasData = false;
    if (this.sb) {
      const { count, error } = await this.sb
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .gte('date', start)
        .lte('date', end);
      if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
      hasData = (count || 0) > 0;
    } else {
      const row = await this.db!.getFirstAsync(
        `SELECT COUNT(*) as cnt FROM transactions WHERE date >= ? AND date <= ?`,
        [start, end]
      ) as { cnt: number } | null;
      hasData = !!row && Number((row as any).cnt) > 0;
    }
    if (hasData) return false;

    // Build sample records
    const day = (d: number) => this.toDateString(new Date(year, month - 1, d));
    const samples: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[] = [
      { amount: 6500000, description: 'Lương tháng', category: 'Lương', date: day(5), type: 'income', source: 'manual' },
      { amount: 1200000, description: 'Ăn uống', category: 'Ăn uống', date: day(8), type: 'expense', source: 'manual' },
      { amount: 800000, description: 'Xăng xe', category: 'Xăng xe', date: day(10), type: 'expense', source: 'manual' },
      { amount: 950000, description: 'Mua sắm', category: 'Mua sắm', date: day(12), type: 'expense', source: 'manual' },
      { amount: 2000000, description: 'Freelance', category: 'Lương', date: day(15), type: 'income', source: 'manual' },
      { amount: 450000, description: 'Di chuyển', category: 'Di chuyển', date: day(18), type: 'expense', source: 'manual' },
      { amount: 300000, description: 'Cafe & gặp gỡ', category: 'Ăn uống', date: day(22), type: 'expense', source: 'manual' },
    ];

    await this.addTransactionsBatch(samples);
    return true;
  }

  async seedFakeMonthsIfEmpty(months: number[], year: number): Promise<void> {
    for (const m of months) {
      await this.seedFakeMonthIfEmpty(m, year);
    }
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
