-- The web is moving its email signups off the public `signup` endpoint: the server creates the
-- account with the admin API, then the browser asks for a code on an account that already exists.
-- `before_user_created` does not see an admin creation, so the two checks it stood for move to the
-- server too. Nothing here changes what the hook does yet.

-- The domain rule of `before_user_created`, written once so the hook and the server cannot drift.
-- Subdomains count: a catch-all has a wildcard DNS, blocking the root alone costs the attacker one
-- record.
create or replace function public.email_domain_is_blocked(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.blocked_email_domains b
        where split_part(lower(trim(p_email)), '@', 2) <> ''
          and (
              lower(b.domain) = split_part(lower(trim(p_email)), '@', 2)
              or split_part(lower(trim(p_email)), '@', 2) like '%.' || lower(b.domain)
          )
    );
$$;

revoke execute on function public.email_domain_is_blocked(text) from public, anon, authenticated;
grant execute on function public.email_domain_is_blocked(text) to service_role;

-- The public signup was held to `auth.rate_limit.sign_in_sign_ups` per caller address. The admin
-- API answers the server alone and holds nobody back, so account creations are counted here, per
-- caller address. Only the service role reads or writes them.
create table if not exists public.email_sign_up_limits (
    -- 'ip:' followed by the caller's address.
    scope text primary key,
    sign_up_count integer not null default 0,
    window_started_at timestamptz not null default now()
);

alter table public.email_sign_up_limits enable row level security;

revoke all on table public.email_sign_up_limits from anon, authenticated;

-- Takes one creation out of the caller's window, or answers false when it is full. An address whose
-- window has closed is deleted on the way: none is kept longer than a window.
create or replace function public.claim_email_sign_up(p_ip text, p_ip_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_scope text := 'ip:' || p_ip;
    v_count integer;
begin
    delete from public.email_sign_up_limits where window_started_at < now() - make_interval(secs => p_window_seconds);

    insert into public.email_sign_up_limits (scope) values (v_scope) on conflict (scope) do nothing;
    select sign_up_count into v_count from public.email_sign_up_limits where scope = v_scope for update;

    if v_count >= p_ip_max then
        return false;
    end if;

    update public.email_sign_up_limits set sign_up_count = sign_up_count + 1 where scope = v_scope;
    return true;
end;
$$;

revoke execute on function public.claim_email_sign_up(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_email_sign_up(text, integer, integer) to service_role;
