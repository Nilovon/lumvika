-- The soul lives in SOUL.md on the engine, which is the only writer and the only reader that
-- matters. This column was a mirror nothing consumed, and because `agents` is readable by every
-- member of the workspace it handed the system prompt of a template's agents to the browser
-- before any panel was even opened. Dropping it removes the copy rather than hiding it.
begin;

alter table public.agents
  drop column soul_md;

commit;
