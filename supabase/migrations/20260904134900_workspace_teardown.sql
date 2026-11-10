-- Nothing ever happened when a workspace lost its access. `markSubscriptionCanceled` switched the
-- agents off and stopped there, and `cleanupWorkspaceResources` -- written for exactly this, and
-- documented as such -- had no caller at all, so an expired trial kept a machine running and
-- billing forever. These four columns are what the teardown needs the database to hold.

alter table public.workspaces
    -- When the subscription is scheduled to end. Null means it renews. Mirrors Stripe's
    -- `cancel_at`, which is the only trace a portal cancellation leaves.
    add column subscription_cancel_at timestamptz,
    -- The hard guardrail. Non-null means this workspace has been charged at least once, and its
    -- Box is never deleted automatically -- only powered off, for a human to dispose of later.
    add column first_paid_at timestamptz,
    add column boxes_disabled_at timestamptz,
    add column boxes_deleted_at timestamptz;

create index workspaces_subscription_cancel_at_idx
    on public.workspaces (subscription_cancel_at) where subscription_cancel_at is not null;

-- Backfill of the guardrail. Anyone entitled and not on a trial today has paid, and `past_due` is
-- a customer whose card just failed, not a stranger. Erring towards "has paid" is the safe side:
-- the worst case is a Box powered off instead of deleted.
update public.workspaces
   set first_paid_at = created_at
 where subscription_status in ('active', 'past_due');

-- The four new sequences are workspace-scoped, so they join the partial unique index or they
-- would be resendable every fifteen minutes. See the header of 20260903090100_lifecycle_emails.
drop index public.lifecycle_emails_once_per_workspace_idx;
create unique index lifecycle_emails_once_per_workspace_idx
    on public.lifecycle_emails (workspace_id, sequence_key)
    where sequence_key in ('team_invite', 'trial_started', 'trial_ended', 'trial_ending_3d',
                           'subscription_ending_7d', 'subscription_ending_3d', 'subscription_ending_24h');
