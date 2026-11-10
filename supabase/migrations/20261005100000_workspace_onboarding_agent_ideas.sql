-- The agents imagined for this company from its Brain, as the New agent dialog offers them Box by
-- Box. Written by the suggest-agent-ideas task once the Brain is seeded, 'running' first so a reader
-- can tell a run in flight from one that found nothing. Shape: StoredAgentIdeas in
-- apps/ui/lib/agent-ideas/stored.ts.
alter table public.workspace_onboarding add column if not exists agent_ideas jsonb;
