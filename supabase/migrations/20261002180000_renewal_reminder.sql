-- "Remind me before I'm charged", asked for from the in-app cancel flow by a paying customer. The
-- lifecycle sweeper sends `renewal_reminder_7d` at `renewal_reminder_at` to the person who asked.
-- Both columns are overwritten by the next request, so a reminder asked again a month later simply
-- replaces the previous one. The sequence stays out of the once-only indexes on lifecycle_emails
-- for the same reason: the ladder dedupes it against the send date instead.
alter table public.workspaces
    add column renewal_reminder_at timestamptz,
    add column renewal_reminder_user_id uuid references public.users (id) on delete set null;

create index workspaces_renewal_reminder_at_idx on public.workspaces (renewal_reminder_at) where renewal_reminder_at is not null;
