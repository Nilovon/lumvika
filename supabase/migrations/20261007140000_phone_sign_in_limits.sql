-- A code asked for before any account exists is only counted per number, so a script that changes
-- number at every call is never held back. Two more counters bound it: one per caller address, one
-- for everybody, which is what caps the SMS bill whatever the callers do. Only the service role
-- reads or writes them.

create table public.phone_sign_in_send_limits (
    -- 'everyone', or 'ip:' followed by the caller's address.
    scope text primary key,
    send_count integer not null default 0,
    window_started_at timestamptz not null default now()
);

alter table public.phone_sign_in_send_limits enable row level security;

revoke all on table public.phone_sign_in_send_limits from anon, authenticated;

-- Takes one send out of both windows, or says which one is full: 'ok', 'ip' or 'global'. Every
-- call locks the 'everyone' row first, so calls fired together are counted one after the other.
-- An address whose window has closed is deleted on the way: none is kept longer than a window.
create or replace function public.claim_phone_sign_in_send(p_ip text, p_ip_max integer, p_global_max integer, p_window_seconds integer)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ip_scope text := 'ip:' || p_ip;
    v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
    v_global_count integer;
    v_global_started_at timestamptz;
    v_ip_count integer;
begin
    insert into public.phone_sign_in_send_limits (scope) values ('everyone') on conflict (scope) do nothing;

    select send_count, window_started_at into v_global_count, v_global_started_at
    from public.phone_sign_in_send_limits
    where scope = 'everyone'
    for update;

    if v_global_started_at < v_cutoff then
        v_global_count := 0;
        update public.phone_sign_in_send_limits set send_count = 0, window_started_at = now() where scope = 'everyone';
    end if;

    delete from public.phone_sign_in_send_limits where scope like 'ip:%' and window_started_at < v_cutoff;

    if v_global_count >= p_global_max then
        return 'global';
    end if;

    insert into public.phone_sign_in_send_limits (scope) values (v_ip_scope) on conflict (scope) do nothing;
    select send_count into v_ip_count from public.phone_sign_in_send_limits where scope = v_ip_scope;

    if v_ip_count >= p_ip_max then
        return 'ip';
    end if;

    update public.phone_sign_in_send_limits set send_count = send_count + 1 where scope in ('everyone', v_ip_scope);
    return 'ok';
end;
$$;

revoke execute on function public.claim_phone_sign_in_send(text, integer, integer, integer) from public, anon, authenticated;
-- Stated rather than left to the default privileges, which do not hand it over on every stack.
grant execute on function public.claim_phone_sign_in_send(text, integer, integer, integer) to service_role;
