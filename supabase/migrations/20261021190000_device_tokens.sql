-- The iOS app. A notification reaches the web through Realtime and a toast, which needs a tab open. A
-- push is the only channel that reaches someone away from a computer: a coworker stopped on a
-- question stays stopped until a human answers.

create table if not exists public.device_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    -- The Expo push token, not the raw APNs one: Expo holds the APNs credentials. Unique because the
    -- same device reinstalling gets the same token back and must not be pushed to twice.
    token text not null unique,
    platform text not null,
    app_version text,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    revoked_at timestamptz
);

create index if not exists device_tokens_user_active_idx on public.device_tokens (user_id) where revoked_at is null;

-- RLS on with no policy, as api_keys: unreachable from PostgREST. Only the service-role paths behind
-- /api/v1/me/devices and the push dispatcher touch it.
alter table public.device_tokens enable row level security;

-- The cap that keeps a failing cron from draining a battery. Not the email incidents: a push over the
-- cap is dropped, never batched into a digest.
create table if not exists public.notification_push_dispatches (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    source_key text not null,
    created_at timestamptz not null default now()
);

create index if not exists notification_push_dispatches_user_window_idx on public.notification_push_dispatches (user_id, created_at desc);

alter table public.notification_push_dispatches enable row level security;
