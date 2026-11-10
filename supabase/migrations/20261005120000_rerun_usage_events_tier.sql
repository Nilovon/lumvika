-- Rerun now runs three tiers (fast, balanced, smart) where it ran one model. `model` keeps the
-- upstream id the hub resolved the tier to, which changes whenever that choice does; `tier` is what
-- stays comparable over time.
alter table public.rerun_usage_events add column if not exists tier text;

-- Everything billed so far was the single model that is now Balanced, except the onboarding foreman,
-- which has always run on the model Smart resolves to.
update public.rerun_usage_events
set tier = case when model = 'openai/gpt-6-sol' then 'smart' else 'balanced' end
where tier is null;
