-- Which tables Realtime streams was set once in the production dashboard and never written down.
-- A schema dump does not carry publication membership, so the August baseline lost it, and
-- `db reset --linked` drops every table of `public` on its way: staging came back from each clone
-- with an empty `supabase_realtime`, where the board, the agent statuses and the notification
-- toasts only ever moved on a page reload. These are the seven tables `useRealtimeSubscription`
-- listens to, and the set production has been running with.
do $$
declare
    subscribed_table text;
begin
    foreach subscribed_table in array array[
        'agents',
        'notifications',
        'sessions',
        'spaces',
        'users',
        'workspace_members',
        'workspaces'
    ] loop
        if not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = subscribed_table
        ) then
            execute format('alter publication supabase_realtime add table public.%I', subscribed_table);
        end if;
    end loop;
end $$;
