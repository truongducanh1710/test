import * as SQLite from 'expo-sqlite';
import { createClient, SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/auth';
// Simple event emitter to notify UI of database changes
type DbEvent = 'transactions_changed' | 'category_budgets_changed' | 'loans_changed';
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
  currency?: string; // ISO currency code, e.g., VND, USD
  // Family/Privacy (Supabase-first; optional in SQLite fallback)
  household_id?: string | null;
  owner_user_id?: string | null;
  is_private?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Loan models
export interface Loan {
  id?: string;
  transaction_id: string; // id of the creating transaction
  kind: 'borrow' | 'lend'; // borrow = Vay, lend = Cho vay
  person: string;
  due_date?: string | null; // yyyy-mm-dd
  status?: 'open' | 'closed';
  created_at?: string;
  closed_at?: string | null;
}

// Goals & Plans models
export interface Goal {
  id?: string;
  name: string;
  target_amount: number;
  deadline?: string | null;
  wallet_id?: string | null;
  priority?: number;
  status?: 'active' | 'paused' | 'completed';
  created_at?: string;
}

export interface GoalContribution {
  id?: string;
  goal_id: string;
  amount: number;
  date: string; // yyyy-mm-dd
  source: 'manual' | 'auto';
  note?: string | null;
}

export interface FinancialPlan {
  id?: string;
  created_at?: string;
  horizon_months?: number;
  emergency_months?: number;
  recommended_wallets?: any; // {Essentials:number, Savings:number, Education:number, Lifestyle:number}
  notes?: string | null;
}

export interface PlanAction {
  id?: string;
  plan_id: string;
  title: string;
  due_date?: string | null;
  status?: 'todo' | 'done';
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

  if (!transaction.currency || String(transaction.currency).trim().length === 0) {
    return 'Tiền tệ không được để trống';
  }
  
  return null;
};

class DatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitializing: boolean = false;
  private sb: SupabaseClient | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeBound: boolean = false;
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
      // Use the authenticated Supabase client (shares session with auth.ts)
      const shared = getSupabase();
      if (shared) {
        this.sb = shared;
      } else {
        const sbUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (sbUrl && sbKey) {
          this.sb = createClient(sbUrl, sbKey);
        }
      }
      const { getUserDbFileName } = await import('@/lib/user');
      const dbFile = await getUserDbFileName();
      this.db = await SQLite.openDatabaseAsync(dbFile);
      
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

  // Enable Supabase realtime for cross-source updates
  // If householdId is provided, only listen to changes for that household
  enableRealtime(householdId?: string) {
    if (!this.sb || this.realtimeBound) return;
    try {
      let channel = this.sb.channel('app-changes');
      
      if (householdId) {
        // Listen only to transactions for this household
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transactions', filter: `household_id=eq.${householdId}` },
          () => { databaseEvents.emit('transactions_changed'); }
        );
      } else {
        // Listen to all transactions (fallback)
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
          databaseEvents.emit('transactions_changed');
        });
      }

      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'category_budgets' }, () => {
          databaseEvents.emit('category_budgets_changed');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, () => {
          databaseEvents.emit('loans_changed');
        })
        .subscribe();
      this.realtimeChannel = channel;
      this.realtimeBound = true;
    } catch (e) {
      // noop – realtime optional
    }
  }

  // Disable realtime (for switching households)
  disableRealtime() {
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
      this.realtimeBound = false;
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
        currency TEXT NOT NULL DEFAULT 'VND',
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

      // Backfill migration: ensure currency column exists on older installs
      try {
        await this.db.execAsync("ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'VND'");
      } catch (e) {
        // ignore if column already exists
      }

      // Loans table (for local SQLite fallback)
      const createLoansTable = `
        CREATE TABLE IF NOT EXISTS loans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('borrow','lend')),
          person TEXT NOT NULL,
          due_date TEXT NULL,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          closed_at TEXT NULL
        )
      `;
      await this.db.execAsync(createLoansTable);

      // Chat messages (on-device persistence)
      const createChatTable = `
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          household_id TEXT,
          role TEXT NOT NULL CHECK (role IN ('user','assistant')),
          content TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await this.db.execAsync(createChatTable);

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

  // ----- Chat history (SQLite only) -----
  async addChatMessage(role: 'user' | 'assistant', content: string, userId: string | null, householdId: string | null): Promise<number> {
    await this.ensureInitialized();
    const res = await this.db!.runAsync(
      `INSERT INTO chat_messages (user_id, household_id, role, content) VALUES (?, ?, ?, ?)`,
      [userId || null, householdId || null, role, content]
    );
    return Number(res.lastInsertRowId || 0);
  }

  async listChatMessages(userId: string | null, householdId: string | null, limit: number = 200, offset: number = 0): Promise<Array<{ id: number; role: 'user'|'assistant'; content: string; created_at: string }>> {
    await this.ensureInitialized();
    const where: string[] = [];
    const params: any[] = [];
    if (userId === null) {
      where.push('user_id IS NULL');
    } else {
      where.push('user_id = ?');
      params.push(userId);
    }
    if (householdId === null) {
      where.push('household_id IS NULL');
    } else {
      where.push('household_id = ?');
      params.push(householdId);
    }
    params.push(limit, offset);
    const sql = `SELECT id, role, content, created_at FROM chat_messages
                 WHERE ${where.join(' AND ')}
                 ORDER BY datetime(created_at) ASC
                 LIMIT ? OFFSET ?`;
    const rows = await this.db!.getAllAsync(sql, params);
    return rows as any;
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
    databaseEvents.emit('category_budgets_changed');
  }

  // Build wallet_id -> categories[] map, includes 'unassigned' key when wallet_id is null
  async getWalletCategoriesMap(budgetId: string): Promise<Map<string, string[]>> {
    const rows = await this.listCategoryBudgets(budgetId);
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const key = r.wallet_id || 'unassigned';
      map.set(key, [...(map.get(key) || []), r.category]);
    }
    return map;
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
    const { amount, description, category, date, type, source, currency, is_private, household_id, owner_user_id } = transaction;
      // Supabase-first with graceful fallback to SQLite on permission/RLS/auth issues
      if (this.sb) {
        try {
          const sb = getSupabase();
          const authUser = (await sb!.auth.getUser()).data.user;
          const owner = authUser?.id || owner_user_id || null;
          const payload: any = {
            amount,
            description: description.trim(),
            category: category.trim(),
            date,
            type,
            source,
            currency: currency || 'VND',
            is_private: !!is_private,
            household_id: household_id || null,
            owner_user_id: owner,
          };
          let { data, error } = await this.sb
            .from('transactions')
            .insert(payload)
            .select('id')
            .single();
          if (error) {
            const msg = String((error as any)?.message || '')
              .toLowerCase();
            const isCurrencySchema = msg.includes('currency') && (msg.includes('schema') || msg.includes('column') || msg.includes('not find'));
            if (isCurrencySchema) {
              // Retry without currency column (server not migrated yet)
              const payload2: any = { ...payload };
              delete payload2.currency;
              const retry = await this.sb
                .from('transactions')
                .insert(payload2)
                .select('id')
                .single();
              if (!retry.error) {
                const newId = retry.data!.id as string;
                databaseEvents.emit('transactions_changed');
                return newId;
              }
              // if still error, continue to normal handling
              error = retry.error;
            }
            const isRls = msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('no jwt') || msg.includes('auth');
            if (!isRls) {
              throw new DatabaseException('INSERT_FAILED', (error as any).message as any);
            }
            // fall through to SQLite insert below
          } else {
            const newId = data!.id as string;
            databaseEvents.emit('transactions_changed');
            return newId;
          }
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase();
          const isRls = msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('no jwt') || msg.includes('auth');
          if (!isRls) {
            throw e instanceof DatabaseException ? e : new DatabaseException('INSERT_FAILED', e?.message || 'Insert failed');
          }
          // else: fallback to SQLite below
        }
      }

      const result = await this.db!.runAsync(
      `INSERT INTO transactions (amount, description, category, date, type, source, currency) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [amount, description.trim(), category.trim(), date, type, source, currency || 'VND']
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
      try {
        const sb = getSupabase();
        const authUser = (await sb!.auth.getUser()).data.user;
        const owner = authUser?.id || null;
        const payload = transactions.map(t => ({
          amount: t.amount,
          description: t.description.trim(),
          category: t.category.trim(),
          date: t.date,
          type: t.type,
          source: t.source,
          currency: t.currency || 'VND',
          is_private: !!(t as any).is_private || false,
          household_id: (t as any).household_id || null,
          owner_user_id: owner,
        }));
        const { data, error } = await this.sb.from('transactions').insert(payload).select('id');
        if (error) {
          const msg = String((error as any)?.message || '').toLowerCase();
          const isRls = msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('no jwt') || msg.includes('auth');
          const isCurrencySchema = msg.includes('currency') && (msg.includes('schema') || msg.includes('column') || msg.includes('not find'));
          if (!isRls && !isCurrencySchema) {
            throw new DatabaseException('BATCH_INSERT_ERROR', (error as any).message as any);
          }
          // fallthrough to SQLite
        } else {
          databaseEvents.emit('transactions_changed');
          return (data || []).map(r => r.id as string);
        }
      } catch (e: any) {
        const msg = String(e?.message || '').toLowerCase();
        const isRls = msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('no jwt') || msg.includes('auth');
        if (!isRls) {
          // non-RLS errors still rethrow
          throw e instanceof DatabaseException ? e : new DatabaseException('BATCH_INSERT_ERROR', e?.message || 'Insert failed');
        }
        // else fall through to SQLite
      }
    }

    if (!this.db) throw new Error('Database not initialized');
    const ids: string[] = [];
    await this.db.withTransactionAsync(async () => {
      for (const transaction of transactions) {
        const { amount, description, category, date, type, source, currency } = transaction;
        const result = await this.db!.runAsync(
          `INSERT INTO transactions (amount, description, category, date, type, source, currency) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [amount, description, category, date, type, source, currency || 'VND']
        );
        ids.push(String(result.lastInsertRowId));
      }
    });
    databaseEvents.emit('transactions_changed');
    return ids;
  }

  // Seed helpers (for demo data)
  async seedFakeMonthIfEmpty(month: number, year: number): Promise<boolean> {
    // Disabled seeding for production/users: always return false
    return false;
  }

  async seedFakeMonthsIfEmpty(months: number[], year: number): Promise<void> {
    for (const m of months) {
      await this.seedFakeMonthIfEmpty(m, year);
    }
  }

  // Loans APIs
  async addLoanForTransaction(input: Omit<Loan, 'id' | 'status' | 'created_at' | 'closed_at'>): Promise<string> {
    await this.ensureInitialized();
    const { transaction_id, kind, person, due_date } = input;
    if (!transaction_id || !kind || !person.trim()) {
      throw new DatabaseException('VALIDATION_ERROR', 'Thiếu thông tin khoản vay');
    }

    if (this.sb) {
      const { data, error } = await this.sb
        .from('loans')
        .insert({ transaction_id, kind, person: person.trim(), due_date: due_date || null, status: 'open' })
        .select('id')
        .single();
      if (error) {
        // Schema cache not warmed yet or table missing -> degrade gracefully
        if ((error as any)?.message?.toLowerCase?.().includes('could not find the table') || (error as any)?.code === '42P01') {
          return '';
        }
        throw new DatabaseException('INSERT_FAILED', error.message as any);
      }
      databaseEvents.emit('loans_changed');
      return data!.id as string;
    }

    const result = await this.db!.runAsync(
      `INSERT INTO loans (transaction_id, kind, person, due_date, status) VALUES (?, ?, ?, ?, 'open')`,
      [transaction_id, kind, person.trim(), due_date || null]
    );
    if (!result.lastInsertRowId) throw new DatabaseException('INSERT_FAILED', 'Không thể thêm khoản vay');
    databaseEvents.emit('loans_changed');
    return String(result.lastInsertRowId);
  }

  async listLoans(status: 'open' | 'closed' | 'all' = 'open'): Promise<Loan[]> {
    await this.ensureInitialized();
    if (this.sb) {
      try {
        let query = this.sb.from('loans').select('*').order('created_at', { ascending: false });
        if (status !== 'all') query = query.eq('status', status);
        const { data } = await query;
        return (data || []) as Loan[];
      } catch (e: any) {
        // If table not in schema cache yet
        return [] as Loan[];
      }
    }
    let sql = `SELECT * FROM loans`;
    const args: any[] = [];
    if (status !== 'all') { sql += ` WHERE status = ?`; args.push(status); }
    sql += ` ORDER BY datetime(created_at) DESC`;
    const rows = await this.db!.getAllAsync(sql, args);
    return rows as unknown as Loan[];
  }

  async getLoansSummary(): Promise<{ totalBorrow: number; totalLend: number; dueSoon: number; openCount: number; }>{
    await this.ensureInitialized();
    const loans = await this.listLoans('open');
    let totalBorrow = 0, totalLend = 0, dueSoon = 0;
    const today = new Date();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    for (const loan of loans) {
      const tx = await this.getTransactionById(loan.transaction_id);
      if (tx) {
        if (loan.kind === 'borrow') totalBorrow += tx.amount; else totalLend += tx.amount;
      }
      if (loan.due_date) {
        const d = new Date(loan.due_date);
        if (!isNaN(d.getTime()) && d.getTime() - today.getTime() <= threeDays && d.getTime() >= today.getTime()) dueSoon++;
      }
    }
    return { totalBorrow, totalLend, dueSoon, openCount: loans.length };
  }

  async closeLoanAndCreateSettlement(loanId: string, date?: string): Promise<string> {
    await this.ensureInitialized();
    const openLoans = await this.listLoans('open');
    const loan = openLoans.find(l => String(l.id) === String(loanId));
    if (!loan) throw new DatabaseException('NOT_FOUND', 'Không tìm thấy khoản vay');
    const src = await this.getTransactionById(loan.transaction_id);
    if (!src) throw new DatabaseException('NOT_FOUND', 'Không tìm thấy giao dịch nguồn');
    const settlementDate = date || new Date().toISOString().split('T')[0];
    const settlementCategory = loan.kind === 'borrow' ? 'Trả nợ' : 'Thu nợ';
    const settlementType = loan.kind === 'borrow' ? 'expense' : 'income';
    const txId = await this.addTransaction({
      amount: src.amount,
      description: `${settlementCategory}: ${loan.person}`,
      category: settlementCategory,
      date: settlementDate,
      type: settlementType as any,
      source: 'manual',
    });

    if (this.sb) {
      try {
        await this.sb.from('loans').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', loanId);
        databaseEvents.emit('loans_changed');
      } catch {}
    } else {
      await this.db!.runAsync(`UPDATE loans SET status='closed', closed_at=CURRENT_TIMESTAMP WHERE id = ?`, [loanId]);
      databaseEvents.emit('loans_changed');
    }
    return txId;
  }

  async getRecentLoans(limit: number = 10): Promise<Loan[]> {
    await this.ensureInitialized();
    const loans = await this.listLoans('open');
    return loans.slice(0, limit);
  }

  // ------- Goals APIs -------
  async createGoal(goal: Omit<Goal, 'id' | 'created_at' | 'status'> & { status?: Goal['status'] }): Promise<string> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const payload = {
      name: goal.name.trim(),
      target_amount: Number(goal.target_amount),
      deadline: goal.deadline || null,
      wallet_id: goal.wallet_id || null,
      priority: goal.priority ?? 0,
      status: goal.status || 'active',
    };
    const { data, error } = await this.sb.from('goals').insert(payload).select('id').single();
    if (error) throw new DatabaseException('INSERT_FAILED', error.message as any);
    return data!.id as string;
  }

  async upsertGoal(goal: Partial<Goal> & { id?: string }): Promise<string> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data, error } = await this.sb.from('goals').upsert(goal as any).select('id').single();
    if (error) throw new DatabaseException('UPSERT_ERROR', error.message as any);
    return data!.id as string;
  }

  async deleteGoal(id: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { error } = await this.sb.from('goals').delete().eq('id', id);
    if (error) throw new DatabaseException('DELETE_ERROR', error.message as any);
  }

  async listGoals(): Promise<Goal[]> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data, error } = await this.sb.from('goals').select('*').order('priority', { ascending: false }).order('created_at', { ascending: true });
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    return (data || []) as Goal[];
  }

  async addContribution(c: Omit<GoalContribution, 'id'>): Promise<string> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const payload = { ...c, note: c.note || null } as any;
    const { data, error } = await this.sb.from('goal_contributions').insert(payload).select('id').single();
    if (error) throw new DatabaseException('INSERT_FAILED', error.message as any);
    return data!.id as string;
  }

  async listContributions(goalId: string): Promise<GoalContribution[]> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data, error } = await this.sb.from('goal_contributions').select('*').eq('goal_id', goalId).order('date', { ascending: false });
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    return (data || []) as GoalContribution[];
  }

  async computeGoalProgress(goalId: string): Promise<{ contributed: number; remaining: number; percent: number }> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data: goal, error: gErr } = await this.sb.from('goals').select('target_amount').eq('id', goalId).single();
    if (gErr) throw new DatabaseException('QUERY_ERROR', gErr.message as any);
    const { data: contribs, error: cErr } = await this.sb.from('goal_contributions').select('amount').eq('goal_id', goalId);
    if (cErr) throw new DatabaseException('QUERY_ERROR', cErr.message as any);
    const contributed = (contribs || []).reduce((s, r: any) => s + Number(r.amount), 0);
    const remaining = Math.max(0, Number(goal?.target_amount || 0) - contributed);
    const percent = (Number(goal?.target_amount || 0) > 0) ? (contributed / Number(goal?.target_amount || 0)) * 100 : 0;
    return { contributed, remaining, percent };
  }

  // ------- Financial Plan APIs -------
  async getFinancialPlan(): Promise<FinancialPlan | null> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data, error } = await this.sb.from('financial_plans').select('*').order('created_at', { ascending: false }).limit(1);
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    return (data && data[0]) || null;
  }

  async upsertFinancialPlan(plan: Partial<FinancialPlan> & { id?: string }): Promise<string> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data, error } = await this.sb.from('financial_plans').upsert(plan as any).select('id').single();
    if (error) throw new DatabaseException('UPSERT_ERROR', error.message as any);
    return data!.id as string;
  }

  async listPlanActions(planId: string): Promise<PlanAction[]> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data, error } = await this.sb.from('plan_actions').select('*').eq('plan_id', planId).order('due_date', { ascending: true });
    if (error) throw new DatabaseException('QUERY_ERROR', error.message as any);
    return (data || []) as PlanAction[];
  }

  async upsertPlanAction(action: Partial<PlanAction> & { id?: string }): Promise<string> {
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const { data, error } = await this.sb.from('plan_actions').upsert(action as any).select('id').single();
    if (error) throw new DatabaseException('UPSERT_ERROR', error.message as any);
    return data!.id as string;
  }

  async getRecommendedWalletPercents(start: string, end: string): Promise<Record<string, number>> {
    // Heuristic: map spend by category -> wallets, normalize to 100%, apply floors/ceilings
    await this.ensureInitialized();
    if (!this.sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
    const spendByCatArr = await this.getTransactionsByCategory('expense', start, end);
    const spendByCat = new Map(spendByCatArr.map(r => [r.category, r.total]));
    const mapToWallet = (cat: string): string => {
      const e = ['Ăn uống','Di chuyển','Xăng xe','Nhà ở','Tiền điện','Tiền nước','Internet','Điện thoại','Y tế','Khác'];
      const l = ['Mua sắm','Giải trí'];
      const edu = ['Học tập'];
      if (e.includes(cat)) return 'Essentials';
      if (l.includes(cat)) return 'Lifestyle';
      if (edu.includes(cat)) return 'Education';
      return 'Essentials';
    };
    const sums: Record<string, number> = { Essentials: 0, Savings: 0, Education: 0, Lifestyle: 0 };
    spendByCat.forEach((v, k) => { sums[mapToWallet(k)] += v; });
    // Set Savings as residual target (e.g., 20% baseline) if income known; here simple baseline
    const total = Object.values(sums).reduce((a, b) => a + b, 0) || 1;
    const pct = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Math.round((v / total) * 100)]));
    // Clamp & normalize
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    pct.Essentials = clamp(pct.Essentials, 40, 70);
    pct.Lifestyle = clamp(pct.Lifestyle, 5, 25);
    pct.Education = clamp(pct.Education, 5, 20);
    pct.Savings = clamp(100 - (pct.Essentials + pct.Lifestyle + pct.Education), 5, 40);
    return pct;
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
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Helper function to categorize transactions automatically
export const getCategoryFromDescription = (description: string): string => {
  const lowerDesc = description.toLowerCase();
  
  if (
    lowerDesc.includes('ăn') ||
    lowerDesc.includes('uống') ||
    lowerDesc.includes('nước') ||
    lowerDesc.includes('cà phê') ||
    lowerDesc.includes('ca phe') ||
    lowerDesc.includes('coffee') ||
    lowerDesc.includes('trà') ||
    lowerDesc.includes('tra ') ||
    lowerDesc.includes('food') ||
    lowerDesc.includes('grab food') ||
    lowerDesc.includes('bep')
  ) {
    return 'Ăn uống';
  }
  if (lowerDesc.includes('xăng') || lowerDesc.includes('gas') || lowerDesc.includes('petrol')) {
    return 'Xăng xe';
  }
  if (
    lowerDesc.includes('grab') ||
    lowerDesc.includes('taxi') ||
    lowerDesc.includes('bus') ||
    lowerDesc.includes('gửi xe') ||
    lowerDesc.includes('gui xe') ||
    lowerDesc.includes('giu xe') ||
    lowerDesc.includes('bãi xe') ||
    lowerDesc.includes('bai xe') ||
    lowerDesc.includes('parking')
  ) {
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

// ===== Household APIs (Supabase only) =====
export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at?: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at?: string;
}

export interface HouseholdInvite {
  url: string;
  token: string;
  expires_at: string;
}

/**
 * Tạo household mới (người tạo tự động trở thành admin)
 */
export async function createHousehold(name: string, userId: string): Promise<string> {
  await database.init();
  const sb = (database as any).sb;
  if (!sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');

  const { data, error } = await sb
    .from('households')
    .insert({ name, created_by: userId })
    .select('id')
    .single();
  if (error) throw new DatabaseException('INSERT_FAILED', error.message);

  const householdId = data!.id as string;

  // Thêm người tạo vào household_members với role admin
  const { error: memberError } = await sb
    .from('household_members')
    .insert({ household_id: householdId, user_id: userId, role: 'admin' });
  if (memberError) throw new DatabaseException('INSERT_FAILED', memberError.message);

  return householdId;
}

/**
 * Lấy danh sách households mà user là thành viên
 */
export async function getUserHouseholds(userId: string): Promise<Household[]> {
  await database.init();
  const sb = (database as any).sb;
  if (!sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');

  const { data, error } = await sb
    .from('household_members')
    .select('household_id, households(*)')
    .eq('user_id', userId);
  if (error) throw new DatabaseException('QUERY_ERROR', error.message);

  return ((data || []) as any[]).map((r: any) => r.households).filter(Boolean);
}

/**
 * Lấy danh sách thành viên trong household
 */
export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  await database.init();
  const sb = (database as any).sb;
  if (!sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');

  const { data, error } = await sb
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });
  if (error) throw new DatabaseException('QUERY_ERROR', error.message);

  return (data || []) as HouseholdMember[];
}

/**
 * Tạo link mời vào household (gọi RPC)
 */
export async function createHouseholdInvite(householdId: string): Promise<HouseholdInvite> {
  await database.init();
  const sb = (database as any).sb;
  if (!sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');

  const { data, error } = await sb.rpc('create_household_invite', { p_household_id: householdId });
  if (error) throw new DatabaseException('RPC_ERROR', error.message);

  return data as HouseholdInvite;
}

/**
 * Chấp nhận lời mời tham gia household (gọi RPC)
 */
export async function acceptHouseholdInvite(token: string): Promise<{ household_id: string; already_member: boolean }> {
  await database.init();
  const sb = (database as any).sb;
  if (!sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');

  const { data, error } = await sb.rpc('accept_household_invite', { p_token: token });
  if (error) throw new DatabaseException('RPC_ERROR', error.message);

  return data as { household_id: string; already_member: boolean };
}

/**
 * Gọi RPC để lấy tổng hợp household (dùng cho dashboard)
 */
export async function getHouseholdMonthlyTotals(
  householdId: string,
  startDate: string,
  endDate: string
): Promise<{ total_income: number; total_expense: number; transaction_count: number }> {
  await database.init();
  const sb = (database as any).sb;
  if (!sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');

  const { data, error } = await sb.rpc('household_monthly_totals', {
    p_household_id: householdId,
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw new DatabaseException('RPC_ERROR', error.message);

  return data as { total_income: number; total_expense: number; transaction_count: number };
}

/**
 * Xóa household (chỉ creator hoặc admin). Gọi RPC delete_household
 */
export async function deleteHousehold(householdId: string): Promise<void> {
  await database.init();
  const sb = (database as any).sb;
  if (!sb) throw new DatabaseException('NO_SUPABASE', 'Supabase chưa được cấu hình');
  const { error } = await sb.rpc('delete_household', { p_household_id: householdId });
  if (error) throw new DatabaseException('RPC_ERROR', error.message);
}
