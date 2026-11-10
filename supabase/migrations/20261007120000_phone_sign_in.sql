-- A phone number is now a way to sign in and to sign up, so a code is asked for before any account
-- exists: the count of codes sent can no longer sit on user_phones, which is keyed by account. It is
-- kept per number here. Only the service role reads or writes it.

create table public.phone_sign_in_sends (
    -- E.164.
    phone text primary key,
    send_count integer not null default 0,
    send_window_started_at timestamptz,
    last_sent_at timestamptz
);

alter table public.phone_sign_in_sends enable row level security;

-- RLS does not cover truncate, and Supabase's default privileges hand it to anon on every new table.
revoke all on table public.phone_sign_in_sends from anon, authenticated;

-- Signing in looks up the account a verified number belongs to.
create index user_phones_verified_phone_idx on public.user_phones (phone) where verified_at is not null;
