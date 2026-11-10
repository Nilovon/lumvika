-- One row per web search a coworker runs through the app, kept to diagnose failures: nothing is
-- capped or billed from it. Only the service role reads or writes it.

create table public.web_search_events (
    id bigint generated always as identity primary key,
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    -- The engine's own id for the coworker, as sent in the request: not resolved to an agents row.
    engine_agent_id text,
    query text not null,
    outcome text not null check (outcome in ('ok', 'empty', 'error')),
    result_count integer not null default 0,
    -- HTTP status the search provider answered with, null when it could not be reached.
    provider_status integer,
    duration_ms integer,
    created_at timestamptz not null default now()
);

create index web_search_events_workspace_created_idx on public.web_search_events (workspace_id, created_at desc);
create index web_search_events_created_idx on public.web_search_events (created_at desc);

alter table public.web_search_events enable row level security;

revoke all on table public.web_search_events from anon, authenticated;
-- Stated rather than left to the default privileges, which do not hand it over on every stack.
grant all on table public.web_search_events to service_role;
