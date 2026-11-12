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
grant all on public.assistant_chats to service_role;

drop policy if exists assistant_chats_select_owner_or_shared on public.assistant_chats;
create policy assistant_chats_select_owner_or_shared on public.assistant_chats for select to authenticated
    using (
        user_id = auth.uid()
        or (shared and workspace_id in (select public.current_workspace_ids()) and (project_id is null or project_id in (select public.visible_project_ids())))
    );
