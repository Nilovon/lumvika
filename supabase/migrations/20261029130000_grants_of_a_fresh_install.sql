-- A database rebuilt from the migrations did not get every privilege production has: recent
-- Supabase stacks no longer hand new tables and functions to service_role by default, and some
-- grants were only ever ticked in the production dashboard. The app then fails on its first heartbeat
-- (`permission denied for table user_presence`). Production already holds all of this.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
-- Only the functions of the app: the pgvector ones in this schema belong to another owner.
do $$
declare
    fn regprocedure;
begin
    for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proowner = current_user::regrole and p.prokind = 'f' loop
        execute format('grant execute on function %s to service_role', fn);
    end loop;
end;
$$;

-- The client-side grants production has on these tables. Row level security is on for each, so
-- their policies keep deciding who reads what.
grant select, insert, update, delete on table
    public.device_tokens,
    public.engine_box_metrics,
    public.engine_host_metrics,
    public.engine_hosts,
    public.notification_push_dispatches,
    public.session_participants,
    public.session_reads
to anon, authenticated;
