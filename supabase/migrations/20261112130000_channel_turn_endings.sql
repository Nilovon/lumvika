-- Coworker turns in channels close from the engine's run-end webhook rather than from a request that
-- waits for the run. Two more ways a turn can end:
--   needs_input  the run stopped on a question or an approval for the person (no terminal event)
--   cancelled    someone stopped the run
-- and the run id is looked up by the webhook, so it gets an index.
--
-- Push order: after 20261112120000_channel_coworker_turns. Safe to push before the code that reads
-- it: it only widens a check and adds an index. Re-runnable.

alter table public.channel_agent_turns drop constraint if exists channel_agent_turns_failure_check;
alter table public.channel_agent_turns add constraint channel_agent_turns_failure_check
    check (failure is null or failure in ('engine_unreachable', 'engine_outdated', 'coworker_disabled', 'no_model', 'no_access', 'not_member', 'timeout', 'failed', 'needs_input', 'cancelled'));

create index if not exists channel_agent_turns_run_idx on public.channel_agent_turns (workspace_id, engine_run_id) where engine_run_id is not null;
