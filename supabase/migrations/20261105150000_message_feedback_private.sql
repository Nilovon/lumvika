-- A vote copies the whole transcript of its conversation, and the workspace-wide policy let any
-- member read the ones cast on a coworker of a Box they cannot reach. Nothing reads this table
-- through a member's token (the actions and /admin/feedback go through the service role), so it
-- closes like published_files: RLS on, no policy, no grant to the browser.
drop policy if exists "Members read their workspace message feedback" on public.message_feedback;
revoke select on table public.message_feedback from authenticated;
