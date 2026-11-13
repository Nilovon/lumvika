-- The activity feed read straight from the table (the realtime feed included) answered more than the
-- server's feed: an event outside a project was readable by every member of the workspace. Three
-- kinds of those now follow what they are about, as `listActivityFeed` does:
--   a channel event    only for whoever reads the channel (its name, a private one's included)
--   a coworker event   only for whoever reaches the coworker's Box (its title, its manager)
--   a team membership  of a coworker, only for whoever reaches the coworker's Box
-- Every other event keeps the rule it had: the workspace, and the project when it has one.
--
-- Push order: after 20261110120300_channels (visible_channel_ids) and 20261105130000_space_access
-- (visible_agent_ids). It only narrows a read policy, so it can go before or after the code.
-- Re-runnable.

drop policy if exists activity_events_select_visible on public.activity_events;
create policy activity_events_select_visible on public.activity_events for select to authenticated
    using (
        workspace_id in (select public.current_workspace_ids())
        and (project_id is null or project_id in (select public.visible_project_ids()))
        and (entity_type <> 'channel' or entity_id in (select public.visible_channel_ids()))
        and (entity_type <> 'agent' or entity_id in (select public.visible_agent_ids()))
        and (
            entity_type <> 'team'
            or coalesce(metadata ->> 'agentId', '') = ''
            or (metadata ->> 'agentId') in (select visible.id::text from public.visible_agent_ids() as visible (id))
        )
    );
