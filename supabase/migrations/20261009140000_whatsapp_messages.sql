-- Lifecycle email lands in spam, so the trial sequence moves to WhatsApp. This is the record of
-- every WhatsApp template Rerun sends: what was sent to whom, and what became of it, which only the
-- Bird webhook knows (delivered, read, failed). The row is written before the send, so a message
-- that left always has one, and its id travels with the message as the webhook's way back.

create table public.whatsapp_messages (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id uuid not null references public.users(id) on delete cascade,
    workspace_id bigint references public.workspaces(id) on delete cascade,
    agent_id uuid references public.agents(id) on delete cascade,
    -- The number the message was meant for, kept because user_phones.phone can change afterwards.
    phone text not null,
    -- Text rather than an enum, like lifecycle_emails.sequence_key: a template is retired by deleting
    -- it from templates.ts, and Postgres cannot drop an enum value.
    template_key text not null,
    language text not null,
    category text not null check (category in ('marketing', 'utility')),
    -- What the caller calls "the same message": a second send under the same key is refused.
    dedupe_key text unique,
    bird_message_id text unique,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'rejected')),
    sent_at timestamptz,
    delivered_at timestamptz,
    read_at timestamptz,
    failed_at timestamptz,
    error_code text,
    meta_error_code text,
    error text
);

-- A per-person cap on messages reads this one: every row of a user, most recent first.
create index whatsapp_messages_user_recent_idx on public.whatsapp_messages (user_id, created_at desc);

alter table public.whatsapp_messages enable row level security;
revoke all on table public.whatsapp_messages from anon, authenticated;

-- Two reasons a verified, consenting number is no longer written to. Bird blocks an opted-out number
-- on its own side too: the copy here is what saves paying for a send that is bound to be refused.
alter table public.user_phones
    add column whatsapp_opted_out_at timestamptz,
    add column whatsapp_unreachable_at timestamptz;
