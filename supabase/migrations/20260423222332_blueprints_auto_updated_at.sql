-- blueprints.updated_at was a passive column — direct UPDATEs (e.g. via
-- the dashboard or `UPDATE ... SET config = ...`) didn't bump it, so the
-- client-side differential sync (Blueprints._diffSyncCatalog) couldn't
-- tell the row had changed. Result: a fresh maxSteps value sat in
-- Postgres but every browser kept the stale localStorage cache. The
-- Inbox Captain smoke test failed for this reason — the maxSteps=30
-- bump landed in the DB but the captain kept hitting 5 in the executor.
--
-- Auto-bump on every UPDATE so the diff sync stays correct.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blueprints_set_updated_at ON public.blueprints;

CREATE TRIGGER blueprints_set_updated_at
  BEFORE UPDATE ON public.blueprints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
