-- A trial used to snapshot the base plan's agent count, and the gate capped it at 3 on read. The
-- column is now what a trial runs, so the trials in flight come down to the 3 they already ran.
-- Applied after the deploy: the previous webhook would write 5 back on the next subscription event.
update public.workspaces
set max_agents = 3
where subscription_status = 'trialing'
  and max_agents > 3;
