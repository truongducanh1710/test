import * as SQLite from 'expo-sqlite';
import { database, getTodayDateString } from '@/lib/database';

type StreakInfo = { current: number; best: number; completedToday: boolean };

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const file = await (await import('@/lib/user')).getUserDbFileName();
  return await SQLite.openDatabaseAsync(file);
}

async function createTables(db: SQLite.SQLiteDatabase) {
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

// ----- Coins helpers -----
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

// ----- Streak + calendar from transactions -----
function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

async function getTxDatesSet(rangeDays: number): Promise<Set<string>> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - rangeDays + 1);
  const startKey = toDateKeyLocal(start);
  const endKey = toDateKeyLocal(end);
  const txs = await database.getTransactions();
  const set = new Set<string>();
  for (const t of txs) {
    if (!t.date) continue;
    if (t.date >= startKey && t.date <= endKey) set.add(t.date);
  }
  return set;
}

export async function getStreak(): Promise<{ current: number; best: number }> {
  const txSet = await getTxDatesSet(365);
  // current streak
  let current = 0;
  let cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = toDateKeyLocal(cursor);
    if (txSet.has(key)) current += 1; else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  // best streak
  let best = 0,
      run = 0;
  const scan = new Date();
  for (let i = 0; i < 365; i++) {
    const key = toDateKeyLocal(scan);
    if (txSet.has(key)) { run += 1; best = Math.max(best, run); } else { run = 0; }
    scan.setDate(scan.getDate() - 1);
  }
  return { current, best };
}

function milestoneReward(streak: number): number {
  if (streak === 30) return 300;
  if (streak === 14) return 100;
  if (streak === 7) return 50;
  return 0;
}

export async function logDailyProgress(date?: string): Promise<StreakInfo> {
  const todayKey = date || getTodayDateString();
  // Count transactions today to decide awards (first tx of the day)
  const txs = await database.getTransactions();
  const countToday = txs.filter(t => t.date === todayKey).length;
  const { current, best } = await getStreak();
  const completedToday = countToday > 0;
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

  const startKey = toDateKeyLocal(startPrevWeek);
  const endKey = toDateKeyLocal(today);
  const txs = await database.getTransactions();
  const set = new Set<string>();
  for (const t of txs) {
    if (!t.date) continue;
    if (t.date >= startKey && t.date <= endKey) set.add(t.date);
  }

  const todayKey = toDateKeyLocal(today);
  return days.map(d => {
    const key = toDateKeyLocal(d);
    const isFuture = d > today;
    const done = set.has(key);
    return { date: key, day: d.getDate(), isFuture, done, isToday: key === todayKey };
  });
}

// Backfill is no longer needed when deriving from transactions
export async function backfillHabitLogs(_days = 90): Promise<void> {
  return;
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


