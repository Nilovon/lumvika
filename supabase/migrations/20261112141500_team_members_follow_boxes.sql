-- A coworker's team membership is read only by whoever can see the coworker's Box: a member scoped
-- to assigned Boxes no longer learns which coworkers of other Boxes sit in a team. Rows of people
-- stay readable by the whole workspace, as before.
drop policy if exists team_members_select_workspace_members on public.team_members;
create policy team_members_select_workspace_members on public.team_members for select to authenticated
    using (
        workspace_id in (select public.current_workspace_ids())
        and (agent_id is null or agent_id in (select public.visible_agent_ids()))
    );
