-- Thumbs up/down on an agent's reply, read back from /admin/feedback. The transcript lives on the
-- workspace's engine, which can be torn down at the end of a trial, so the conversation is frozen
-- here at the time of the vote.

create table public.message_feedback (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    user_id uuid references public.users(id) on delete set null,
    agent_id uuid references public.agents(id) on delete set null,
    session_id uuid references public.sessions(id) on delete set null,
    -- The UI message id: `engine-<row id>` once the history is re-read, the AI SDK's own id while
    -- the reply is still the one that just streamed.
    message_id text not null,
    rating text not null check (rating in ('up', 'down')),
    category text,
    details text,
    message_text text not null,
    -- HistoryMessage[] as the conversation stood when the vote was cast.
    transcript jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (session_id, message_id)
);

create index message_feedback_recent_idx on public.message_feedback (created_at desc);
create index message_feedback_rating_idx on public.message_feedback (rating, created_at desc);
create index message_feedback_workspace_idx on public.message_feedback (workspace_id);

alter table public.message_feedback enable row level security;
revoke all on table public.message_feedback from anon, authenticated;
grant select on table public.message_feedback to authenticated;

create policy "Members read their workspace message feedback"
on public.message_feedback
as permissive
for select
to authenticated
using ((workspace_id in (select public.current_workspace_ids() as current_workspace_ids)));
