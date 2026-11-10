-- The contract half of the move: the columns the old code read are dropped, now that no deployed
-- code reads them. PUSH THIS ONLY ONCE THE NEW CODE IS LIVE AND VERIFIED.
--
-- `workspaces.max_spaces` and `spaces.engine_host` are named in explicit select lists, and
-- PostgREST answers 400 on a column it does not know: running this against the old code takes the
-- session down for everyone.

-- Anything the old code claimed during the deploy window, before the claim moved up to the
-- workspace. The trigger below kept this true; this is its last act.
update public.engine_pool p
   set claimed_by_workspace_id = s.workspace_id
  from public.spaces s
 where s.id = p.claimed_by_space_id and p.claimed_by_workspace_id is null;

drop trigger engine_pool_sync_claimed_workspace on public.engine_pool;
drop function public.engine_pool_sync_claimed_workspace();

alter table public.engine_pool drop column claimed_by_space_id;

alter table public.spaces drop column engine_host;
alter table public.spaces drop column engine_api_key;
alter table public.spaces drop column pool_instance_id;

alter table public.workspaces drop column max_spaces;

-- Two Boxes of one workspace share one engine, where a handle must stay unique. It used to be
-- scoped per Box, which was the same thing back when a Box was a machine.
drop index if exists public.agents_space_handle_uniq;
create unique index agents_workspace_handle_key
    on public.agents (workspace_id, handle) where handle is not null;
