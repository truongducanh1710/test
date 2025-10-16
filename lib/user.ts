import { getCurrentUser } from '@/lib/auth';

export async function getActiveUserId(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getUserDbFileName(): Promise<string> {
  const uid = (await getActiveUserId()) || 'anonymous';
  return `finance_${uid}.db`;
}

export async function nsKey(baseKey: string): Promise<string> {
  const uid = (await getActiveUserId()) || 'anonymous';
  return `uid:${uid}:${baseKey}`;
}
