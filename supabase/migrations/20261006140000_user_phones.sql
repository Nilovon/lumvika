-- The phone number a new web signup owes before entering the app, and the proof it was verified.
-- A row exists only for an account the step applies to: its absence means nothing is asked, which
-- is how every account older than this table, an invitee and a mobile signup stay untouched.
-- Kept off public.users on purpose: that row is updatable by its owner, so a verified flag there
-- could be self-granted. Here the owner reads their row and only the service role writes it.

create table public.user_phones (
    user_id uuid primary key references auth.users (id) on delete cascade,
    required_at timestamptz not null default now(),
    -- E.164, written when a code is sent, so it is only trustworthy once verified_at is set.
    phone text,
    channel text check (channel in ('sms', 'whatsapp')),
    verified_at timestamptz,
    -- Agreeing to be contacted is one line of copy under the send buttons, accepted by verifying.
    contact_consent_at timestamptz,
    send_count integer not null default 0,
    send_window_started_at timestamptz,
    last_sent_at timestamptz
);

alter table public.user_phones enable row level security;

-- RLS does not cover truncate, and Supabase's default privileges hand it to anon on every new table.
revoke all on table public.user_phones from anon, authenticated;
grant select on table public.user_phones to authenticated;

create policy "Users read their own phone"
on public.user_phones
as permissive
for select
to authenticated
using ((user_id = (select auth.uid())));
