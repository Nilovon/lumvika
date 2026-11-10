-- Access by Box. A person reaches a Box, and every coworker in it, or does not. Two axes: a Box is
-- open to the workspace or restricted to the people named on it (`spaces.visibility`), and a person
-- uses every open Box or only the ones named to them (`workspace_members.box_scope`).
-- `space_members` names a person on a Box with `use` (talk to its coworkers) or `manage` (configure
-- them, create and delete them, set up the Box). Admins never need a row.
--
-- Safe to push before the code that reads it: every default keeps today's behaviour (every Box
-- open, every member on `all`, no row anywhere), so the new policies let through exactly what the
-- old ones did until an admin restricts something.

alter table public.spaces
    add column if not exists visibility text not null default 'workspace';
alter table public.workspace_members
    add column if not exists box_scope text not null default 'all';
alter table public.workspace_invitations
    add column if not exists box_scope text not null default 'all';

-- `spaces` is granted to the browser column by column (20260812121424): the board reads the new one.
grant select (visibility) on public.spaces to authenticated;

do $$ begin
    alter table public.spaces add constraint spaces_visibility_check check (visibility in ('workspace', 'restricted'));
exception when duplicate_object then null;
end $$;
do $$ begin
    alter table public.workspace_members add constraint workspace_members_box_scope_check check (box_scope in ('all', 'assigned'));
exception when duplicate_object then null;
end $$;
do $$ begin
    alter table public.workspace_invitations add constraint workspace_invitations_box_scope_check check (box_scope in ('all', 'assigned'));
exception when duplicate_object then null;
end $$;

create table if not exists public.space_members (
    space_id uuid not null,
    user_id uuid not null,
    workspace_id bigint not null,
    access text not null check (access in ('use', 'manage')),
    granted_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (space_id, user_id),
    -- An access outlives neither the Box nor the membership.
    foreign key (space_id, workspace_id) references public.spaces (id, workspace_id) on delete cascade,
    foreign key (user_id, workspace_id) references public.workspace_members (user_id, workspace_id) on delete cascade
);
create index if not exists space_members_user_idx on public.space_members (user_id, workspace_id);
create index if not exists space_members_workspace_idx on public.space_members (workspace_id);

alter table public.space_members enable row level security;
revoke all on public.space_members from anon, authenticated;
grant select on public.space_members to authenticated;
-- Recent stacks no longer hand a new table to service_role, which writes every row of this one.
grant all on public.space_members to service_role;

-- Realtime needs the whole old row to filter a DELETE by user_id.
alter table public.space_members replica identity full;

do $$ begin
    alter publication supabase_realtime add table public.space_members;
exception when duplicate_object then null;
end $$;

create or replace function public.visible_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select s.id
    from public.spaces s
    join public.workspace_members wm on wm.workspace_id = s.workspace_id and wm.user_id = auth.uid()
    where wm.role = 'admin'
       or exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = auth.uid())
       or (wm.box_scope = 'all' and s.visibility = 'workspace')
$$;

create or replace function public.manageable_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select s.id from public.spaces s
    where s.workspace_id in (select public.current_admin_workspace_ids())
    union
    select m.space_id from public.space_members m where m.user_id = auth.uid() and m.access = 'manage'
$$;

create or replace function public.visible_agent_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select a.id from public.agents a where a.space_id in (select public.visible_space_ids())
$$;

create or replace function public.manageable_agent_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select a.id from public.agents a where a.space_id in (select public.manageable_space_ids())
$$;

revoke all on function public.visible_space_ids() from public;
revoke all on function public.manageable_space_ids() from public;
revoke all on function public.visible_agent_ids() from public;
revoke all on function public.manageable_agent_ids() from public;
grant execute on function public.visible_space_ids() to authenticated;
grant execute on function public.manageable_space_ids() to authenticated;
grant execute on function public.visible_agent_ids() to authenticated;
grant execute on function public.manageable_agent_ids() to authenticated;
grant execute on function public.visible_space_ids() to service_role;
grant execute on function public.manageable_space_ids() to service_role;
grant execute on function public.visible_agent_ids() to service_role;
grant execute on function public.manageable_agent_ids() to service_role;

drop policy if exists "own rows or admin" on public.space_members;
create policy "own rows or admin" on public.space_members for select to authenticated
    using (user_id = auth.uid() or workspace_id in (select public.current_admin_workspace_ids()));

-- spaces: a restricted Box is invisible to whoever has no access to it, not "empty". Inserting stays
-- open to any member (the server writes the creator's `manage` row).
drop policy if exists spaces_select_own_workspace on public.spaces;
create policy spaces_select_own_workspace on public.spaces for select
    using (id in (select public.visible_space_ids()));
drop policy if exists spaces_update_own_workspace on public.spaces;
create policy spaces_update_own_workspace on public.spaces for update
    using (id in (select public.manageable_space_ids()))
    with check (workspace_id in (select public.current_workspace_ids()));
drop policy if exists spaces_delete_own_workspace on public.spaces;
create policy spaces_delete_own_workspace on public.spaces for delete
    using (id in (select public.manageable_space_ids()));

-- agents: seen through their Box, written by whoever manages it. The update's check refuses a move
-- into a Box the caller does not manage.
drop policy if exists "Users can view agents in their workspace" on public.agents;
create policy "Users can view agents in their workspace" on public.agents for select
    using (id in (select public.visible_agent_ids()));
drop policy if exists "Users can insert agents in their workspace" on public.agents;
create policy "Users can insert agents in their workspace" on public.agents for insert
    with check (workspace_id in (select public.current_workspace_ids()) and space_id in (select public.manageable_space_ids()));
drop policy if exists "Users can update agents in their workspace" on public.agents;
create policy "Users can update agents in their workspace" on public.agents for update
    using (id in (select public.manageable_agent_ids()))
    with check (space_id in (select public.manageable_space_ids()));
drop policy if exists "Users can delete agents in their workspace" on public.agents;
create policy "Users can delete agents in their workspace" on public.agents for delete
    using (id in (select public.manageable_agent_ids()));

-- sessions: using a coworker is talking to it, so every verb follows visibility.
drop policy if exists "Users can view sessions for their agents" on public.sessions;
create policy "Users can view sessions for their agents" on public.sessions for select
    using (agent_id in (select public.visible_agent_ids()));
drop policy if exists "Users can insert sessions for their agents" on public.sessions;
create policy "Users can insert sessions for their agents" on public.sessions for insert
    with check (agent_id in (select public.visible_agent_ids()));
drop policy if exists "Users can update sessions for their agents" on public.sessions;
create policy "Users can update sessions for their agents" on public.sessions for update
    using (agent_id in (select public.visible_agent_ids()));
drop policy if exists "Users can delete sessions for their agents" on public.sessions;
create policy "Users can delete sessions for their agents" on public.sessions for delete
    using (agent_id in (select public.visible_agent_ids()));

drop policy if exists notifications_select_workspace_members on public.notifications;
create policy notifications_select_workspace_members on public.notifications for select to authenticated
    using (
        workspace_id in (select public.current_workspace_ids())
        and (agent_id is null or agent_id in (select public.visible_agent_ids()))
        and (space_id is null or space_id in (select public.visible_space_ids()))
    );

drop policy if exists "Members read the participants of their workspace sessions" on public.session_participants;
create policy "Members read the participants of their workspace sessions" on public.session_participants for select to authenticated
    using (session_id in (select s.id from public.sessions s where s.agent_id in (select public.visible_agent_ids())));

drop policy if exists "Members record their own reads in their workspace sessions" on public.session_reads;
create policy "Members record their own reads in their workspace sessions" on public.session_reads for insert to authenticated
    with check (user_id = auth.uid() and session_id in (select s.id from public.sessions s where s.agent_id in (select public.visible_agent_ids())));

drop policy if exists app_connection_agents_select_workspace_members on public.app_connection_agents;
create policy app_connection_agents_select_workspace_members on public.app_connection_agents for select to authenticated
    using (agent_id in (select public.visible_agent_ids()));
