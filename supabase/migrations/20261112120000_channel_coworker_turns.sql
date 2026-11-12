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
grant all on public.channel_agent_turns to service_role;
grant all on public.channel_agent_sessions to service_role;

drop policy if exists channel_agent_turns_select_visible on public.channel_agent_turns;
create policy channel_agent_turns_select_visible on public.channel_agent_turns for select to authenticated
    using (channel_id in (select public.visible_channel_ids()));

do $$ begin
    alter publication supabase_realtime add table public.channel_agent_turns;
exception when duplicate_object then null;
end $$;

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
grant execute on function public.channel_summaries(bigint, uuid) to service_role;
