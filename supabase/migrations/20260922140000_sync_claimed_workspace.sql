-- The deployed code still binds a pool row to a Box, and will until the claim moves up to the
-- workspace. Without this, an engine claimed between now and that deploy would carry no
-- workspace, and an engine nobody claims authenticates as nobody: its webhooks, its Hub MCP calls
-- and its LLM proxy calls would all answer 401 for a customer who just signed up.
--
-- Fires only when `claimed_by_space_id` is written, so the code that writes the workspace directly
-- never goes through it. It is deleted with the column it mirrors.

create function public.engine_pool_sync_claimed_workspace() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if new.claimed_by_space_id is null then
        new.claimed_by_workspace_id := null;
    else
        select workspace_id into new.claimed_by_workspace_id from public.spaces where id = new.claimed_by_space_id;
    end if;
    return new;
end $$;

create trigger engine_pool_sync_claimed_workspace
    before insert or update of claimed_by_space_id on public.engine_pool
    for each row execute function public.engine_pool_sync_claimed_workspace();
