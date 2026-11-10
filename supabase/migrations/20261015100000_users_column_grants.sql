-- The baseline granted every privilege on public.users to anon and authenticated, and the update
-- policy only checks `auth.uid() = id`: a signed-in browser could set its own `account_role` to
-- `expert` and point `expert_profile_id` at any published profile, which the server then believes
-- (free sandbox, template author tools, takeover of a profile not yet linked to an account).
--
-- The app never writes public.users from the browser. The one write under RLS is the provisioning
-- insert of the row itself, through the request client so `auth.uid()` ties it to its owner, and it
-- only ever sets these four columns. Everything else is service role.
revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;
grant insert (id, workspace_id, email_notification_prefs, signed_up_at) on table public.users to authenticated;
