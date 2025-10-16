import * as SQLite from 'expo-sqlite';
import { database, getTodayDateString } from '@/lib/database';

type StreakInfo = { current: number; best: number; completedToday: boolean };

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  // Use the same database file name as the app
  return await SQLite.openDatabaseAsync('finance_tracker.db');
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

  let current = 0;
  let best = 0;
  let consecutive = 0;
  let cursor = new Date();
  let idx = 0;
  let completedToday = false;

  const map = new Map(rows.map(r => [r.date, r.count]));
  for (let i = 0; i < 365; i++) {
    const key = toDateKey(cursor);
    const has = (map.get(key) || 0) > 0;
    if (i === 0) completedToday = has;
    if (has) {
      consecutive += 1;
      current = i === 0 ? consecutive : current; // current streak starts from today
      best = Math.max(best, consecutive);
    } else {
      // break sequence; only best might continue
      if (i === 0) {
        current = 0;
      }
      // continue scanning to compute best
      consecutive = 0;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
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

  // upsert log for the day
  await db.runAsync(`INSERT INTO habit_logs (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1`, [key]);

  const { current, best, completedToday } = await computeStreakInternal(db);

  // Award base coins once per day when completed first time
  if (completedToday) {
    // base +10 per day
    await addCoins(10);
    const bonus = milestoneReward(current);
    if (bonus > 0) await addCoins(bonus);
  }

  return { current, best, completedToday };
}


