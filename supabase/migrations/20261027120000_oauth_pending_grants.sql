-- A sign-in the iOS app started, from the moment its ticket is spent to the moment the app claims what
-- the provider handed over. The browser that runs the OAuth dance carries no session: the callback
-- parks the token here instead of writing it to the engine, and the app, authenticated as the member
-- who started it, finishes the job within ten minutes. One row per ticket: a second start on the same
-- ticket finds its row and is refused.
-- Service-role only. A row holds a provider token for a few minutes at most; it is deleted when claimed.

create table public.oauth_pending_grants (
    jti text primary key,
    agent_id text not null,
    workspace_id bigint not null,
    user_id uuid not null,
    kind text,
    payload jsonb,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index oauth_pending_grants_expires_at_idx on public.oauth_pending_grants (expires_at);

alter table public.oauth_pending_grants enable row level security;
-- RLS does not cover truncate, and Supabase's default privileges hand it to anon on every new table.
revoke all on table public.oauth_pending_grants from anon, authenticated;
