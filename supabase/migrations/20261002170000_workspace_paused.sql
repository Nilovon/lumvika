-- A workspace whose access ended no longer keeps a machine: its engine data-dir is archived to
-- object storage (see 20261002140000_workspace_archives) and the box destroyed. The agents and
-- Boxes stay in Supabase, so the board still draws them, locked.
--
-- `workspace_archives` is service-role only, and the client needs to know it is looking at a
-- paused workspace, or one being restored after a payment. This column is that signal, readable
-- with the rest of the workspace row: set when the box is destroyed after a verified archive,
-- cleared once a restore passes its canary. Paused = not entitled and set; restoring = entitled
-- and set.
alter table public.workspaces
    add column boxes_archived_at timestamptz;

create index workspaces_boxes_archived_at_idx
    on public.workspaces (boxes_archived_at) where boxes_archived_at is not null;
