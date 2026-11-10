-- A workspace can pause its Rerun credit: while it is paused, the hub refuses every Rerun model call and
-- every paid data call, so nothing is spent without the members agreeing to it. Null is the default, the
-- credit is on; a date is when it was paused.
alter table public.workspaces add column if not exists rerun_credit_paused_at timestamptz;
