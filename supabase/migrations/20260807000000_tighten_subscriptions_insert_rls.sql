-- Tighten the self-service INSERT policy on public.subscriptions so an
-- authenticated user can only create a *free bootstrap* row, never self-grant a
-- paid plan.
--
-- Context: the client (Subscription lib) only ever SELECTs this table; every
-- write — grants, status changes, addons — comes from the service-role Stripe
-- webhook. The old policy's WITH CHECK was just `auth.uid() = user_id`, so any
-- authenticated user could
--     INSERT INTO subscriptions (user_id, plan, status) VALUES (me, 'pro', 'active')
-- and unlock Pro: client entitlement (Subscription.isPro keys on plan='pro')
-- and server-side Pro gates such as tick_mission_schedules' headless-execution
-- check (plan='pro' AND status='active'). There is no UPDATE policy for the
-- authenticated role, so INSERT is the only self-grant vector; constraining the
-- inserted shape closes it. A free, non-Stripe-linked bootstrap row stays
-- allowed (it grants nothing — free is already the default).

DROP POLICY IF EXISTS "Users insert own subscription" ON public.subscriptions;

CREATE POLICY "Users insert own free subscription"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND plan = 'free'
    AND stripe_subscription_id IS NULL
  );

-- Apply-time gate: prove the permissive policy is gone and the tightened one is
-- in place with the intended INSERT/authenticated scope and predicate. Fails the
-- migration atomically on any drift.
DO $smoke$
DECLARE
  v_check text;
  v_cmd   "char";
  v_roles text[];
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.subscriptions'::regclass
      AND polname = 'Users insert own subscription'
  ), 'old permissive INSERT policy still present';

  SELECT pg_get_expr(polwithcheck, polrelid),
         polcmd,
         (SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE oid = ANY(polroles))
    INTO v_check, v_cmd, v_roles
  FROM pg_policy
  WHERE polrelid = 'public.subscriptions'::regclass
    AND polname = 'Users insert own free subscription';

  ASSERT v_check IS NOT NULL, 'tightened INSERT policy missing';
  ASSERT v_cmd = 'a', 'tightened policy is not INSERT-scoped';
  ASSERT v_roles = ARRAY['authenticated'], 'tightened policy not scoped to authenticated only';
  ASSERT v_check LIKE '%uid() = user_id%', 'WITH CHECK dropped the owner constraint';
  ASSERT v_check LIKE '%plan = ''free''::text%', 'WITH CHECK does not pin plan to free';
  ASSERT v_check LIKE '%stripe_subscription_id IS NULL%', 'WITH CHECK does not require a null stripe_subscription_id';
END $smoke$;
