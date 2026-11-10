-- One-time tokens that let a server attach itself to a workspace (Settings › Servers): the app shows
-- a `docker run` command carrying the token, the engine posts it back to /api/engines/pair with the
-- key it generated for itself. Only the hash of a token is kept. Service role only, like engine_pool.
create table if not exists public.engine_pairing_tokens (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces (id) on delete cascade,
    token_hash text not null unique,
    created_by uuid references auth.users (id) on delete set null,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists engine_pairing_tokens_workspace_id_idx on public.engine_pairing_tokens (workspace_id);

alter table public.engine_pairing_tokens enable row level security;

revoke all on table public.engine_pairing_tokens from anon, authenticated;
