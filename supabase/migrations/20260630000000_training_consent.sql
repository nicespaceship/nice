-- Phase 0 (NICE-1 roadmap): training-data consent.
-- Opt-in, global, all users from day one. No interaction is captured for model
-- training until the user turns this on. nice-ai enforces this server-side on
-- every call; the client flag is a convenience mirror, never the source of truth.
-- See docs/nice-1-phase0-spec.md.

alter table public.profiles
  add column if not exists training_consent boolean not null default false,
  add column if not exists training_consent_at timestamptz,
  add column if not exists training_consent_version text;

comment on column public.profiles.training_consent is
  'Opt-in: user permits NICE to learn from their interactions to train NICE-owned models. Enforced server-side in nice-ai.';
comment on column public.profiles.training_consent_at is
  'Timestamp the current consent state was set.';
comment on column public.profiles.training_consent_version is
  'ToS/privacy policy version in force when consent was granted; enables a clean re-prompt on policy change.';
