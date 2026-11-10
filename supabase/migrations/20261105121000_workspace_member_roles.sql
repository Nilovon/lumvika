-- A workspace has admins and members again. Admins run the workspace (billing, members, API keys,
-- AI providers, settings); members use it. Safe to push before the code that reads it.

do $$ begin
    create type public.workspace_role as enum ('admin', 'member');
exception when duplicate_object then null;
end $$;

-- 'admin' by default on purpose: every existing member keeps the rights they hold today, and a row
-- inserted without a role between this migration and the code that writes one (an accepted
-- invitation, the back-office) does not lose any. The code always writes the role explicitly.
alter table public.workspace_members
    add column if not exists role public.workspace_role not null default 'admin';

create index if not exists workspace_members_workspace_role_idx on public.workspace_members (workspace_id, role);

create or replace function public.current_admin_workspace_ids()
returns setof bigint
language sql
stable
security definer
set search_path to 'public'
as $$
    select workspace_id from public.workspace_members where user_id = auth.uid() and role = 'admin'
$$;

revoke all on function public.current_admin_workspace_ids() from public;
grant execute on function public.current_admin_workspace_ids() to authenticated;
