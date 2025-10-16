import * as SQLite from 'expo-sqlite';
import { database, getTodayDateString } from '@/lib/database';

type StreakInfo = { current: number; best: number; completedToday: boolean };

import { getUserDbFileName } from '@/lib/user';
async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const file = await getUserDbFileName();
  return await SQLite.openDatabaseAsync(file);
}

async function createTables(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      date TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );
  `);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_wallet (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      coins INTEGER NOT NULL DEFAULT 0
    );
  `);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reward_code TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      meta TEXT
    );
  `);
}

function toDateKey(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

export async function addCoins(amount: number): Promise<number> {
  const db = await openDb();
  await createTables(db);
  await db.runAsync(`INSERT INTO user_wallet (id, coins) VALUES (1, 0) ON CONFLICT(id) DO NOTHING`);
  await db.runAsync(`UPDATE user_wallet SET coins = coins + ? WHERE id = 1`, [amount]);
  const row = (await db.getFirstAsync(`SELECT coins FROM user_wallet WHERE id = 1`)) as { coins: number } | null;
  return Number(row?.coins || 0);
}

export async function deductCoins(amount: number): Promise<number> {
  const db = await openDb();
  await createTables(db);
  await db.runAsync(`INSERT INTO user_wallet (id, coins) VALUES (1, 0) ON CONFLICT(id) DO NOTHING`);
  await db.runAsync(`UPDATE user_wallet SET coins = MAX(coins - ?, 0) WHERE id = 1`, [amount]);
  const row = (await db.getFirstAsync(`SELECT coins FROM user_wallet WHERE id = 1`)) as { coins: number } | null;
  return Number(row?.coins || 0);
}

export async function getCoins(): Promise<number> {
  const db = await openDb();
  await createTables(db);
  const row = (await db.getFirstAsync(`SELECT coins FROM user_wallet WHERE id = 1`)) as { coins: number } | null;
  return Number(row?.coins || 0);
}

async function computeStreakInternal(db: SQLite.SQLiteDatabase): Promise<{ current: number; best: number; completedToday: boolean }> {
  const todayKey = getTodayDateString();
  const rows = (await db.getAllAsync(
    `SELECT date, count FROM habit_logs WHERE date <= ? ORDER BY date DESC LIMIT 365`,
    [todayKey]
  )) as { date: string; count: number }[];

  const map = new Map(rows.map(r => [r.date, r.count]));

  // current streak: count from today backwards until first missing
  let current = 0;
  let cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = toDateKey(cursor);
    const has = (map.get(key) || 0) > 0;
    if (has) {
      current += 1;
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  // best streak: scan all days and compute longest run
  let best = 0;
  let run = 0;
  const scanCursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = toDateKey(scanCursor);
    const has = (map.get(key) || 0) > 0;
    if (has) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    scanCursor.setDate(scanCursor.getDate() - 1);
  }

  const completedToday = (map.get(todayKey) || 0) > 0;
  return { current, best, completedToday };
}

export async function getStreak(): Promise<{ current: number; best: number }> {
  const db = await openDb();
  await createTables(db);
  const s = await computeStreakInternal(db);
  return { current: s.current, best: s.best };
}

function milestoneReward(streak: number): number {
  if (streak === 30) return 300;
  if (streak === 14) return 100;
  if (streak === 7) return 50;
  return 0;
}

export async function logDailyProgress(date?: string): Promise<StreakInfo> {
  const db = await openDb();
  await createTables(db);
  const key = date || getTodayDateString();

  // upsert log for the day (increase count)
  await db.runAsync(`INSERT INTO habit_logs (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1`, [key]);

  // read back today's count to decide awards (only first time per day)
  const row = (await db.getFirstAsync(`SELECT count FROM habit_logs WHERE date = ?`, [key])) as { count: number } | null;
  const countToday = Number(row?.count || 0);

  const { current, best, completedToday } = await computeStreakInternal(db);

  // Base +10 only once per day; milestone only at the moment we first complete the day
  if (countToday === 1) {
    await addCoins(10);
    const bonus = milestoneReward(current);
    if (bonus > 0) await addCoins(bonus);
  }

  return { current, best, completedToday };
}

// ---- Calendar helpers for habit card ----
export type DayStatus = { date: string; day: number; isFuture: boolean; done: boolean; isToday: boolean };

export async function getTwoWeekCalendarStatus(): Promise<DayStatus[]> {
  const db = await openDb();
  await createTables(db);

  const today = new Date();
  const dow = today.getDay(); // 0 Sun..6 Sat
  const isoDow = dow === 0 ? 7 : dow; // 1..7

  // Start of current week (Mon) and previous week
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (isoDow - 1));
  const startPrevWeek = new Date(startOfWeek);
  startPrevWeek.setDate(startOfWeek.getDate() - 7);

  const days: Date[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(startPrevWeek);
    d.setDate(startPrevWeek.getDate() + i);
    days.push(d);
  }

  const keys = days.map(toDateKey);
  const placeholders = keys.map(() => '?').join(',');
  const rows = (await db.getAllAsync(
    `SELECT date, count FROM habit_logs WHERE date IN (${placeholders})`,
    keys
  )) as { date: string; count: number }[];
  const map = new Map(rows.map(r => [r.date, r.count]));

  const todayKey = toDateKey(today);

  return days.map(d => {
    const key = toDateKey(d);
    const isFuture = d > today;
    const done = (map.get(key) || 0) > 0;
    return { date: key, day: d.getDate(), isFuture, done, isToday: key === todayKey };
  });
}

// Backfill habit logs from existing transactions for the last N days
export async function backfillHabitLogs(days = 90): Promise<void> {
  const db = await openDb();
  await createTables(db);
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);

    const txs = await database.getTransactions();
    const counts = new Map<string, number>();
    for (const t of txs) {
      if (!t.date) continue;
      if (t.date >= startKey && t.date <= endKey) {
        counts.set(t.date, (counts.get(t.date) || 0) + 1);
      }
    }

    for (const [date, cnt] of counts.entries()) {
      // Upsert with max semantics to avoid lowering existing counts
      await db.runAsync(
        `INSERT INTO habit_logs (date, count) VALUES (?, ?) 
         ON CONFLICT(date) DO UPDATE SET count = CASE WHEN habit_logs.count < excluded.count THEN excluded.count ELSE habit_logs.count END`,
        [date, cnt]
      );
    }
  } catch {}
}

// ---- Rewards catalog & redeem ----
export type Reward = { code: string; name: string; cost: number };

export function getRewardCatalog(): Reward[] {
  return [
    { code: 'theme_accent', name: 'Màu nhấn mới', cost: 100 },
    { code: 'style_card', name: 'Phong cách thẻ', cost: 300 },
    { code: 'ai_tips', name: 'AI tips pack', cost: 500 },
  ];
}

export async function redeemReward(code: string): Promise<{ ok: boolean; coins: number; message?: string }>{
  const db = await openDb();
  await createTables(db);
  const catalog = new Map(getRewardCatalog().map(r => [r.code, r]));
  const item = catalog.get(code);
  if (!item) return { ok: false, coins: await getCoins(), message: 'Reward không tồn tại' };
  const current = await getCoins();
  if (current < item.cost) return { ok: false, coins: current, message: 'Không đủ xu' };
  const left = await deductCoins(item.cost);
  await db.runAsync(`INSERT INTO user_rewards (reward_code, acquired_at) VALUES (?, ?)`, [code, new Date().toISOString()]);
  return { ok: true, coins: left };
}


