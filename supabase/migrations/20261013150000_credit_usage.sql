-- What the billing dialog shows of the Rerun credit: where it went, by day, by source and by coworker.

-- The engine's own id for the coworker that made the call, as the box sends it in x-rerun-agent:
-- null on every row written before the box sent it.
alter table public.rerun_usage_events add column if not exists engine_agent_id text;

-- Whether the call was taken off the workspace's credit. The onboarding foreman is logged for the
-- admin stats but on the house, and nothing else told its rows apart from a billed Smart call.
alter table public.rerun_usage_events add column if not exists billed boolean not null default true;

-- The credit spent since p_since, one row per UTC day, kind (ai, data), source (the model tier, or
-- the paid data capability without its provider prefix) and coworker. A paid data call nobody was
-- charged for is left out, it spent nothing.
create or replace function public.rerun_credit_usage(p_workspace_id bigint, p_since timestamptz)
returns table (day date, kind text, source text, engine_agent_id text, micros bigint, calls bigint)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        (u.created_at at time zone 'UTC')::date as day,
        'ai' as kind,
        coalesce(u.tier, 'balanced') as source,
        u.engine_agent_id,
        sum(u.cost_micros)::bigint as micros,
        count(*) as calls
    from public.rerun_usage_events u
    where u.workspace_id = p_workspace_id and u.created_at >= p_since and u.billed
    group by 1, 3, 4
    union all
    select
        (p.created_at at time zone 'UTC')::date as day,
        'data' as kind,
        regexp_replace(p.capability, '^treg\.', '') as source,
        p.engine_agent_id,
        sum(p.billed_micros)::bigint as micros,
        count(*) as calls
    from public.paid_data_events p
    where p.workspace_id = p_workspace_id and p.created_at >= p_since and p.billed_micros > 0
    group by 1, 3, 4
$$;

-- Read by the hub with the service role only, after it has checked the caller belongs to the workspace.
revoke execute on function public.rerun_credit_usage(bigint, timestamptz) from public, anon, authenticated;
