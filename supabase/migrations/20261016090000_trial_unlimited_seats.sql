-- A trial has no seat cap any more (quantitiesToColumns): null means unlimited, as on a paid plan, so
-- the getting-started "Invite a teammate" step can be done before the first charge. The webhook only
-- rewrites the column on the next Stripe event, so the workspaces still holding a default cap are
-- lifted here: the trial's 1, set at signup before any trial too, and the 3 every account got before
-- that. Expert sandboxes keep their one seat, and a cap set by hand on any workspace that has paid or
-- lapsed is left alone: re-subscribing lifts it through the webhook.
update public.workspaces
set max_seats = null
where max_seats in (1, 3)
  and not is_sandbox
  and (subscription_status is null or subscription_status = 'trialing');

alter table public.workspaces alter column max_seats set default null;
