-- L'onboarding devient un fait du workspace : il se fait une fois, à sa création, et un membre
-- invité ensuite n'y passe jamais. Jusqu'ici le stamp et le profil Steward vivaient sur `users`,
-- alors que la phase du Steward se calcule par workspace : un invité dans un workspace déjà lancé
-- restait « pas onboardé » pour toujours, et ses liens `?template=` restaient parkés sans fin.
--
-- `onboarded_at` va sur `workspaces` (petit, déjà dans le realtime de la session). Le profil va
-- dans sa propre table, hors realtime : la publication pousse la ligne `workspaces` entière à
-- chaque update, et le plan + les besoins pèsent plusieurs Ko.
--
-- Backfill = l'état actuel à l'identique : chaque workspace reprend le stamp et les réponses de
-- son fondateur (le membre le plus ancien, même règle que workspaceFounderUserId).
--
-- Expand seulement : les colonnes `users.onboarding_*` restent jusqu'à la migration de drop.
-- À pousser AVANT le code qui lit `workspaces.onboarded_at`.

alter table public.workspaces add column onboarded_at timestamp with time zone;

create index workspaces_onboarded_at_idx on public.workspaces (onboarded_at) where onboarded_at is not null;

create table public.workspace_onboarding (
    workspace_id bigint not null,
    answers jsonb not null default '{}'::jsonb,
    updated_at timestamp with time zone not null default now()
);

alter table public.workspace_onboarding enable row level security;

alter table public.workspace_onboarding add constraint workspace_onboarding_pkey primary key (workspace_id);
alter table public.workspace_onboarding add constraint workspace_onboarding_workspace_id_fkey
    foreign key (workspace_id) references public.workspaces(id) on delete cascade;

revoke all on table public.workspace_onboarding from anon, authenticated;
grant select on table public.workspace_onboarding to authenticated;

create policy "Members read their workspace onboarding"
on public.workspace_onboarding
as permissive
for select
to authenticated
using ((workspace_id in (select public.current_workspace_ids() as current_workspace_ids)));

with founders as (
    select distinct on (m.workspace_id) m.workspace_id, m.user_id
    from public.workspace_members m
    order by m.workspace_id, m.created_at
)
update public.workspaces w
   set onboarded_at = u.onboarding_completed_at
  from founders f
  join public.users u on u.id = f.user_id
 where w.id = f.workspace_id
   and u.onboarding_completed_at is not null;

-- Un sandbox n'a pas d'onboarding : le tunnel n'y tourne jamais, donc rien ne le stamperait.
update public.workspaces set onboarded_at = created_at where is_sandbox and onboarded_at is null;

-- Un workspace qui tourne déjà (abonné, en trial, ou qui a des agents) est `companion` pour le
-- Steward, qui ne lancera jamais son tunnel : sans stamp, ses liens `?template=` resteraient
-- parkés pour toujours. Même règle que stewardPhase, que le code applique aussi au fil de l'eau.
update public.workspaces w
   set onboarded_at = w.created_at
 where w.onboarded_at is null
   and (w.subscription_status in ('active', 'trialing', 'past_due')
        or exists (select 1 from public.agents a where a.workspace_id = w.id));

with founders as (
    select distinct on (m.workspace_id) m.workspace_id, m.user_id
    from public.workspace_members m
    order by m.workspace_id, m.created_at
)
insert into public.workspace_onboarding (workspace_id, answers)
select f.workspace_id, u.onboarding_answers
  from founders f
  join public.users u on u.id = f.user_id
 where u.onboarding_answers is not null
   and jsonb_typeof(u.onboarding_answers) = 'object';

-- Recréée pour que le workspace issu d'un split garde l'onboarding de sa source : sans ça, ses
-- membres retomberaient dans le tunnel d'un workspace qui tourne déjà.
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
        first_paid_at, boxes_disabled_at, lumvika_budget_micros, lumvika_used_micros,
        lumvika_topup_micros, lumvika_period_anchor, onboarded_at
    ) values (
        left(p_name, 60), p_icon_url, v_from.plan, false, greatest(p_max_agents, 3), greatest(v_seats, 1),
        v_from.model_access, v_from.custom_integrations, 'active', v_from.trial_ends_at,
        v_from.first_paid_at, v_from.boxes_disabled_at, 5000000, 0,
        0, now(), v_from.onboarded_at
    ) returning id into v_new;

    insert into public.workspace_members (user_id, workspace_id, created_at)
        select user_id, v_new, created_at from public.workspace_members where workspace_id = v_from.id;

    insert into public.workspace_onboarding (workspace_id, answers)
        select v_new, answers from public.workspace_onboarding where workspace_id = v_from.id;

    update public.agents
       set workspace_id = v_new,
           col = case when col > -100000 then col + v_dc else col end,
           row = case when col > -100000 then row + v_dr else row end
     where space_id = p_space_id;

    update public.notifications set workspace_id = v_new where space_id = p_space_id;
    update public.published_files set workspace_id = v_new where space_id = p_space_id;
    update public.lumvika_usage_events set workspace_id = v_new where space_id = p_space_id;
    update public.agent_shares set workspace_id = v_new
     where source_agent_id in (select id from public.agents where space_id = p_space_id);

    v_moved := jsonb_build_object(
        'agents', (select count(*) from public.agents where space_id = p_space_id),
        'notifications', (select count(*) from public.notifications where space_id = p_space_id),
        'published_files', (select count(*) from public.published_files where space_id = p_space_id),
        'usage_events', (select count(*) from public.lumvika_usage_events where space_id = p_space_id),
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
