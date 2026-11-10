-- A scheduled or triggered run is first titled after its routine, and every run of that routine then
-- reads the same in the list. Once the run is over, the hub retitles the session with what it did:
-- `automation_name` keeps the routine's name, `outcome` how the run ended.
do $$ begin
    create type public.session_outcome as enum ('done', 'nothing', 'failed');
exception when duplicate_object then null;
end $$;

alter table public.sessions add column if not exists automation_name text;
alter table public.sessions add column if not exists outcome public.session_outcome;

update public.sessions set automation_name = title where source in ('schedule', 'trigger') and automation_name is null;
