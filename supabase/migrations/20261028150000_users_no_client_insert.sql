-- The provisioning insert was the one write the browser could still make on public.users. Its policy
-- only tied `id` to auth.uid() and `workspace_id` was granted, so a signed-in visitor (anonymous
-- sign-in is open) could plant their row on any workspace before the app provisioned one, and every
-- server guard reading users.workspace_id then acted in that workspace. The insert now runs under
-- the service role, so the client needs no write on the table at all.
revoke insert on table public.users from authenticated;
drop policy if exists "Users can insert their own record" on public.users;

-- Inside a SECURITY DEFINER function `current_user` is the function's owner, never `authenticated`,
-- so this guard never fired. It reads nothing but NEW and OLD and needs no definer: as a plain
-- invoker function it sees the role PostgREST set for the request.
create or replace function public.prevent_user_workspace_change()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
    if new.workspace_id is distinct from old.workspace_id
       and current_user in ('authenticated', 'anon') then
        raise exception 'workspace_id is immutable';
    end if;
    return new;
end;
$function$;
