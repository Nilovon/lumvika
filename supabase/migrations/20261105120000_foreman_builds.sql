-- One team build at a time per workspace. Two requests reaching the hub while the workspace is in
-- the build phase used to run the build twice: every Box laid down twice, and the second copy of each
-- coworker refused on agents_workspace_handle_key, which is the result the user was shown. The row is
-- claimed before anything is written; a request that finds it taken waits for the result it holds.
-- `finished_at` null means a build is running; once set, `result` is what that build handed back.

create table public.foreman_builds (
    workspace_id bigint primary key references public.workspaces(id) on delete cascade,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    result jsonb
);

alter table public.foreman_builds enable row level security;
revoke all on table public.foreman_builds from anon, authenticated;
grant all on table public.foreman_builds to service_role;
