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
grant execute on function public.visible_channel_ids() to service_role;

alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_messages enable row level security;

revoke all on public.channels from anon, authenticated;
revoke all on public.channel_members from anon, authenticated;
revoke all on public.channel_messages from anon, authenticated;
grant select on public.channels to authenticated;
grant select on public.channel_members to authenticated;
grant select on public.channel_messages to authenticated;
grant all on public.channels to service_role;
grant all on public.channel_members to service_role;
grant all on public.channel_messages to service_role;

drop policy if exists channels_select_visible on public.channels;
create policy channels_select_visible on public.channels for select to authenticated
    using (id in (select public.visible_channel_ids()));
drop policy if exists channel_members_select_visible on public.channel_members;
create policy channel_members_select_visible on public.channel_members for select to authenticated
    using (channel_id in (select public.visible_channel_ids()));
drop policy if exists channel_messages_select_visible on public.channel_messages;
create policy channel_messages_select_visible on public.channel_messages for select to authenticated
    using (channel_id in (select public.visible_channel_ids()));

-- Realtime needs the whole old row to filter a DELETE by user_id.
alter table public.channel_members replica identity full;

do $$ begin
    alter publication supabase_realtime add table public.channels;
exception when duplicate_object then null;
end $$;
do $$ begin
    alter publication supabase_realtime add table public.channel_members;
exception when duplicate_object then null;
end $$;
do $$ begin
    alter publication supabase_realtime add table public.channel_messages;
exception when duplicate_object then null;
end $$;
