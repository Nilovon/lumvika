-- A finished run used to leave nothing behind: the session went back to `idle`, the same state as a
-- conversation never started, and the inbox filtered `done` rows out. This records, per member and
-- per conversation, when they last looked at it, so a run that finished after that is still news.
-- Not a column on `session_participants`: someone who only reads a conversation must not become a
-- participant, the routing sends them its questions.
create table public.session_reads (
    session_id uuid not null references public.sessions(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    seen_at timestamptz not null default now(),
    primary key (session_id, user_id)
);

create index session_reads_user_idx on public.session_reads (user_id);

-- The browser's clock is not to be trusted: `unseen_runs` compares `seen_at` to the server-side
-- `created_at` of the notifications, so the server stamps the read itself, whatever was sent.
create function public.session_reads_stamp_seen_at() returns trigger
language plpgsql as $$
begin
    new.seen_at := now();
    return new;
end $$;

create trigger session_reads_stamp_seen_at
    before insert or update on public.session_reads
    for each row execute function public.session_reads_stamp_seen_at();

alter table public.session_reads enable row level security;

-- Spelled out: the default privileges of this schema no longer hand a new table to anyone.
grant select, insert, update on table public.session_reads to authenticated;
grant select, insert, update, delete on table public.session_reads to service_role;

create policy "Members read their own reads"
on public.session_reads
as permissive
for select
to authenticated
using (user_id = auth.uid());

create policy "Members record their own reads in their workspace sessions"
on public.session_reads
as permissive
for insert
to authenticated
with check (user_id = auth.uid() and session_id in (select s.id from public.sessions s join public.agents a on a.id = s.agent_id where a.workspace_id in (select public.current_workspace_ids() as current_workspace_ids)));

create policy "Members update their own reads"
on public.session_reads
as permissive
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index notifications_workspace_done_idx on public.notifications (workspace_id, created_at desc) where kind = 'done';

-- Every other tab of the same member drops the conversation from its unseen list once it is opened.
do $$
begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_reads') then
        alter publication supabase_realtime add table public.session_reads;
    end if;
end $$;

-- The finished runs the caller has not looked at yet, one row per conversation, newest first. The
-- floor is the moment this migration ran: without it, every run ever finished would light up on the
-- first load. Security invoker, so the `notifications` and `sessions` policies still apply.
do $$
begin
    execute format($fn$
        create or replace function public.unseen_runs(p_workspace_id integer)
        returns table (session_id uuid, agent_id uuid, title text, source public.session_source, slug text, message text, last_at timestamptz, run_count integer)
        language sql
        stable
        security invoker
        set search_path = public
        as $body$
            select
                s.id,
                s.agent_id,
                s.title,
                s.source,
                (array_agg(coalesce(n.metadata ->> 'scheduleSlug', n.metadata ->> 'triggerSlug') order by n.created_at desc))[1],
                (array_agg(n.message order by n.created_at desc))[1],
                max(n.created_at),
                count(*)::integer
            from public.notifications n
            join public.sessions s on s.agent_id = n.agent_id and s.engine_session_id = n.engine_session_id
            left join public.session_reads r on r.session_id = s.id and r.user_id = auth.uid()
            where n.workspace_id = p_workspace_id
              and n.kind = 'done'
              and n.recipients ? auth.uid()::text
              and n.created_at > coalesce(r.seen_at, %L::timestamptz)
            group by s.id
            order by max(n.created_at) desc
            limit 500
        $body$
    $fn$, now());
end $$;

revoke all on function public.unseen_runs(integer) from public, anon;
grant execute on function public.unseen_runs(integer) to authenticated;
