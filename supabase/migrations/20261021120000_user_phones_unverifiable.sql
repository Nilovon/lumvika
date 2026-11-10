-- A number whose country no code reaches (lib/phone/reach.ts, or a country Bird Verify refuses) is
-- kept unverified: the account enters the app, and the getting-started checklist counts the step done.
-- skipped_at is written beside it, so the phone wall opens as it does for a skip.

alter table public.user_phones add column if not exists unverifiable_at timestamptz;
