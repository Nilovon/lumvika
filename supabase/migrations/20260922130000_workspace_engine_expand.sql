-- A Box stops being a machine. The engine now belongs to the workspace, and `spaces` keeps only
-- what it always drew: a rectangle on the board and a name.
--
-- The machine stays in `engine_pool`, which already holds the host and the key, has RLS on with no
-- policy and no grant to anon or authenticated. `workspaces` could not hold them: it is
-- select-granted table-wide to both roles and replicated to the browser over realtime, and the key
-- is full control of the VPS.
--
-- Everything here is additive or permissive, so the currently deployed code goes on working while
-- it is applied. The columns it still reads are dropped by a second migration, once the new code
-- is live.

alter table public.engine_pool add column claimed_by_workspace_id bigint;

alter table public.engine_pool
    add constraint engine_pool_claimed_by_workspace_id_fkey
    foreign key (claimed_by_workspace_id) references public.workspaces(id) on delete set null;

update public.engine_pool p
   set claimed_by_workspace_id = s.workspace_id
  from public.spaces s
 where s.id = p.claimed_by_space_id;

-- One workspace, one machine, held by Postgres. This index refuses to build while a workspace
-- still claims two engines, which makes it the proof that the split ran first. It is also what
-- turns a double claim (two onboarding tabs, a retry) into a clean loser rather than a second VPS.
create unique index engine_pool_claimed_by_workspace_id_key
    on public.engine_pool (claimed_by_workspace_id)
    where claimed_by_workspace_id is not null;

-- The engine proves its identity with this key, the way it did against spaces_engine_api_key_key.
create unique index engine_pool_engine_api_key_key on public.engine_pool (engine_api_key);

alter table public.spaces alter column engine_host drop not null;

-- A Box becomes free and deletable, so what points at one must survive it leaving.
alter table public.notifications alter column space_id drop not null;
alter table public.notifications drop constraint notifications_space_id_fkey;
alter table public.notifications
    add constraint notifications_space_id_fkey
    foreign key (space_id) references public.spaces(id) on delete set null;

alter table public.published_files alter column space_id drop not null;
alter table public.published_files drop constraint published_files_space_id_fkey;
alter table public.published_files
    add constraint published_files_space_id_fkey
    foreign key (space_id) references public.spaces(id) on delete set null;

-- Moving an agent between two Boxes becomes a browser-side update, and the agents update policy
-- only proves the workspace. Without this composite key, a crafted call could park an agent in
-- another workspace's Box; with it, the database refuses.
create unique index spaces_id_workspace_id_key on public.spaces (id, workspace_id);

alter table public.agents drop constraint agents_space_id_fkey;
alter table public.agents
    add constraint agents_space_id_fkey
    foreign key (space_id, workspace_id) references public.spaces (id, workspace_id) on delete cascade;
