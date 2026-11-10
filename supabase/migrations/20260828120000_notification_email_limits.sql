-- A schedule or a trigger that fails in a loop used to send one email per failure per workspace
-- member, with nothing in between the engine webhook and Resend. A cron firing every minute against
-- a broken model burned the reputation of the transactional domain in a night.
--
-- These two tables are the state a rate limiter needs and the hub had nowhere to keep: what was
-- already sent (the sliding window), what was held back (the digest content), and which pairs of
-- recipient and source are currently held back at all.

create type public.notification_email_status as enum ('sent', 'suppressed', 'digested');

-- One row per delivery decision, per recipient. `sent` rows are the sliding window, `suppressed`
-- rows are the pending digest, `digested` rows are its receipt. Also the first record of what
-- Rerun actually emails, which nothing tracked before.
create table public.notification_email_dispatches (
    id uuid primary key default gen_random_uuid(),
    notification_id uuid not null references public.notifications(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    workspace_id integer not null references public.workspaces(id) on delete cascade,
    -- What the caps are counted against: an agent plus what started the run, e.g.
    -- `agt_7:schedule:daily-report`. Derived hub-side so an engine that has not taken the update
    -- yet still groups correctly.
    source_key text not null,
    kind public.notification_kind not null,
    status public.notification_email_status not null,
    created_at timestamptz not null default now(),
    digested_at timestamptz
);

create index notification_email_dispatches_user_window_idx
    on public.notification_email_dispatches (user_id, created_at desc);
create index notification_email_dispatches_source_window_idx
    on public.notification_email_dispatches (user_id, source_key, created_at desc);
-- The digest claim reads this one: every pending row for a user, nothing else.
create index notification_email_dispatches_pending_idx
    on public.notification_email_dispatches (user_id, created_at)
    where status = 'suppressed';

-- An open row means "this recipient is in digest mode for this source". Held apart from the
-- dispatch window because the window forgets after 15 minutes, and a source that keeps failing
-- must not go back to one email per failure just because the last three aged out.
create table public.notification_email_suppressions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    source_key text not null,
    suppressed_at timestamptz not null default now(),
    last_event_at timestamptz not null default now(),
    released_at timestamptz
);

-- Concurrent webhooks race to open the same suppression; this makes the loser's insert fail with
-- 23505 instead of opening a second one, which would double the digest flushes.
create unique index notification_email_suppressions_active_key
    on public.notification_email_suppressions (user_id, source_key)
    where released_at is null;
-- A run that finally succeeds releases every recipient held on that source at once.
create index notification_email_suppressions_source_idx
    on public.notification_email_suppressions (source_key)
    where released_at is null;

-- Written by the service role only: these rows are delivery bookkeeping, not user-facing content,
-- and nothing in the app reads them through PostgREST. RLS with no policy denies everyone else,
-- and the revoke covers truncate, which RLS does not.
alter table public.notification_email_dispatches enable row level security;
alter table public.notification_email_suppressions enable row level security;
revoke all on table public.notification_email_dispatches from anon, authenticated;
revoke all on table public.notification_email_suppressions from anon, authenticated;
