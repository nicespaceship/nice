-- Bootstrap subscriptions row on auth.users insert, and allow users
-- to create their own row as a fallback for accounts that predate
-- the trigger.
--
-- Without this, `Subscription._ensureRow` silently fails under RLS
-- because the old `Users see own subscriptions` policy covers SELECT
-- only, and the new `Service role manages subscriptions` policy
-- (ALL) doesn't apply to authenticated users.

-- ─── RLS: users can insert their own row (plan/status/addons
--         default values enforced at the column level, so there's no
--         escalation path — only user_id = auth.uid() is permitted). ──

DROP POLICY IF EXISTS "Users insert own subscription" ON public.subscriptions;
CREATE POLICY "Users insert own subscription"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── Trigger: auto-create a free subscription on user signup. ──
--
-- SECURITY DEFINER so the function bypasses RLS when called from the
-- auth.users hook. Inserts ignore conflicts so idempotent re-runs are
-- safe (e.g. if a row already exists from a prior bootstrap).

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status, addons)
  VALUES (NEW.id, 'free', 'active', ARRAY[]::text[])
  ON CONFLICT (user_id) DO NOTHING;

  -- Also seed an empty token_balances row so the realtime subscription
  -- in nice.js has a target on day one.
  INSERT INTO public.token_balances (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();

-- ─── Backfill any existing auth users who are missing a
--     subscriptions row (i.e. everyone who signed up before today). ──

INSERT INTO public.subscriptions (user_id, plan, status, addons)
SELECT u.id, 'free', 'active', ARRAY[]::text[]
  FROM auth.users u
  LEFT JOIN public.subscriptions s ON s.user_id = u.id
 WHERE s.user_id IS NULL;

INSERT INTO public.token_balances (user_id)
SELECT u.id
  FROM auth.users u
  LEFT JOIN public.token_balances tb ON tb.user_id = u.id
 WHERE tb.user_id IS NULL;
