-- Migration: Family Households + RLS + RPC
-- Run this in Supabase SQL Editor

-- 1) Create households table
CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Create household_members table
CREATE TABLE IF NOT EXISTS public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, user_id)
);

-- 3) Create household_invites table
CREATE TABLE IF NOT EXISTS public.household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  single_use BOOLEAN DEFAULT true,
  used_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Add columns to transactions (if not exists)
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'VND' CHECK (char_length(currency) BETWEEN 3 AND 5);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_household ON public.transactions(household_id);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON public.transactions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user ON public.household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON public.household_members(household_id);

-- 5) RLS Policies

-- Enable RLS
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

-- Households: members can SELECT
CREATE POLICY households_select_policy ON public.households
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members
      WHERE household_members.household_id = households.id
        AND household_members.user_id = auth.uid()
    )
  );

-- Households: creator can INSERT
CREATE POLICY households_insert_policy ON public.households
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Household_members: users can SELECT their own memberships
CREATE POLICY household_members_select_policy ON public.household_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Household_invites: members can SELECT for their household
CREATE POLICY household_invites_select_policy ON public.household_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members
      WHERE household_members.household_id = household_invites.household_id
        AND household_members.user_id = auth.uid()
    )
  );

-- Transactions: modified RLS for household + privacy
-- Users can SELECT their own transactions OR non-private transactions in their household
CREATE POLICY transactions_select_policy ON public.transactions
  FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR (
      is_private = false
      AND household_id IN (
        SELECT household_id FROM public.household_members
        WHERE user_id = auth.uid()
      )
    )
    OR (
      household_id IN (
        SELECT household_id FROM public.household_members
        WHERE user_id = auth.uid()
      )
      AND is_private = true
      AND owner_user_id = auth.uid()
    )
  );

-- Transactions: users can INSERT if they're a member and owner matches
CREATE POLICY transactions_insert_policy ON public.transactions
  FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      household_id IS NULL
      OR household_id IN (
        SELECT household_id FROM public.household_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Transactions: only owner can UPDATE/DELETE
CREATE POLICY transactions_update_policy ON public.transactions
  FOR UPDATE
  USING (owner_user_id = auth.uid());

CREATE POLICY transactions_delete_policy ON public.transactions
  FOR DELETE
  USING (owner_user_id = auth.uid());

-- 6) RPC Functions

-- RPC: create_household_invite
CREATE OR REPLACE FUNCTION public.create_household_invite(p_household_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_token_hash TEXT;
  v_expires_at TIMESTAMPTZ;
  v_invite_id UUID;
  v_url TEXT;
BEGIN
  -- Check membership
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this household';
  END IF;

  -- Generate random token (32 chars)
  v_token := encode(gen_random_bytes(24), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '7 days';

  -- Insert invite
  INSERT INTO public.household_invites (household_id, token_hash, expires_at, created_by)
  VALUES (p_household_id, v_token_hash, v_expires_at, auth.uid())
  RETURNING id INTO v_invite_id;

  -- Build URL (adjust scheme for production)
  v_url := 'test://join?hid=' || p_household_id::text || '&t=' || v_token;

  RETURN json_build_object('url', v_url, 'token', v_token, 'expires_at', v_expires_at);
END;
$$;

-- RPC: accept_household_invite
CREATE OR REPLACE FUNCTION public.accept_household_invite(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash TEXT;
  v_invite RECORD;
  v_household_id UUID;
BEGIN
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- Find invite
  SELECT * INTO v_invite
  FROM public.household_invites
  WHERE token_hash = v_token_hash
    AND expires_at > now()
    AND (NOT single_use OR used_at IS NULL);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  v_household_id := v_invite.household_id;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = v_household_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('household_id', v_household_id, 'already_member', true);
  END IF;

  -- Ensure authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Add member (idempotent)
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, auth.uid(), 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  -- Mark invite as used if single_use
  IF v_invite.single_use THEN
    UPDATE public.household_invites
    SET used_at = now()
    WHERE id = v_invite.id;
  END IF;

  RETURN json_build_object('household_id', v_household_id, 'already_member', false);
END;
$$;

-- RPC: household_monthly_totals (for shared reports)
CREATE OR REPLACE FUNCTION public.household_monthly_totals(p_household_id UUID, p_start DATE, p_end DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Check membership
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this household';
  END IF;

  -- Aggregate all transactions (including private) for household members
  SELECT json_build_object(
    'total_income', COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0),
    'total_expense', COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0),
    'transaction_count', COUNT(*)
  ) INTO v_result
  FROM public.transactions
  WHERE household_id = p_household_id
    AND date >= p_start
    AND date <= p_end;

  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_household_invite TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_household_invite TO authenticated;
GRANT EXECUTE ON FUNCTION public.household_monthly_totals TO authenticated;

-- RPC: delete_household (only creator or admin can delete)
CREATE OR REPLACE FUNCTION public.delete_household(p_household_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Require login
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Permission check: creator OR admin member
  IF NOT (
    EXISTS (SELECT 1 FROM public.households WHERE id = p_household_id AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.household_members
      WHERE household_id = p_household_id AND user_id = auth.uid() AND role = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Delete household (CASCADE cleans members/invites; transactions set household_id to NULL)
  DELETE FROM public.households WHERE id = p_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_household TO authenticated;
