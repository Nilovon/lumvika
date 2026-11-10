-- Nothing relaunched a user who signed up and stopped, and nothing accompanied a trial. The
-- lifecycle sweeper does both, and it needs exactly one thing the database did not hold: what it
-- has already sent to whom. This table is that record, and it is also where the two global rules
-- of the sequences are enforced -- at most one non-urgent email per user per day, and a given
-- sequence never twice.

create type public.lifecycle_email_status as enum ('sent', 'failed');

create table public.lifecycle_emails (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    -- Kept as text rather than an enum: a sequence is retired by deleting it from sequences.ts, and
    -- Postgres cannot drop an enum value.
    sequence_key text not null,
    -- Set for the per-agent sequences only, null for the others.
    agent_id uuid references public.agents(id) on delete cascade,
    status public.lifecycle_email_status not null default 'sent',
    sent_at timestamptz not null default now(),
    metadata jsonb
);

-- The three scopes coexist in one table because the scope is a property of the sequence, not of the
-- row. These predicates mirror `scope` in apps/ui/lib/lifecycle/sequences.ts: a sequence added there
-- with a user or workspace scope must be added to the matching index here, or it will be resendable.
create unique index lifecycle_emails_once_per_user_idx
    on public.lifecycle_emails (user_id, sequence_key)
    where sequence_key in ('onboarding_resume', 'agent_recommendations', 'creator_pitch');
create unique index lifecycle_emails_once_per_workspace_idx
    on public.lifecycle_emails (workspace_id, sequence_key)
    where sequence_key in ('team_invite', 'trial_started', 'trial_ended');
create unique index lifecycle_emails_once_per_agent_idx
    on public.lifecycle_emails (agent_id, sequence_key)
    where agent_id is not null;

-- The daily cap reads this one: every row of a user, most recent first.
create index lifecycle_emails_user_recent_idx on public.lifecycle_emails (user_id, sent_at desc);

-- A `failed` row keeps its slot under the unique indexes, which is what stops a dead address from
-- being retried every fifteen minutes for a week. A deliberate resend deletes the row.
alter table public.lifecycle_emails enable row level security;
revoke all on table public.lifecycle_emails from anon, authenticated;

-- The sweeper's discovery queries: "which agents have never run", "which workspaces just left their
-- trial". Both scan tables that only had indexes for the app's own access patterns.
create index notifications_agent_event_idx on public.notifications (agent_id, event) where agent_id is not null;
create index agents_created_at_idx on public.agents (created_at);
create index workspaces_trial_ends_at_idx on public.workspaces (trial_ends_at) where trial_ends_at is not null;
