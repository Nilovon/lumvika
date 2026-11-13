-- Projects, issues, channels, the assistant chat and the organisation of a workspace (teams, goals,
-- the reporting line), ported from the Supabase migrations of 2026-11-10 to 2026-11-13. Every write is
-- the server's, on serviceScope(); `authenticated` reads through the policies below. The tables the
-- app follows live signal their changes through live_notify (0002_live). The cleanup of
-- 20261112180000_channel_conversations_unmirrored is left out: it removed rows an older hub wrote,
-- and no install of this stack ever held them.
-- From 20261110120000_session_source_work.sql
-- A conversation can now start from an issue (an agent working on it) or from a channel (an agent
-- answering a mention). Alone in its own file: a value added to an enum cannot be used in the
-- transaction that adds it. Safe to push before any code that writes the new values.
alter type public.session_source add value if not exists 'issue';
alter type public.session_source add value if not exists 'channel';

--> statement-breakpoint
-- From 20261110120100_org_chart.sql
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

drop policy if exists teams_select_workspace_members on public.teams;
create policy teams_select_workspace_members on public.teams for select to authenticated
    using (workspace_id in (select public.current_workspace_ids()));
drop policy if exists team_members_select_workspace_members on public.team_members;
create policy team_members_select_workspace_members on public.team_members for select to authenticated
    using (workspace_id in (select public.current_workspace_ids()));
drop policy if exists goals_select_workspace_members on public.goals;
create policy goals_select_workspace_members on public.goals for select to authenticated
    using (workspace_id in (select public.current_workspace_ids()));

--> statement-breakpoint
-- From 20261110120200_projects_and_issues.sql
-- Projects and their issues, worked on by people and agents alike, with the comments on an issue and
-- an append-only log of what happened. A project is reached the way a Box is (20261105130000): open
-- to the workspace or restricted to the people named on it, and a member scoped to `assigned` only
-- sees what is named to them. Issues, comments and activity follow their project.
--
-- `authenticated` reads through RLS and writes nothing: every write is the server's, with the
-- service role, after the guards of `apps/ui/app/api/_auth/project-access.ts`.
--
-- Push order: after 20261110120100_org_chart (teams, goals, agents_id_workspace_key). Safe to push
-- before the code that reads it: it only adds.

do $$ begin
    create type public.project_status as enum ('planned', 'active', 'paused', 'completed', 'archived');
exception when duplicate_object then null;
end $$;
do $$ begin
    create type public.issue_status as enum ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled');
exception when duplicate_object then null;
end $$;
do $$ begin
    create type public.issue_priority as enum ('none', 'low', 'medium', 'high', 'urgent');
exception when duplicate_object then null;
end $$;

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces (id) on delete cascade,
    key text not null check (key ~ '^[A-Z][A-Z0-9]{1,5}$'),
    name text not null check (char_length(btrim(name)) between 1 and 120),
    description text check (description is null or char_length(description) <= 20000),
    instructions text check (instructions is null or char_length(instructions) <= 50000),
    status public.project_status not null default 'active',
    visibility text not null default 'workspace' check (visibility in ('workspace', 'restricted')),
    team_id uuid,
    goal_id uuid,
    lead_user_id uuid,
    lead_agent_id uuid,
    monthly_budget_micros bigint check (monthly_budget_micros is null or monthly_budget_micros >= 0),
    target_date date,
    created_by uuid references public.users (id) on delete set null,
    archived_at timestamptz,
    -- The last issue number handed out, by issues_allocate_number only.
    issue_counter integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, workspace_id),
    unique (workspace_id, key),
    check (num_nonnulls(lead_user_id, lead_agent_id) <= 1),
    foreign key (team_id, workspace_id) references public.teams (id, workspace_id) on delete set null (team_id),
    foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete set null (goal_id),
    foreign key (lead_user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete set null (lead_user_id),
    foreign key (lead_agent_id, workspace_id) references public.agents (id, workspace_id) on delete set null (lead_agent_id)
);
create index if not exists projects_workspace_idx on public.projects (workspace_id, status);
create index if not exists projects_team_idx on public.projects (team_id) where team_id is not null;
create index if not exists projects_goal_idx on public.projects (goal_id) where goal_id is not null;

-- The twin of space_members: a person named on a project with `use` or `manage`. Admins never need a row.
create table if not exists public.project_members (
    project_id uuid not null,
    user_id uuid not null,
    workspace_id bigint not null,
    access text not null check (access in ('use', 'manage')),
    granted_by uuid references public.users (id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (project_id, user_id),
    foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
    foreign key (user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete cascade
);
create index if not exists project_members_user_idx on public.project_members (user_id, workspace_id);
create index if not exists project_members_workspace_idx on public.project_members (workspace_id);

create table if not exists public.issues (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null,
    project_id uuid not null,
    -- Allocated by issues_allocate_number; the default only keeps it optional on insert.
    number integer not null default 0,
    title text not null check (char_length(btrim(title)) between 1 and 300),
    description text check (description is null or char_length(description) <= 100000),
    status public.issue_status not null default 'backlog',
    priority public.issue_priority not null default 'none',
    assignee_user_id uuid,
    assignee_agent_id uuid,
    created_by_user_id uuid references public.users (id) on delete set null,
    created_by_agent_id uuid,
    parent_issue_id uuid,
    goal_id uuid,
    due_date date,
    position double precision not null default 0,
    blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 2000),
    checkout_run_id text,
    checked_out_at timestamptz,
    session_id uuid references public.sessions (id) on delete set null,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, workspace_id),
    unique (project_id, number),
    check (num_nonnulls(assignee_user_id, assignee_agent_id) <= 1),
    check (num_nonnulls(created_by_user_id, created_by_agent_id) <= 1),
    check ((checkout_run_id is null) = (checked_out_at is null)),
    check (parent_issue_id is null or parent_issue_id <> id),
    foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
    foreign key (assignee_user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete set null (assignee_user_id),
    foreign key (assignee_agent_id, workspace_id) references public.agents (id, workspace_id) on delete set null (assignee_agent_id),
    foreign key (created_by_agent_id, workspace_id) references public.agents (id, workspace_id) on delete set null (created_by_agent_id),
    foreign key (parent_issue_id, workspace_id) references public.issues (id, workspace_id) on delete set null (parent_issue_id),
    foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete set null (goal_id)
);
create index if not exists issues_board_idx on public.issues (project_id, status, position);
create index if not exists issues_workspace_updated_idx on public.issues (workspace_id, updated_at desc);
create index if not exists issues_assignee_user_idx on public.issues (assignee_user_id, status) where assignee_user_id is not null;
create index if not exists issues_assignee_agent_idx on public.issues (assignee_agent_id, status) where assignee_agent_id is not null;
create index if not exists issues_parent_idx on public.issues (parent_issue_id) where parent_issue_id is not null;
create index if not exists issues_goal_idx on public.issues (goal_id) where goal_id is not null;
create index if not exists issues_session_idx on public.issues (session_id) where session_id is not null;
create index if not exists issues_checkout_idx on public.issues (checkout_run_id) where checkout_run_id is not null;

-- The row lock on the project serializes concurrent inserts into it, so two issues never share a
-- number. A number freed by a deleted issue is not handed out again.
create or replace function public.issues_allocate_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    update public.projects set issue_counter = issue_counter + 1 where id = new.project_id and workspace_id = new.workspace_id returning issue_counter into new.number;
    if new.number is null then
        raise exception 'issues_project_missing: project % does not exist in workspace %', new.project_id, new.workspace_id using errcode = 'foreign_key_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists issues_allocate_number on public.issues;
create trigger issues_allocate_number before insert on public.issues for each row execute function public.issues_allocate_number();

-- A reference like ENG-12 is the project's key and the number: neither moves once handed out.
create or replace function public.issues_keep_reference()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
    if new.project_id <> old.project_id or new.number <> old.number then
        raise exception 'issues_reference_frozen: an issue keeps its project and its number' using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists issues_keep_reference on public.issues;
create trigger issues_keep_reference before update of project_id, number on public.issues for each row execute function public.issues_keep_reference();

create table if not exists public.issue_comments (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null,
    issue_id uuid not null,
    -- Both null once the author is deleted: the comment stays, signed by nobody.
    author_user_id uuid references public.users (id) on delete set null,
    author_agent_id uuid,
    body text not null check (char_length(btrim(body)) between 1 and 50000),
    edited_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (num_nonnulls(author_user_id, author_agent_id) <= 1),
    foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade,
    foreign key (author_agent_id, workspace_id) references public.agents (id, workspace_id) on delete set null (author_agent_id)
);
create index if not exists issue_comments_issue_idx on public.issue_comments (issue_id, created_at);
create index if not exists issue_comments_workspace_idx on public.issue_comments (workspace_id);

-- The actor columns carry no foreign key on purpose: the log keeps who did what after they are gone.
create table if not exists public.activity_events (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces (id) on delete cascade,
    project_id uuid,
    issue_id uuid,
    entity_type text not null check (entity_type ~ '^[a-z_]{1,40}$'),
    entity_id uuid not null,
    action text not null check (action ~ '^[a-z_]{1,40}\.[a-z_]{1,40}$'),
    actor_user_id uuid,
    actor_agent_id uuid,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    check (num_nonnulls(actor_user_id, actor_agent_id) <= 1),
    foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
    foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade
);
create index if not exists activity_events_workspace_idx on public.activity_events (workspace_id, created_at desc);
create index if not exists activity_events_project_idx on public.activity_events (project_id, created_at desc) where project_id is not null;
create index if not exists activity_events_issue_idx on public.activity_events (issue_id, created_at desc) where issue_id is not null;
create index if not exists activity_events_entity_idx on public.activity_events (entity_type, entity_id, created_at desc);
create index if not exists activity_events_actor_agent_idx on public.activity_events (actor_agent_id, created_at desc) where actor_agent_id is not null;

create or replace function public.activity_events_append_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
    raise exception 'activity_events_append_only: an activity event is never changed' using errcode = 'check_violation';
end;
$$;

drop trigger if exists activity_events_append_only on public.activity_events;
create trigger activity_events_append_only before update on public.activity_events for each row execute function public.activity_events_append_only();

-- issue_counter moving is not an edit of the project, so it leaves updated_at alone.
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
    before update of key, name, description, instructions, status, visibility, team_id, goal_id, lead_user_id, lead_agent_id, monthly_budget_micros, target_date, archived_at
    on public.projects for each row execute function public.handle_updated_at();
drop trigger if exists issues_updated_at on public.issues;
create trigger issues_updated_at before update on public.issues for each row execute function public.handle_updated_at();
drop trigger if exists issue_comments_updated_at on public.issue_comments;
create trigger issue_comments_updated_at before update on public.issue_comments for each row execute function public.handle_updated_at();

create or replace function public.visible_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select p.id
    from public.projects p
    join public.workspace_members wm on wm.workspace_id = p.workspace_id and wm.user_id = auth.uid()
    where wm.role = 'admin'
       or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid())
       or (wm.box_scope = 'all' and p.visibility = 'workspace')
$$;

create or replace function public.manageable_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select p.id from public.projects p
    where p.workspace_id in (select public.current_admin_workspace_ids())
    union
    select m.project_id from public.project_members m where m.user_id = auth.uid() and m.access = 'manage'
$$;

-- For the server's project list: one row per project and status that has issues.
create or replace function public.project_issue_counts(p_workspace_id bigint)
returns table (project_id uuid, status public.issue_status, issue_count integer)
language sql
stable
set search_path to 'public'
as $$
    select i.project_id, i.status, count(*)::integer
    from public.issues i
    where i.workspace_id = p_workspace_id
    group by i.project_id, i.status
$$;

revoke all on function public.visible_project_ids() from public;
revoke all on function public.manageable_project_ids() from public;
revoke all on function public.project_issue_counts(bigint) from public, anon, authenticated;
revoke all on function public.issues_allocate_number() from public;
grant execute on function public.visible_project_ids() to authenticated;
grant execute on function public.manageable_project_ids() to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.activity_events enable row level security;

revoke all on public.projects from anon, authenticated;
revoke all on public.project_members from anon, authenticated;
revoke all on public.issues from anon, authenticated;
revoke all on public.issue_comments from anon, authenticated;
revoke all on public.activity_events from anon, authenticated;
grant select on public.projects to authenticated;
grant select on public.project_members to authenticated;
grant select on public.issues to authenticated;
grant select on public.issue_comments to authenticated;
grant select on public.activity_events to authenticated;

drop policy if exists projects_select_visible on public.projects;
create policy projects_select_visible on public.projects for select to authenticated
    using (id in (select public.visible_project_ids()));
drop policy if exists project_members_select_visible on public.project_members;
create policy project_members_select_visible on public.project_members for select to authenticated
    using (project_id in (select public.visible_project_ids()));
drop policy if exists issues_select_visible on public.issues;
create policy issues_select_visible on public.issues for select to authenticated
    using (project_id in (select public.visible_project_ids()));
drop policy if exists issue_comments_select_visible on public.issue_comments;
create policy issue_comments_select_visible on public.issue_comments for select to authenticated
    using (issue_id in (select i.id from public.issues i where i.project_id in (select public.visible_project_ids())));
drop policy if exists activity_events_select_visible on public.activity_events;
create policy activity_events_select_visible on public.activity_events for select to authenticated
    using (workspace_id in (select public.current_workspace_ids()) and (project_id is null or project_id in (select public.visible_project_ids())));


create trigger live_change after insert or update or delete on public.projects for each row execute function public.live_notify('id', 'workspace_id', '');
create trigger live_change after insert or update or delete on public.issues for each row execute function public.live_notify('id', 'workspace_id', '');
create trigger live_change after insert or update or delete on public.issue_comments for each row execute function public.live_notify('id', 'workspace_id', '');
create trigger live_change after insert or update or delete on public.activity_events for each row execute function public.live_notify('id', 'workspace_id', '');

--> statement-breakpoint
-- From 20261110120300_channels.sql
-- Channels where people and agents talk: public ones open to the workspace, private ones and direct
-- messages open to their members only. A member scoped to `assigned` sees a public channel only once
-- they join it, the way they see a Box only once it is named to them.
--
-- `authenticated` reads through RLS and writes nothing: every write is the server's, with the
-- service role, after the guards of `apps/ui/app/api/_auth/project-access.ts`.
--
-- Push order: after 20261110120200_projects_and_issues (a channel can belong to a project). Safe to
-- push before the code that reads it: it only adds.

do $$ begin
    create type public.channel_kind as enum ('public', 'private', 'dm');
exception when duplicate_object then null;
end $$;

create table if not exists public.channels (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces (id) on delete cascade,
    name text not null check (char_length(name) <= 80),
    description text check (description is null or char_length(description) <= 2000),
    kind public.channel_kind not null default 'public',
    project_id uuid,
    team_id uuid,
    created_by uuid references public.users (id) on delete set null,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, workspace_id),
    check (kind = 'dm' or char_length(btrim(name)) >= 1),
    foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete set null (project_id),
    foreign key (team_id, workspace_id) references public.teams (id, workspace_id) on delete set null (team_id)
);
-- A direct message has no name of its own, so only named channels must not collide.
create unique index if not exists channels_workspace_name_key on public.channels (workspace_id, lower(name)) where kind <> 'dm' and archived_at is null;
create index if not exists channels_workspace_idx on public.channels (workspace_id, kind);
create index if not exists channels_project_idx on public.channels (project_id) where project_id is not null;
create index if not exists channels_team_idx on public.channels (team_id) where team_id is not null;

create table if not exists public.channel_members (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null,
    workspace_id bigint not null,
    user_id uuid,
    agent_id uuid,
    last_read_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (num_nonnulls(user_id, agent_id) = 1),
    foreign key (channel_id, workspace_id) references public.channels (id, workspace_id) on delete cascade,
    foreign key (user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete cascade,
    foreign key (agent_id, workspace_id) references public.agents (id, workspace_id) on delete cascade
);
create unique index if not exists channel_members_channel_user_key on public.channel_members (channel_id, user_id) where user_id is not null;
create unique index if not exists channel_members_channel_agent_key on public.channel_members (channel_id, agent_id) where agent_id is not null;
create index if not exists channel_members_user_idx on public.channel_members (user_id, workspace_id) where user_id is not null;
create index if not exists channel_members_agent_idx on public.channel_members (agent_id) where agent_id is not null;

create table if not exists public.channel_messages (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null,
    workspace_id bigint not null,
    -- Both null once the author is deleted: the message stays, signed by nobody.
    author_user_id uuid references public.users (id) on delete set null,
    author_agent_id uuid,
    body text not null check (char_length(body) <= 40000),
    parent_message_id uuid,
    mentions jsonb not null default '[]'::jsonb check (jsonb_typeof(mentions) = 'array'),
    edited_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, channel_id),
    check (num_nonnulls(author_user_id, author_agent_id) <= 1),
    check (parent_message_id is null or parent_message_id <> id),
    foreign key (channel_id, workspace_id) references public.channels (id, workspace_id) on delete cascade,
    foreign key (author_agent_id, workspace_id) references public.agents (id, workspace_id) on delete set null (author_agent_id),
    foreign key (parent_message_id, channel_id) references public.channel_messages (id, channel_id) on delete cascade
);
create index if not exists channel_messages_channel_idx on public.channel_messages (channel_id, created_at desc);
create index if not exists channel_messages_parent_idx on public.channel_messages (parent_message_id, created_at) where parent_message_id is not null;
create index if not exists channel_messages_workspace_idx on public.channel_messages (workspace_id);

-- Threads are one level deep: a reply answers a top-level message, never another reply.
create or replace function public.channel_messages_single_level_threads()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
    if new.parent_message_id is not null and exists (select 1 from public.channel_messages m where m.id = new.parent_message_id and m.parent_message_id is not null) then
        raise exception 'channel_messages_nested_reply: a reply cannot itself be answered in a thread' using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists channel_messages_single_level_threads on public.channel_messages;
create trigger channel_messages_single_level_threads
    before insert or update of parent_message_id on public.channel_messages
    for each row execute function public.channel_messages_single_level_threads();

drop trigger if exists channels_updated_at on public.channels;
create trigger channels_updated_at before update on public.channels for each row execute function public.handle_updated_at();
drop trigger if exists channel_members_updated_at on public.channel_members;
create trigger channel_members_updated_at before update on public.channel_members for each row execute function public.handle_updated_at();
drop trigger if exists channel_messages_updated_at on public.channel_messages;
create trigger channel_messages_updated_at before update on public.channel_messages for each row execute function public.handle_updated_at();

create or replace function public.visible_channel_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.id
    from public.channels c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id and wm.user_id = auth.uid()
    where (c.kind = 'public' and (wm.role = 'admin' or wm.box_scope = 'all'))
       or exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
$$;

revoke all on function public.visible_channel_ids() from public;
grant execute on function public.visible_channel_ids() to authenticated;

alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_messages enable row level security;

revoke all on public.channels from anon, authenticated;
revoke all on public.channel_members from anon, authenticated;
revoke all on public.channel_messages from anon, authenticated;
grant select on public.channels to authenticated;
grant select on public.channel_members to authenticated;
grant select on public.channel_messages to authenticated;

drop policy if exists channels_select_visible on public.channels;
create policy channels_select_visible on public.channels for select to authenticated
    using (id in (select public.visible_channel_ids()));
drop policy if exists channel_members_select_visible on public.channel_members;
create policy channel_members_select_visible on public.channel_members for select to authenticated
    using (channel_id in (select public.visible_channel_ids()));
drop policy if exists channel_messages_select_visible on public.channel_messages;
create policy channel_messages_select_visible on public.channel_messages for select to authenticated
    using (channel_id in (select public.visible_channel_ids()));


create trigger live_change after insert or update or delete on public.channels for each row execute function public.live_notify('id', 'workspace_id', '');
create trigger live_change after insert or update or delete on public.channel_members for each row execute function public.live_notify('id', 'workspace_id', 'user_id');
create trigger live_change after insert or update or delete on public.channel_messages for each row execute function public.live_notify('id', 'workspace_id', '');

--> statement-breakpoint
-- From 20261110120400_assistant_chats.sql
-- The plain assistant chat: a conversation of one person with the workspace's assistant, outside any
-- coworker, optionally about a project (its instructions join the context). Private to its owner
-- unless they share it with the workspace, and then only with those who see its project. The
-- messages live on the engine (`engine_session_id`).
--
-- `authenticated` reads through RLS and writes nothing: every write is the server's, with the
-- service role.
--
-- Push order: after 20261110120200_projects_and_issues. Safe to push before the code that reads it.

create table if not exists public.assistant_chats (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null,
    user_id uuid not null,
    project_id uuid,
    title text not null default 'New chat' check (char_length(title) <= 200),
    engine_session_id text unique,
    model text check (model is null or char_length(model) <= 200),
    shared boolean not null default false,
    last_message_at timestamptz,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete cascade,
    foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete set null (project_id)
);
create index if not exists assistant_chats_owner_idx on public.assistant_chats (user_id, workspace_id, last_message_at desc nulls last);
create index if not exists assistant_chats_shared_idx on public.assistant_chats (workspace_id, last_message_at desc nulls last) where shared;
create index if not exists assistant_chats_project_idx on public.assistant_chats (project_id) where project_id is not null;

drop trigger if exists assistant_chats_updated_at on public.assistant_chats;
create trigger assistant_chats_updated_at before update on public.assistant_chats for each row execute function public.handle_updated_at();

alter table public.assistant_chats enable row level security;
revoke all on public.assistant_chats from anon, authenticated;
grant select on public.assistant_chats to authenticated;

drop policy if exists assistant_chats_select_owner_or_shared on public.assistant_chats;
create policy assistant_chats_select_owner_or_shared on public.assistant_chats for select to authenticated
    using (
        user_id = auth.uid()
        or (shared and workspace_id in (select public.current_workspace_ids()) and (project_id is null or project_id in (select public.visible_project_ids())))
    );

--> statement-breakpoint
-- From 20261112120000_channel_coworker_turns.sql
-- Coworkers answering in channels.
--
-- `channel_agent_turns`: one row per answer the hub asks a coworker for, from the moment it is asked
-- to the moment its reply is posted (or it could not answer). Everyone who sees the channel reads it,
-- so the "is answering" state and the failure note come from the same row on every screen. At most
-- one answer per coworker and thread is in flight: the partial unique index is the guard.
--
-- `channel_agent_sessions`: the engine conversation a coworker keeps for a channel, so it remembers
-- what was said there. Read and written by the server only.
--
-- `channel_summaries()`: the unread count and the last message of every channel of a workspace for
-- one person, in one call, for the channel list.
--
-- Push order: after 20261110120300_channels. Safe to push before the code that reads it: it only adds.

create table if not exists public.channel_agent_turns (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null,
    workspace_id bigint not null,
    agent_id uuid not null,
    -- The top-level message whose thread the answer goes in.
    thread_message_id uuid not null,
    trigger_message_id uuid not null,
    requested_by uuid references public.users (id) on delete set null,
    status text not null default 'answering' check (status in ('answering', 'answered', 'failed')),
    failure text check (failure is null or failure in ('engine_unreachable', 'engine_outdated', 'coworker_disabled', 'no_model', 'no_access', 'not_member', 'timeout', 'failed')),
    engine_run_id text,
    reply_message_id uuid,
    finished_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (channel_id, workspace_id) references public.channels (id, workspace_id) on delete cascade,
    foreign key (agent_id, workspace_id) references public.agents (id, workspace_id) on delete cascade,
    foreign key (thread_message_id, channel_id) references public.channel_messages (id, channel_id) on delete cascade,
    foreign key (trigger_message_id, channel_id) references public.channel_messages (id, channel_id) on delete cascade
);
create unique index if not exists channel_agent_turns_in_flight_key on public.channel_agent_turns (agent_id, thread_message_id) where status = 'answering';
create index if not exists channel_agent_turns_channel_idx on public.channel_agent_turns (channel_id, created_at desc);

drop trigger if exists channel_agent_turns_updated_at on public.channel_agent_turns;
create trigger channel_agent_turns_updated_at before update on public.channel_agent_turns for each row execute function public.handle_updated_at();

create table if not exists public.channel_agent_sessions (
    channel_id uuid not null,
    agent_id uuid not null,
    workspace_id bigint not null,
    engine_session_id text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (channel_id, agent_id),
    foreign key (channel_id, workspace_id) references public.channels (id, workspace_id) on delete cascade,
    foreign key (agent_id, workspace_id) references public.agents (id, workspace_id) on delete cascade
);

drop trigger if exists channel_agent_sessions_updated_at on public.channel_agent_sessions;
create trigger channel_agent_sessions_updated_at before update on public.channel_agent_sessions for each row execute function public.handle_updated_at();

alter table public.channel_agent_turns enable row level security;
alter table public.channel_agent_sessions enable row level security;

revoke all on public.channel_agent_turns from anon, authenticated;
revoke all on public.channel_agent_sessions from anon, authenticated;
grant select on public.channel_agent_turns to authenticated;

drop policy if exists channel_agent_turns_select_visible on public.channel_agent_turns;
create policy channel_agent_turns_select_visible on public.channel_agent_turns for select to authenticated
    using (channel_id in (select public.visible_channel_ids()));

create trigger live_change after insert or update or delete on public.channel_agent_turns for each row execute function public.live_notify('id', 'workspace_id', '');

-- Unread: messages of the channel, threads included, written by someone else since the person last
-- read it. Zero where they are not a member. The last message is the newest top-level one.
create or replace function public.channel_summaries(p_workspace_id bigint, p_user_id uuid)
returns table (channel_id uuid, unread_count integer, last_message_id uuid)
language sql
stable
set search_path to 'public'
as $$
    select
        c.id,
        coalesce((
            select count(*)::integer
            from public.channel_messages m
            join public.channel_members cm on cm.channel_id = m.channel_id and cm.user_id = p_user_id
            where m.channel_id = c.id
              and m.deleted_at is null
              and m.author_user_id is distinct from p_user_id
              and (cm.last_read_at is null or m.created_at > cm.last_read_at)
        ), 0),
        (
            select m.id
            from public.channel_messages m
            where m.channel_id = c.id and m.parent_message_id is null and m.deleted_at is null
            order by m.created_at desc
            limit 1
        )
    from public.channels c
    where c.workspace_id = p_workspace_id and c.archived_at is null
$$;

revoke all on function public.channel_summaries(bigint, uuid) from public, anon, authenticated;

--> statement-breakpoint
-- From 20261112130000_channel_turn_endings.sql
-- Coworker turns in channels close from the engine's run-end webhook rather than from a request that
-- waits for the run. Two more ways a turn can end:
--   needs_input  the run stopped on a question or an approval for the person (no terminal event)
--   cancelled    someone stopped the run
-- and the run id is looked up by the webhook, so it gets an index.
--
-- Push order: after 20261112120000_channel_coworker_turns. Safe to push before the code that reads
-- it: it only widens a check and adds an index. Re-runnable.

alter table public.channel_agent_turns drop constraint if exists channel_agent_turns_failure_check;
alter table public.channel_agent_turns add constraint channel_agent_turns_failure_check
    check (failure is null or failure in ('engine_unreachable', 'engine_outdated', 'coworker_disabled', 'no_model', 'no_access', 'not_member', 'timeout', 'failed', 'needs_input', 'cancelled'));

create index if not exists channel_agent_turns_run_idx on public.channel_agent_turns (workspace_id, engine_run_id) where engine_run_id is not null;

--> statement-breakpoint
-- From 20261112141500_team_members_follow_boxes.sql
-- A coworker's team membership is read only by whoever can see the coworker's Box: a member scoped
-- to assigned Boxes no longer learns which coworkers of other Boxes sit in a team. Rows of people
-- stay readable by the whole workspace, as before.
drop policy if exists team_members_select_workspace_members on public.team_members;
create policy team_members_select_workspace_members on public.team_members for select to authenticated
    using (
        workspace_id in (select public.current_workspace_ids())
        and (agent_id is null or agent_id in (select public.visible_agent_ids()))
    );

--> statement-breakpoint
-- From 20261112170000_issue_touches.sql
-- When each open issue was last touched by the coworker it is assigned to, by anyone else, and by a
-- person's comment, read exactly per issue for the work queue (`work-queue.service.ts`). The queue
-- used to read the newest events of the whole workspace in one window and took an issue with none in
-- it for never touched, which handed old issues out again in a busy workspace. Activity rows go with
-- their issue and its project (on delete cascade), so nothing here can outlive what it describes.
create or replace function public.issue_touches(p_workspace_id bigint, p_issue_ids uuid[])
returns table (issue_id uuid, assignee_touched_at timestamptz, others_touched_at timestamptz, person_commented_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
    select
        i.id,
        (
            select max(e.created_at)
            from public.activity_events e
            where e.issue_id = i.id
              and e.workspace_id = i.workspace_id
              and e.actor_agent_id = i.assignee_agent_id
              and e.action in ('issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out')
        ),
        (
            select max(e.created_at)
            from public.activity_events e
            where e.issue_id = i.id
              and e.workspace_id = i.workspace_id
              and e.actor_agent_id is distinct from i.assignee_agent_id
              and e.action in ('issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out')
        ),
        (
            select max(e.created_at)
            from public.activity_events e
            where e.issue_id = i.id
              and e.workspace_id = i.workspace_id
              and e.action = 'issue.commented'
              and e.actor_user_id is not null
        )
    from public.issues i
    where i.workspace_id = p_workspace_id
      and i.id = any(p_issue_ids)
$$;

revoke all on function public.issue_touches(bigint, uuid[]) from public, anon, authenticated;

--> statement-breakpoint
-- From 20261112180100_activity_events_follow_access.sql
-- The activity feed read straight from the table (the realtime feed included) answered more than the
-- server's feed: an event outside a project was readable by every member of the workspace. Three
-- kinds of those now follow what they are about, as `listActivityFeed` does:
--   a channel event    only for whoever reads the channel (its name, a private one's included)
--   a coworker event   only for whoever reaches the coworker's Box (its title, its manager)
--   a team membership  of a coworker, only for whoever reaches the coworker's Box
-- Every other event keeps the rule it had: the workspace, and the project when it has one.
--
-- Push order: after 20261110120300_channels (visible_channel_ids) and 20261105130000_space_access
-- (visible_agent_ids). It only narrows a read policy, so it can go before or after the code.
-- Re-runnable.

drop policy if exists activity_events_select_visible on public.activity_events;
create policy activity_events_select_visible on public.activity_events for select to authenticated
    using (
        workspace_id in (select public.current_workspace_ids())
        and (project_id is null or project_id in (select public.visible_project_ids()))
        and (entity_type <> 'channel' or entity_id in (select public.visible_channel_ids()))
        and (entity_type <> 'agent' or entity_id in (select public.visible_agent_ids()))
        and (
            entity_type <> 'team'
            or coalesce(metadata ->> 'agentId', '') = ''
            or (metadata ->> 'agentId') in (select visible.id::text from public.visible_agent_ids() as visible (id))
        )
    );

--> statement-breakpoint
-- From 20261112180200_reporting_line_server_only.sql
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

--> statement-breakpoint
-- From 20261112180300_assistant_chats_archived_private.sql
-- A shared assistant chat its owner archived leaves the list of everyone else: the server already
-- hid it (`listAssistantChats`, `readableChat`), but the table policy still let other members read
-- it. They now read a shared chat only while it is not archived; its owner still reads it either way.
--
-- Push order: after 20261110120400_assistant_chats. It only narrows a read policy. Re-runnable.

drop policy if exists assistant_chats_select_owner_or_shared on public.assistant_chats;
create policy assistant_chats_select_owner_or_shared on public.assistant_chats for select to authenticated
    using (
        user_id = auth.uid()
        or (
            shared
            and archived_at is null
            and workspace_id in (select public.current_workspace_ids())
            and (project_id is null or project_id in (select public.visible_project_ids()))
        )
    );

--> statement-breakpoint
-- From 20261112190000_assistant_chat_stop.sql
-- A Stop pressed on the first message of a new assistant chat comes before the engine named its
-- conversation, so there was nothing to stop yet and the run went on. The hub now keeps when Stop was
-- last asked for on the chat: the turn that names the conversation stops its run if Stop came after
-- the turn began, and a Stop that comes later finds the conversation on the row.
alter table public.assistant_chats add column if not exists stop_requested_at timestamptz;

--> statement-breakpoint
-- From 20261113100000_issue_actor_touches.sql
-- When each actor last acted on each open issue, per kind of action, for the work queue
-- (`work-queue.service.ts`). `issue_touches` (20261112170000) folded every person into "someone
-- else", so a person who may not use a coworker still made its issue due on the next heartbeat and
-- steered it, minutes after the wake that refused them. The hub now decides per actor, with the same
-- rule as a wake: this function hands it the last time of each actor and action, exact per issue.
-- Activity rows go with their issue and its project (on delete cascade), so nothing outlives what it
-- describes. `issue_touches` is left in place for an older hub still running beside this one.
create or replace function public.issue_actor_touches(p_workspace_id bigint, p_issue_ids uuid[])
returns table (issue_id uuid, actor_user_id uuid, actor_agent_id uuid, action text, last_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
    select e.issue_id, e.actor_user_id, e.actor_agent_id, e.action, max(e.created_at)
    from public.activity_events e
    join public.issues i on i.id = e.issue_id and i.workspace_id = e.workspace_id
    where i.workspace_id = p_workspace_id
      and i.id = any(p_issue_ids)
      and e.action in ('issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out')
    group by e.issue_id, e.actor_user_id, e.actor_agent_id, e.action
$$;

revoke all on function public.issue_actor_touches(bigint, uuid[]) from public, anon, authenticated;

--> statement-breakpoint
-- From 20261113110000_issue_run_failed.sql
-- A coworker's run on an issue that ended without the work (`issue.run_failed`, written by the hub
-- when the engine reports the end of the run).
--
-- 1. It is the coworker's own touch for the work queue: `issue_actor_touches` now hands it to the hub
--    with the other actions, so a failed run does not make its issue due again on the next heartbeat.
-- 2. One row per run: the engine may report the same end twice.
-- 3. `issue_run_failures` answers, per issue, the failure that is still its assignee's latest event,
--    for the banner of the issue and the marker of its card.

create or replace function public.issue_actor_touches(p_workspace_id bigint, p_issue_ids uuid[])
returns table (issue_id uuid, actor_user_id uuid, actor_agent_id uuid, action text, last_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
    select e.issue_id, e.actor_user_id, e.actor_agent_id, e.action, max(e.created_at)
    from public.activity_events e
    join public.issues i on i.id = e.issue_id and i.workspace_id = e.workspace_id
    where i.workspace_id = p_workspace_id
      and i.id = any(p_issue_ids)
      and e.action in ('issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out', 'issue.run_failed')
    group by e.issue_id, e.actor_user_id, e.actor_agent_id, e.action
$$;

revoke all on function public.issue_actor_touches(bigint, uuid[]) from public, anon, authenticated;

create unique index if not exists activity_events_run_failed_once
    on public.activity_events (workspace_id, (metadata ->> 'runId'))
    where action = 'issue.run_failed';

create or replace function public.issue_run_failures(p_workspace_id bigint, p_issue_ids uuid[])
returns table (issue_id uuid, actor_agent_id uuid, metadata jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
    select i.id, latest.actor_agent_id, latest.metadata, latest.created_at
    from public.issues i
    cross join lateral (
        select e.actor_agent_id, e.action, e.metadata, e.created_at
        from public.activity_events e
        where e.issue_id = i.id
          and e.workspace_id = i.workspace_id
          and e.actor_agent_id = i.assignee_agent_id
        order by e.created_at desc, e.id desc
        limit 1
    ) latest
    where i.workspace_id = p_workspace_id
      and i.id = any(p_issue_ids)
      and latest.action = 'issue.run_failed'
$$;

revoke all on function public.issue_run_failures(bigint, uuid[]) from public, anon, authenticated;
