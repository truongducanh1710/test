import { database } from '@/lib/database';

export async function buildFinanceContext90d() {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  const toStr = (d: Date) => d.toISOString().slice(0, 10);

  const [totals, byCat, loans, recentLoans] = await Promise.all([
    database.getTotalsByType(toStr(start), toStr(end)),
    database.getTransactionsByCategory('expense', toStr(start), toStr(end)),
    database.getLoansSummary(),
    database.getRecentLoans(3),
  ]);

  return {
    range: { start: toStr(start), end: toStr(end) },
    totals,
    byCat,
    loans,
    recentLoans,
    generatedAt: new Date().toISOString(),
  };
}


