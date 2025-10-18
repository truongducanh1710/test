// Supabase Edge Function: RevenueCat webhook handler
// Syncs subscription events to entitlements with the following mapping:
// - RevenueCat app_user_id is set to Supabase auth user_id (UUID)
// - If the user currently belongs to a household → upsert household_entitlements with payer_user_id
// - If the user does NOT belong to any household → upsert user_entitlements (personal entitlement)
// - Entitlement key is fixed: 'family_pro'
// - SUPABASE_SERVICE_ROLE_KEY is available for privileged writes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RcEvent = {
  type: string;
  app_user_id?: string; // we expect this is household_id
  product_id?: string;
  entitlement_ids?: string[];
  environment?: 'SANDBOX' | 'PRODUCTION';
  period_type?: 'TRIAL' | 'INTRO' | 'NORMAL';
  purchased_at_ms?: number;
  expires_at_ms?: number | null;
  grace_period_expires_at_ms?: number | null;
  auto_renew_status?: boolean;
  [key: string]: any;
};

function msToIso(ms?: number | null): string | null {
  if (!ms && ms !== 0) return null;
  try { return new Date(ms).toISOString(); } catch { return null; }
}

function mapStatus(t: string): 'active' | 'in_grace' | 'expired' {
  const type = (t || '').toUpperCase();
  if (type === 'BILLING_ISSUE' || type === 'GRACE_PERIOD') return 'in_grace';
  if (type === 'EXPIRATION' || type === 'CANCELLATION' || type === 'REFUND') return 'expired';
  // INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, TRANSFER, others → treat as active
  return 'active';
}

function getWillRenew(ev: RcEvent): boolean {
  if (typeof ev.auto_renew_status === 'boolean') return ev.auto_renew_status;
  // Default true for active events; false for expiration/cancel
  const s = mapStatus(ev.type);
  return s === 'active';
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function getCurrentHouseholdIdForUser(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0].household_id as string;
}

async function upsertEntitlementForUser(userId: string, ev: RcEvent) {
  const status = mapStatus(ev.type);
  const period_start = msToIso(ev.purchased_at_ms) || new Date().toISOString();
  const period_end = msToIso(ev.expires_at_ms) || new Date().toISOString();
  const grace_until = msToIso(ev.grace_period_expires_at_ms);
  const will_renew = getWillRenew(ev);
  const updated_at = new Date().toISOString();

  const householdId = await getCurrentHouseholdIdForUser(userId);

  if (householdId) {
    // Upsert to household_entitlements with payer_user_id
    const { error } = await supabase
      .from('household_entitlements')
      .upsert({
        household_id: householdId,
        entitlement_key: 'family_pro',
        status,
        source: 'store',
        period_start,
        period_end,
        will_renew,
        grace_until,
        payer_user_id: userId,
        updated_at,
      }, { onConflict: 'household_id,entitlement_key' });
    if (error) throw error;

    // Expire any other household entitlements from this payer on different households
    const { error: expErr } = await supabase
      .from('household_entitlements')
      .update({ status: 'expired', will_renew: false, updated_at })
      .eq('payer_user_id', userId)
      .neq('household_id', householdId)
      .neq('status', 'expired');
    if (expErr) throw expErr;

    // Remove personal entitlement if exists
    const { error: delPersonalErr } = await supabase
      .from('user_entitlements')
      .delete()
      .eq('user_id', userId);
    if (delPersonalErr) throw delPersonalErr;
  } else {
    // No household: upsert to personal entitlement and expire household copies
    const { error } = await supabase
      .from('user_entitlements')
      .upsert({
        user_id: userId,
        entitlement_key: 'family_pro',
        status,
        source: 'store',
        period_start,
        period_end,
        will_renew,
        grace_until,
        updated_at,
      }, { onConflict: 'user_id' });
    if (error) throw error;

    const { error: expHouseholdErr } = await supabase
      .from('household_entitlements')
      .update({ status: 'expired', will_renew: false, updated_at })
      .eq('payer_user_id', userId)
      .neq('status', 'expired');
    if (expHouseholdErr) throw expHouseholdErr;
  }
}

async function handleEvent(ev: RcEvent) {
  const uid = ev.app_user_id;
  if (!uid) throw new Error('missing_app_user_id');
  await upsertEntitlementForUser(uid, ev);
}

// Optional: verify webhook signature (RevenueCat provides signature header). Add when secret available.

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // RevenueCat v2 can send single event or batch under `events`
    const events: RcEvent[] = Array.isArray(payload?.events) ? payload.events : [payload];
    for (const ev of events) {
      await handleEvent(ev);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || 'unknown_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// Deno serve
// deno-lint-ignore no-explicit-any
// @ts-ignore
Deno.serve(handler as any);




