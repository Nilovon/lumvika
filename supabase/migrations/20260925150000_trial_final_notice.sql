-- The two-hour notice before a trial ends is workspace-scoped like the other trial emails, so it
-- joins the partial unique index or a retry could send it twice. Same list as
-- 20260904134900_workspace_teardown plus `trial_ending_2h`.
drop index public.lifecycle_emails_once_per_workspace_idx;
create unique index lifecycle_emails_once_per_workspace_idx
    on public.lifecycle_emails (workspace_id, sequence_key)
    where sequence_key in ('team_invite', 'trial_started', 'trial_ended', 'trial_ending_2h', 'trial_ending_3d',
                           'subscription_ending_7d', 'subscription_ending_3d', 'subscription_ending_24h');
