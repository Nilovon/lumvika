-- The last code mailed to an address, kept while it is still good. Supabase Auth holds one code per
-- user and every new request voids the one before, so an email that lands late carries a dead code.
-- Asking again within the code's life mails this same code instead of minting another.
-- Service-role only. Nothing here is more than auth.users already holds: the token hash alone signs in.

create table public.sign_in_codes (
    -- The address the code was mailed to. For an email change that is the claimed address.
    email text primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    -- The hook's email_action_type, which is also the type /auth/confirm verifies the hash with.
    type text not null,
    code text not null,
    token_hash text not null,
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_sent_at timestamptz not null default now(),
    send_count integer not null default 1
);

create index sign_in_codes_expires_at_idx on public.sign_in_codes (expires_at);

alter table public.sign_in_codes enable row level security;
-- RLS does not cover truncate, and Supabase's default privileges hand it to anon on every new table.
revoke all on table public.sign_in_codes from anon, authenticated;
