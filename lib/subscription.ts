import { getSupabase } from '@/lib/auth';

export type EntitlementStatus = 'active' | 'in_grace' | 'expired';

export interface HouseholdEntitlement {
  household_id: string;
  entitlement_key: 'family_pro';
  status: EntitlementStatus;
  source: 'store' | 'trial';
  period_start: string;
  period_end: string;
  will_renew: boolean;
  grace_until: string | null;
  updated_at: string;
}

export interface AiQuotaResult {
  allowed: boolean;
  remaining: number;
  quota: number;
  used: number;
  reason?: string;
}

export async function getEntitlement(householdId: string): Promise<HouseholdEntitlement | { entitlement_key: 'family_pro'; status: 'expired' }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await sb.rpc('get_household_entitlement', { p_household_id: householdId });
  if (error) throw error;
  return data as HouseholdEntitlement | { entitlement_key: 'family_pro'; status: 'expired' };
}

export async function startTrial(householdId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { error } = await sb.rpc('start_household_trial', { p_household_id: householdId });
  if (error) throw error;
}

export async function useAiQuota(householdId: string, feature: 'ai_advisor' = 'ai_advisor'): Promise<AiQuotaResult> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await sb.rpc('use_ai_quota', { p_household_id: householdId, p_feature: feature });
  if (error) throw error;
  return data as AiQuotaResult;
}

export function isPro(ent: HouseholdEntitlement | { entitlement_key: 'family_pro'; status: 'expired' } | null | undefined): boolean {
  if (!ent) return false;
  // minimal helper for gating
  // @ts-ignore
  return ent.status === 'active' || ent.status === 'in_grace';
}

export async function assertHouseholdNotPro(householdId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase chưa được cấu hình');
  const { error } = await sb.rpc('assert_household_not_pro', { p_household_id: householdId });
  if (error) throw error;
}




