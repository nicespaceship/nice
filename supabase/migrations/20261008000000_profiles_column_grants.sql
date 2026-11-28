-- Limit what a signed-in user can write on their own profile row.
--
-- profiles carried Supabase's default table-wide INSERT and UPDATE grants,
-- so RLS ("auth.uid() = id") was the only gate and a user could set their
-- own plan, xp, achievements or stripe_customer_id. Nothing reads plan or
-- stripe_customer_id for billing (that is `subscriptions`), and the
-- guard_profile_is_admin trigger already blocks is_admin, so this is
-- defense in depth rather than a live hole.
--
-- A column-level REVOKE does nothing while a table-level grant stands, so
-- revoke the table privileges and grant back only the columns the client
-- writes: model_intel (ModelIntel), push_subscription (Notify), the
-- training_consent* trio (ConsentPrompt), plus display_name, avatar_url and
-- updated_at for profile edits.
--
-- No INSERT for clients: rows are created by the SECURITY DEFINER trigger
-- on_auth_user_created_profile. Edge functions use service_role and are
-- unaffected.

revoke insert, update on public.profiles from anon, authenticated;

grant update (
  display_name,
  avatar_url,
  model_intel,
  push_subscription,
  training_consent,
  training_consent_at,
  training_consent_version,
  updated_at
) on public.profiles to authenticated;
