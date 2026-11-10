-- The WhatsApp trial sequence counts its days from here. Stripe's trial_start, written by the
-- subscription sync: it stays put when the Getting Started reward pushes trial_end back, where
-- "trial_ends_at minus five days" would jump forward and restart the sequence.
alter table public.workspaces add column if not exists trial_started_at timestamptz;

-- A trial running today has no sync coming before it converts, so its start is set here: five days
-- before its end, eight for one the reward already extended.
update public.workspaces w
set trial_started_at = w.trial_ends_at - interval '5 days'
    - case when exists (select 1 from public.workspace_getting_started g where g.workspace_id = w.id and g.item = 'reward')
           then interval '3 days' else interval '0' end
where w.trial_started_at is null and w.trial_ends_at is not null and w.subscription_status = 'trialing';
