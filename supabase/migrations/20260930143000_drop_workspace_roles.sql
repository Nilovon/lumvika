-- Every member of a workspace holds the same rights: the owner / builder / viewer split is gone.
-- When one person has to stand for the workspace (billing mail, API key actor), the code takes the
-- earliest member by created_at.
--
-- Push after the code that stopped reading and writing `role` is live on staging and prod.

alter table public.workspace_members drop column role;
alter table public.workspace_invitations drop column role;

-- Recreated because it copied `role`; it also still wrote workspaces.max_spaces, dropped by
-- 20260922150000_workspace_engine_contract.
create or replace function public.split_box_into_workspace(
    p_space_id uuid,
    p_name text,
    p_icon_url text,
    p_max_agents integer
) returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_space public.spaces%rowtype;
    v_from public.workspaces%rowtype;
    v_new bigint;
    v_dc integer;
    v_dr integer;
    v_seats integer;
    v_moved jsonb;
begin
    select * into v_space from public.spaces where id = p_space_id for update;
    if not found then raise exception 'space % not found', p_space_id; end if;

    select to_workspace_id into v_new from public.workspace_split_log where space_id = p_space_id;
    if v_new is not null then return v_new; end if;

    select * into v_from from public.workspaces where id = v_space.workspace_id for update;
    if v_from.is_sandbox then raise exception 'workspace % is a sandbox', v_from.id; end if;
    if (select count(*) from public.spaces where workspace_id = v_from.id) < 2 then
        raise exception 'workspace % holds a single Box', v_from.id;
    end if;

    select count(*) into v_seats from public.workspace_members where workspace_id = v_from.id;

    v_dc := -least(v_space.col_start, v_space.col_end);
    v_dr := -least(v_space.row_start, v_space.row_end);

    insert into public.workspaces (
        name, icon_url, plan, is_sandbox, max_agents, max_seats,
        model_access, custom_integrations, subscription_status, trial_ends_at,
        first_paid_at, boxes_disabled_at, rerun_budget_micros, rerun_used_micros,
        rerun_topup_micros, rerun_period_anchor
    ) values (
        left(p_name, 60), p_icon_url, v_from.plan, false, greatest(p_max_agents, 3), greatest(v_seats, 1),
        v_from.model_access, v_from.custom_integrations, 'active', v_from.trial_ends_at,
        v_from.first_paid_at, v_from.boxes_disabled_at, 5000000, 0,
        0, now()
    ) returning id into v_new;

    insert into public.workspace_members (user_id, workspace_id, created_at)
        select user_id, v_new, created_at from public.workspace_members where workspace_id = v_from.id;

    update public.agents
       set workspace_id = v_new,
           col = case when col > -100000 then col + v_dc else col end,
           row = case when col > -100000 then row + v_dr else row end
     where space_id = p_space_id;

    update public.notifications set workspace_id = v_new where space_id = p_space_id;
    update public.published_files set workspace_id = v_new where space_id = p_space_id;
    update public.rerun_usage_events set workspace_id = v_new where space_id = p_space_id;
    update public.agent_shares set workspace_id = v_new
     where source_agent_id in (select id from public.agents where space_id = p_space_id);

    v_moved := jsonb_build_object(
        'agents', (select count(*) from public.agents where space_id = p_space_id),
        'notifications', (select count(*) from public.notifications where space_id = p_space_id),
        'published_files', (select count(*) from public.published_files where space_id = p_space_id),
        'usage_events', (select count(*) from public.rerun_usage_events where space_id = p_space_id),
        'members', v_seats
    );

    update public.spaces
       set workspace_id = v_new,
           col_start = col_start + v_dc, col_end = col_end + v_dc,
           row_start = row_start + v_dr, row_end = row_end + v_dr
     where id = p_space_id;

    insert into public.workspace_split_log (space_id, from_workspace_id, to_workspace_id, col_delta, row_delta, moved)
    values (p_space_id, v_from.id, v_new, v_dc, v_dr, v_moved);

    return v_new;
end $$;

revoke all on function public.split_box_into_workspace(uuid, text, text, integer) from public;

drop type public.workspace_role;
