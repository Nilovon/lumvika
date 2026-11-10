-- A notification reaches someone twice when they already have the app open: the toast fires on the
-- realtime insert, and the hub emails the same thing seconds later. The hub had no way to know, so
-- it always emailed: the only presence in the codebase lives in the cursors realtime channel, which
-- a webhook cannot read.

-- One row per user, written by the heartbeat the app beats while its tab is in the foreground.
-- Deliberately kept out of the supabase_realtime publication, and deliberately not a column on
-- `users`: SessionProvider subscribes to that row and refetches the workspace whenever it changes,
-- so a beat every 30 seconds would replay that query in every open tab.
create table public.user_presence (
    user_id uuid primary key references public.users(id) on delete cascade,
    last_seen_at timestamptz not null default now()
) with (fillfactor = 70);

-- Same reasoning as the email limiter tables: delivery bookkeeping the browser has no business
-- writing, and reading someone else's presence is not something the app ever asks for.
alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;

-- An email skipped because the recipient was looking at the app. Inert for the limiter, which counts
-- only `sent` rows for the window and claims only `suppressed` ones for the digest; it exists so
-- "why did I never get that email" has an answer.
alter type public.notification_email_status add value if not exists 'skipped';
