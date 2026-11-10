-- The steward's conversations. Unlike an agent chat, whose transcript lives on the box engine,
-- this loop runs on the hub: nothing else would remember it. One row per conversation, rewritten at
-- the end of every turn with the UIMessage list the AI SDK hands back.

create table public.steward_conversations (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    title text,
    -- UIMessage[] from the AI SDK, replayed as-is when the conversation reopens.
    messages jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- What "reopen my last conversation" reads.
create index steward_conversations_recent_idx on public.steward_conversations (workspace_id, user_id, updated_at desc);

alter table public.steward_conversations enable row level security;
revoke all on table public.steward_conversations from anon, authenticated;
grant select on table public.steward_conversations to authenticated;

create policy "steward_conversations_select_own"
    on public.steward_conversations
    for select
    to authenticated
    using (
        user_id = auth.uid()
        and workspace_id in (select workspace_members.workspace_id from public.workspace_members where workspace_members.user_id = auth.uid())
    );
