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
grant execute on function public.visible_project_ids() to service_role;
grant execute on function public.manageable_project_ids() to service_role;
grant execute on function public.project_issue_counts(bigint) to service_role;

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
grant all on public.projects to service_role;
grant all on public.project_members to service_role;
grant all on public.issues to service_role;
grant all on public.issue_comments to service_role;
grant all on public.activity_events to service_role;

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

-- Realtime needs the whole old row to filter a DELETE by project_id.
alter table public.issues replica identity full;

do $$ begin
    alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null;
end $$;
do $$ begin
    alter publication supabase_realtime add table public.issues;
exception when duplicate_object then null;
end $$;
do $$ begin
    alter publication supabase_realtime add table public.issue_comments;
exception when duplicate_object then null;
end $$;
do $$ begin
    alter publication supabase_realtime add table public.activity_events;
exception when duplicate_object then null;
end $$;
