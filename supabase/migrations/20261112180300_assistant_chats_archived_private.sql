-- A shared assistant chat its owner archived leaves the list of everyone else: the server already
-- hid it (`listAssistantChats`, `readableChat`), but the table policy still let other members read
-- it. They now read a shared chat only while it is not archived; its owner still reads it either way.
--
-- Push order: after 20261110120400_assistant_chats. It only narrows a read policy. Re-runnable.

drop policy if exists assistant_chats_select_owner_or_shared on public.assistant_chats;
create policy assistant_chats_select_owner_or_shared on public.assistant_chats for select to authenticated
    using (
        user_id = auth.uid()
        or (
            shared
            and archived_at is null
            and workspace_id in (select public.current_workspace_ids())
            and (project_id is null or project_id in (select public.visible_project_ids()))
        )
    );
