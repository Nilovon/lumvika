-- The organisation of a workspace: teams of people and agents, a reporting line between agents, and
-- goals the work rolls up to. Every table is read by any member of the workspace and written only by
-- the server (service role) after its own checks, so `authenticated` gets SELECT and nothing else.
--
-- Push order: after 20261110120000_session_source_work, before 20261110120200_projects_and_issues
-- (projects point at teams and goals). Safe to push before the code that reads it: it only adds.

-- Lets a row of another table name an agent of its own workspace and nothing else.
do $$ begin
    alter table public.agents add constraint agents_id_workspace_key unique (id, workspace_id);
exception when duplicate_object or duplicate_table then null;
end $$;

alter table public.agents add column if not exists title text;
alter table public.agents add column if not exists reports_to_agent_id uuid;
alter table public.agents add column if not exists monthly_budget_micros bigint;

do $$ begin
    alter table public.agents add constraint agents_reports_to_agent_id_fkey foreign key (reports_to_agent_id) references public.agents (id) on delete set null;
exception when duplicate_object then null;
end $$;
do $$ begin
    alter table public.agents add constraint agents_monthly_budget_micros_check check (monthly_budget_micros is null or monthly_budget_micros >= 0);
exception when duplicate_object then null;
end $$;
do $$ begin
    alter table public.agents add constraint agents_title_length_check check (title is null or char_length(title) <= 120);
exception when duplicate_object then null;
end $$;

create index if not exists agents_reports_to_idx on public.agents (reports_to_agent_id) where reports_to_agent_id is not null;

-- The browser can update an agent of a Box it manages, so the reporting line is held here and not
-- only in the server: no self-reference, no manager from another workspace, no cycle.
create or replace function public.agents_check_reporting_line()
returns trigger
language plpgsql
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

drop trigger if exists agents_check_reporting_line on public.agents;
create trigger agents_check_reporting_line
    before insert or update of reports_to_agent_id on public.agents
    for each row execute function public.agents_check_reporting_line();

do $$ begin
    create type public.team_member_role as enum ('lead', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.goal_status as enum ('planned', 'active', 'achieved', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces (id) on delete cascade,
    name text not null check (char_length(btrim(name)) between 1 and 80),
    description text check (description is null or char_length(description) <= 2000),
    color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, workspace_id)
);
create unique index if not exists teams_workspace_name_key on public.teams (workspace_id, lower(name));

create table if not exists public.team_members (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null,
    workspace_id bigint not null,
    user_id uuid,
    agent_id uuid,
    role public.team_member_role not null default 'member',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (num_nonnulls(user_id, agent_id) = 1),
    foreign key (team_id, workspace_id) references public.teams (id, workspace_id) on delete cascade,
    foreign key (user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete cascade,
    foreign key (agent_id, workspace_id) references public.agents (id, workspace_id) on delete cascade
);
create unique index if not exists team_members_team_user_key on public.team_members (team_id, user_id) where user_id is not null;
create unique index if not exists team_members_team_agent_key on public.team_members (team_id, agent_id) where agent_id is not null;
create index if not exists team_members_workspace_idx on public.team_members (workspace_id);
create index if not exists team_members_user_idx on public.team_members (user_id, workspace_id) where user_id is not null;
create index if not exists team_members_agent_idx on public.team_members (agent_id) where agent_id is not null;

create table if not exists public.goals (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces (id) on delete cascade,
    parent_goal_id uuid,
    team_id uuid,
    title text not null check (char_length(btrim(title)) between 1 and 200),
    description text check (description is null or char_length(description) <= 20000),
    status public.goal_status not null default 'planned',
    owner_user_id uuid,
    target_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, workspace_id),
    check (parent_goal_id is null or parent_goal_id <> id),
    foreign key (parent_goal_id, workspace_id) references public.goals (id, workspace_id) on delete set null (parent_goal_id),
    foreign key (team_id, workspace_id) references public.teams (id, workspace_id) on delete set null (team_id),
    foreign key (owner_user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete set null (owner_user_id)
);
create index if not exists goals_workspace_idx on public.goals (workspace_id, status);
create index if not exists goals_parent_idx on public.goals (parent_goal_id) where parent_goal_id is not null;
create index if not exists goals_team_idx on public.goals (team_id) where team_id is not null;

drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at before update on public.teams for each row execute function public.handle_updated_at();
drop trigger if exists team_members_updated_at on public.team_members;
create trigger team_members_updated_at before update on public.team_members for each row execute function public.handle_updated_at();
drop trigger if exists goals_updated_at on public.goals;
create trigger goals_updated_at before update on public.goals for each row execute function public.handle_updated_at();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.goals enable row level security;

revoke all on public.teams from anon, authenticated;
revoke all on public.team_members from anon, authenticated;
revoke all on public.goals from anon, authenticated;
grant select on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select on public.goals to authenticated;
grant all on public.teams to service_role;
grant all on public.team_members to service_role;
grant all on public.goals to service_role;

drop policy if exists teams_select_workspace_members on public.teams;
create policy teams_select_workspace_members on public.teams for select to authenticated
    using (workspace_id in (select public.current_workspace_ids()));
drop policy if exists team_members_select_workspace_members on public.team_members;
create policy team_members_select_workspace_members on public.team_members for select to authenticated
    using (workspace_id in (select public.current_workspace_ids()));
drop policy if exists goals_select_workspace_members on public.goals;
create policy goals_select_workspace_members on public.goals for select to authenticated
    using (workspace_id in (select public.current_workspace_ids()));
