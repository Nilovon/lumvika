-- `users.created_at` is not the signup date. Every anonymous visitor is provisioned a workspace and
-- a users row on first sight (supabase/middleware.ts), and the account dialog then upgrades that
-- same auth user in place, so the row predates the signup by however long the person browsed. There
-- is also no column telling a real account from a throwaway one: `is_anonymous` lives in auth.users,
-- which PostgREST cannot read.
--
-- This column is both at once: it is only ever stamped for a converted account, and it is stamped
-- when the conversion is first seen. Everything scheduled off "N hours after signup" anchors here.
alter table public.users add column signed_up_at timestamptz;

create index users_signed_up_idx on public.users (signed_up_at) where signed_up_at is not null;
create index users_onboarding_completed_idx on public.users (onboarding_completed_at) where onboarding_completed_at is not null;

-- Backfill: for an account that is already converted, `created_at` is the best estimate we will
-- ever have, and it is exact for anyone who signed up before anonymous sessions existed.
update public.users u
set signed_up_at = u.created_at
from auth.users a
where a.id = u.id and a.is_anonymous is not true and u.signed_up_at is null;
