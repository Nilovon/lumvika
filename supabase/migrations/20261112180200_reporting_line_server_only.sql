-- The reporting line, a coworker's title and its monthly budget are written by the server alone
-- (`setCoworkerReporting`, after its checks), and the browser writes none of them. Two holes closed:
--
-- 1. `agents_check_reporting_line` ran as the caller, so its walk up the line saw only the coworkers
--    the caller's RLS let through: a loop through a coworker of a hidden Box went unnoticed. It now
--    runs as its owner, with the same fixed search_path, and sees the whole workspace.
-- 2. `authenticated` (and `anon`) held UPDATE on the whole `agents` table, those three columns
--    included, so PostgREST could store a line the server never checked. UPDATE is now granted
--    column by column, every column but those three, so what the board writes (position, Box,
--    name...) keeps working. A column added later is not writable by the browser until granted.
--
-- Push order: after 20261110120100_org_chart, with or after the code that moved those writes to
-- the server (already the case on this branch). Re-runnable.

create or replace function public.agents_check_reporting_line()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    manager_workspace_id bigint;
    closes_a_cycle boolean;
begin
    if new.reports_to_agent_id is null then
        return new;
    end if;
    if new.reports_to_agent_id = new.id then
        raise exception 'agents_reports_to_self: an agent cannot report to itself' using errcode = 'check_violation';
    end if;
    select a.workspace_id into manager_workspace_id from public.agents a where a.id = new.reports_to_agent_id;
    if manager_workspace_id is distinct from new.workspace_id then
        raise exception 'agents_reports_to_other_workspace: the manager belongs to another workspace' using errcode = 'check_violation';
    end if;
    -- Two moves that each look fine alone (A under B, B under A) are serialized per workspace.
    perform pg_advisory_xact_lock(hashtext('agents_reporting_line'), new.workspace_id::int);
    with recursive chain (id, reports_to_agent_id, depth) as (
        select a.id, a.reports_to_agent_id, 1 from public.agents a where a.id = new.reports_to_agent_id
        union all
        select a.id, a.reports_to_agent_id, c.depth + 1
        from public.agents a join chain c on a.id = c.reports_to_agent_id
        where c.depth < 1000
    )
    select exists (select 1 from chain where chain.id = new.id) into closes_a_cycle;
    if closes_a_cycle then
        raise exception 'agents_reports_to_cycle: this reporting line would loop back to the agent' using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

revoke all on function public.agents_check_reporting_line() from public, anon, authenticated;

do $$
declare
    writable text;
    browser_role text;
begin
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into writable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'agents'
      and column_name not in ('reports_to_agent_id', 'title', 'monthly_budget_micros');
    foreach browser_role in array array['anon', 'authenticated'] loop
        execute format('revoke update on public.agents from %I', browser_role);
        execute format('grant update (%s) on public.agents to %I', writable, browser_role);
    end loop;
end $$;
