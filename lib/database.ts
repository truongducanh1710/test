import * as SQLite from 'expo-sqlite';

export interface Transaction {
  id?: number;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'income' | 'expense';
  source: 'manual' | 'ai'; // Để biết giao dịch được thêm thủ công hay AI
  created_at?: string;
  updated_at?: string;
}

class DatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;

  async init() {
    try {
      this.db = await SQLite.openDatabaseAsync('finance_tracker.db');
      await this.createTables();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  private async createTables() {
    if (!this.db) throw new Error('Database not initialized');

    const createTransactionsTable = `
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        source TEXT NOT NULL CHECK (source IN ('manual', 'ai')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.db.execAsync(createTransactionsTable);
  }

  // CRUD Operations
  async addTransaction(transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const { amount, description, category, date, type, source } = transaction;
    
    const result = await this.db.runAsync(
      `INSERT INTO transactions (amount, description, category, date, type, source) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [amount, description, category, date, type, source]
    );

    return result.lastInsertRowId;
  }

  async getTransactions(limit?: number, offset?: number): Promise<Transaction[]> {
    if (!this.db) throw new Error('Database not initialized');

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

    const result = await this.db.getAllAsync(query, params);
    return result as Transaction[];
  }

  async getTransactionById(id: number): Promise<Transaction | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      `SELECT * FROM transactions WHERE id = ?`,
      [id]
    );

    return result as Transaction | null;
  }

  async updateTransaction(id: number, updates: Partial<Transaction>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'created_at')
      .map(key => `${key} = ?`)
      .join(', ');

    if (!setClause) return;

    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id' && key !== 'created_at')
      .map(([, value]) => value);

    await this.db.runAsync(
      `UPDATE transactions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }

  async deleteTransaction(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
  }

  // Analytics functions
  async getTotalsByType(startDate?: string, endDate?: string): Promise<{ income: number; expense: number }> {
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
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      `SELECT * FROM transactions 
       WHERE description LIKE ? OR category LIKE ?
       ORDER BY date DESC, created_at DESC`,
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );

    return result as Transaction[];
  }

  // Add multiple transactions (for AI batch import)
  async addTransactionsBatch(transactions: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]): Promise<number[]> {
    if (!this.db) throw new Error('Database not initialized');

    const ids: number[] = [];

    // Use transaction for batch insert
    await this.db.withTransactionAsync(async () => {
      for (const transaction of transactions) {
        const { amount, description, category, date, type, source } = transaction;
        
        const result = await this.db!.runAsync(
          `INSERT INTO transactions (amount, description, category, date, type, source) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [amount, description, category, date, type, source]
        );
        
        ids.push(result.lastInsertRowId);
      }
    });

    return ids;
  }

  async close() {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }
}

// Singleton instance
export const database = new DatabaseManager();

// Helper function to format currency
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
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
