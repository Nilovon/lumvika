-- One workspace is about to mean one machine. Every workspace that holds several Boxes has to be
-- cut into one workspace per Box first, and no Box moves: each one keeps the engine it already
-- runs on, its key, its agents and their folders. So the whole operation is a re-pointing of
-- Supabase rows, and nothing on any VPS is touched.
--
-- The function is the transaction boundary: PostgREST cannot run several statements in one, and
-- there is no exec_sql RPC here, so a script that did this in pieces could leave a Box half moved.
-- apps/ui/scripts/split-multi-box-workspaces.ts drives it, one call per Box.

-- Which Box went where, with the deltas its board rect and its agents were translated by. It is
-- the idempotency key (a Box already split returns its workspace instead of splitting twice), the
-- ledger `unsplit_box` reads to undo one, and the answer to "which workspaces belong to this
-- payer" once the children carry no Stripe subscription of their own.
create table public.workspace_split_log (
    id bigint generated always as identity primary key,
    space_id uuid not null references public.spaces(id) on delete cascade,
    from_workspace_id bigint not null references public.workspaces(id) on delete cascade,
    to_workspace_id bigint not null references public.workspaces(id) on delete cascade,
    col_delta integer not null,
    row_delta integer not null,
    moved jsonb not null,
    created_at timestamptz not null default now(),
    unique (space_id)
);

-- RLS comes on through rls_auto_enable; no policy on purpose, this is service-role only.
revoke all on table public.workspace_split_log from anon, authenticated;

create function public.split_box_into_workspace(
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

    -- A Box can sit at negative columns, so the rebase is driven by the smaller edge, not by
    -- col_start. Landing at (0,0) puts the Box exactly where findFreeRect puts the first Box of a
    -- fresh workspace, which is what the board's camera expects.
    v_dc := -least(v_space.col_start, v_space.col_end);
    v_dr := -least(v_space.row_start, v_space.row_end);

    -- No stripe_customer_id: findWorkspaceId falls back to a maybeSingle() on that column, and two
    -- rows carrying the same customer would resolve every webhook without a workspace_id in its
    -- metadata to nothing, silently, for the parent that pays.
    -- first_paid_at is copied on purpose: it is the teardown's hard guardrail, a workspace that
    -- carries it can only ever be disabled, never deleted.
    insert into public.workspaces (
        name, icon_url, plan, is_sandbox, max_agents, max_spaces, max_seats,
        model_access, custom_integrations, subscription_status, trial_ends_at,
        first_paid_at, boxes_disabled_at, rerun_budget_micros, rerun_used_micros,
        rerun_topup_micros, rerun_period_anchor
    ) values (
        left(p_name, 60), p_icon_url, v_from.plan, false, greatest(p_max_agents, 3), 1, greatest(v_seats, 1),
        v_from.model_access, v_from.custom_integrations, 'active', v_from.trial_ends_at,
        v_from.first_paid_at, v_from.boxes_disabled_at, 5000000, 0,
        0, now()
    ) returning id into v_new;

    -- Copied, not moved: taking a member out of the parent would lock them out of the Box that stays.
    insert into public.workspace_members (user_id, workspace_id, role)
        select user_id, v_new, role from public.workspace_members where workspace_id = v_from.id;

    -- UNPLACED_COL is -100000 and isPlaced() reads `col > UNPLACED_COL`: translating an unplaced
    -- agent would make it look placed, 100 000 cells off the board. Both columns are guarded on
    -- the same predicate, because a placed agent can legitimately sit at a negative row.
    update public.agents
       set workspace_id = v_new,
           col = case when col > -100000 then col + v_dc else col end,
           row = case when col > -100000 then row + v_dr else row end
     where space_id = p_space_id;

    update public.notifications set workspace_id = v_new where space_id = p_space_id;
    update public.published_files set workspace_id = v_new where space_id = p_space_id;
    -- rerun_usage_events has no foreign key on space_id and holds rows pointing at long-deleted
    -- Boxes; the ones with a null space_id cannot be attributed and stay with the parent.
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

-- The mirror, exact because the deltas were journalled.
create function public.unsplit_box(p_space_id uuid) returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_log public.workspace_split_log%rowtype;
begin
    select * into v_log from public.workspace_split_log where space_id = p_space_id for update;
    if not found then raise exception 'space % was never split', p_space_id; end if;

    update public.spaces
       set workspace_id = v_log.from_workspace_id,
           col_start = col_start - v_log.col_delta, col_end = col_end - v_log.col_delta,
           row_start = row_start - v_log.row_delta, row_end = row_end - v_log.row_delta
     where id = p_space_id;

    update public.agents
       set workspace_id = v_log.from_workspace_id,
           col = case when col > -100000 then col - v_log.col_delta else col end,
           row = case when col > -100000 then row - v_log.row_delta else row end
     where space_id = p_space_id;

    update public.notifications set workspace_id = v_log.from_workspace_id where space_id = p_space_id;
    update public.published_files set workspace_id = v_log.from_workspace_id where space_id = p_space_id;
    update public.rerun_usage_events set workspace_id = v_log.from_workspace_id where space_id = p_space_id;
    update public.agent_shares set workspace_id = v_log.from_workspace_id
     where source_agent_id in (select id from public.agents where space_id = p_space_id);

    delete from public.workspace_split_log where space_id = p_space_id;
    delete from public.workspace_members where workspace_id = v_log.to_workspace_id;
    delete from public.workspaces where id = v_log.to_workspace_id;

    return v_log.from_workspace_id;
end $$;

-- A security definer function is executable by PUBLIC unless it is taken back.
revoke all on function public.split_box_into_workspace(uuid, text, text, integer) from public;
revoke all on function public.unsplit_box(uuid) from public;
