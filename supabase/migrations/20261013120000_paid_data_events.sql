-- One row per paid data call a coworker makes through the app (leads, Google SERP, Google Maps),
-- served by Treg and billed on the workspace's Rerun credit. The record of what Treg charged us
-- and what we billed for it. Only the service role reads or writes it.

create table public.paid_data_events (
    id bigint generated always as identity primary key,
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    -- The engine's own id for the coworker, as sent in the request: not resolved to an agents row.
    engine_agent_id text,
    tool text not null,
    capability text not null,
    -- The provider Treg routed the call to, null when no provider served it.
    served_by text,
    outcome text not null check (outcome in ('ok', 'miss', 'pending', 'error')),
    provider_cost_micros bigint not null default 0,
    billed_micros bigint not null default 0,
    -- HTTP status Treg answered with, null when it could not be reached.
    treg_status integer,
    treg_call_id text,
    duration_ms integer,
    created_at timestamptz not null default now()
);

create index paid_data_events_workspace_created_idx on public.paid_data_events (workspace_id, created_at desc);
create index paid_data_events_created_idx on public.paid_data_events (created_at desc);

alter table public.paid_data_events enable row level security;

revoke all on table public.paid_data_events from anon, authenticated;
-- Stated rather than left to the default privileges, which do not hand it over on every stack.
grant all on table public.paid_data_events to service_role;
