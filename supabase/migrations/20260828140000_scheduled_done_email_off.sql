-- Until the engine started stamping `source` on run completions, every completion was read as an
-- interactive run, where `done` is off by default, so a schedule that succeeded emailed nobody. Now
-- that it is read as a scheduled run, the default flipped it on and every cron that succeeds would
-- email each opted-in member. `done` keeps its place in the app for scheduled tasks, where a run
-- nobody watched is worth a line, and loses it on email, where it is one message per occurrence.
--
-- `DEFAULT_NOTIFICATION_PREFS` is written whole at signup, so the new default only covers rows that
-- never stored the shape. Everyone else carries an explicit `true` and needs it turned over here.

update public.users
set email_notification_prefs = jsonb_set(email_notification_prefs, '{channels,email,scheduled,done}', 'false'::jsonb, false)
where email_notification_prefs #> '{channels,email,scheduled,done}' = 'true'::jsonb;

-- A `custom` per-agent rule carries its own channel matrix and is read instead of the global one,
-- so it holds a second copy of the same default.
with rebuilt as (
    select
        u.id,
        jsonb_object_agg(
            agent_rule.key,
            case
                when agent_rule.value #> '{channels,email,scheduled,done}' = 'true'::jsonb
                    then jsonb_set(agent_rule.value, '{channels,email,scheduled,done}', 'false'::jsonb, false)
                else agent_rule.value
            end
        ) as agents
    from public.users u
    cross join lateral jsonb_each(u.email_notification_prefs -> 'agents') as agent_rule
    where jsonb_typeof(u.email_notification_prefs -> 'agents') = 'object'
    group by u.id
)
update public.users u
set email_notification_prefs = jsonb_set(u.email_notification_prefs, '{agents}', rebuilt.agents, false)
from rebuilt
where rebuilt.id = u.id
    and rebuilt.agents is distinct from u.email_notification_prefs -> 'agents';
