-- A coworker's conversation in a channel or a direct message is no longer mirrored as a `sessions`
-- row: every member who can use the coworker's Box lists, reads, searches and continues those rows,
-- members of the channel or not. The hub stopped writing them (and the notifications of those runs,
-- whose message carried the start of the answer); this removes what installs that ran the earlier
-- code already hold. Rows that point at a removed session cascade (`session_reads`,
-- `session_participants`) or let go of it (`issues.session_id`, `message_feedback.session_id`).
--
-- Push order: after 20261112130000_channel_turn_endings, with or after the code that stops writing
-- them (an older hub would only write new ones). Re-runnable: each statement deletes what is left.

delete from public.sessions where source = 'channel';

delete from public.notifications n
using public.channel_agent_turns t
where t.engine_run_id is not null
  and n.workspace_id = t.workspace_id
  and n.engine_run_id = t.engine_run_id;

delete from public.notifications n
using public.channel_agent_sessions s
where n.workspace_id = s.workspace_id
  and n.engine_session_id = s.engine_session_id;
