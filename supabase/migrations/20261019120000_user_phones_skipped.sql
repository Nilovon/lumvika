-- The phone step of a web signup can be skipped: the account enters the app without a number, and
-- the getting-started checklist asks for it instead. A skipped row owes nothing, like a verified one.

alter table public.user_phones add column if not exists skipped_at timestamptz;
