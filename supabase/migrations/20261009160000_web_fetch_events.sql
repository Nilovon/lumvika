-- One row per page a coworker could not fetch itself and asked the app to read for it, kept to
-- diagnose failures: nothing is capped or billed from it. A fetch that worked directly never
-- reaches the app and leaves no row. Only the service role reads or writes it.

create table public.web_fetch_events (
    id bigint generated always as identity primary key,
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    -- The engine's own id for the coworker, as sent in the request: not resolved to an agents row.
    engine_agent_id text,
    url text not null,
    host text,
    -- HTTP status the box got when it fetched the page itself, null when the request never answered.
    direct_status integer,
    outcome text not null check (outcome in ('ok', 'empty', 'error')),
    -- HTTP status the scraping provider answered with, null when it could not be reached.
    provider_status integer,
    -- HTTP status the site answered to the scraping provider.
    page_status integer,
    content_chars integer not null default 0,
    duration_ms integer,
    created_at timestamptz not null default now()
);

create index web_fetch_events_workspace_created_idx on public.web_fetch_events (workspace_id, created_at desc);
create index web_fetch_events_created_idx on public.web_fetch_events (created_at desc);

alter table public.web_fetch_events enable row level security;

revoke all on table public.web_fetch_events from anon, authenticated;
-- Stated rather than left to the default privileges, which do not hand it over on every stack.
grant all on table public.web_fetch_events to service_role;
