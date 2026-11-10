-- A newsletter issue is a .tsx file in the registry, never a row. What the database holds is what
-- cannot live in the code: which issue went out, to whom, and how far the send got.

create type public.newsletter_send_status as enum ('queued', 'sending', 'sent', 'failed', 'canceled');
create type public.newsletter_recipient_status as enum ('pending', 'sent', 'failed', 'skipped');

create table public.newsletter_sends (
    id uuid primary key default gen_random_uuid(),
    -- The slug of the .tsx. Text rather than an enum: an issue is added by writing a file, and
    -- Postgres cannot drop an enum value.
    slug text not null,
    subject text not null,
    status public.newsletter_send_status not null default 'queued',
    audience_size integer not null default 0,
    sent_count integer not null default 0,
    failed_count integer not null default 0,
    skipped_count integer not null default 0,
    run_id text,
    error text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz
);

-- One live send per issue: resuming means picking this row back up, not opening a second one. A
-- canceled send steps out of the way so an issue can be started over from scratch.
create unique index newsletter_sends_slug_idx on public.newsletter_sends (slug) where status <> 'canceled';
create index newsletter_sends_created_at_idx on public.newsletter_sends (created_at desc);

create table public.newsletter_recipients (
    id uuid primary key default gen_random_uuid(),
    send_id uuid not null references public.newsletter_sends(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    -- Frozen when the audience is materialised: the address lives in auth.users, and a send has to
    -- stay auditable after the account is gone.
    email text not null,
    status public.newsletter_recipient_status not null default 'pending',
    email_id text,
    error text,
    sent_at timestamptz,
    created_at timestamptz not null default now()
);

-- The whole idempotence of a send rests here: a resume re-materialises the same audience, the
-- conflict discards the rows already there, and the loop picks up the ones still pending.
create unique index newsletter_recipients_unique_idx on public.newsletter_recipients (send_id, user_id);
create index newsletter_recipients_pending_idx on public.newsletter_recipients (send_id, status, user_id);

alter table public.newsletter_sends enable row level security;
alter table public.newsletter_recipients enable row level security;
revoke all on table public.newsletter_sends from anon, authenticated;
revoke all on table public.newsletter_recipients from anon, authenticated;
