-- A paid plan has no seat cap any more (quantitiesToColumns): null means unlimited. The webhook only
-- rewrites the column on the next Stripe event, so the workspaces already subscribed would keep the
-- old cap of 3 until their renewal. Trials keep what they hold: a seat is never taken away.
update public.workspaces
set max_seats = null
where subscription_status in ('active', 'past_due')
  and not is_sandbox;
