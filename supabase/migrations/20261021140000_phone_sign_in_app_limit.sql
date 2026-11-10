-- The iOS app asks for sign-in codes without the captcha the web puts in front of them. Its sends get
-- a window of their own, smaller than everybody's: a script driving the app's routes runs out there
-- and leaves the rest of the budget to the web. The four-argument claim stays as it is for the web.

create or replace function public.claim_phone_sign_in_send(p_ip text, p_ip_max integer, p_global_max integer, p_window_seconds integer, p_app text, p_app_max integer)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ip_scope text := 'ip:' || p_ip;
    v_app_scope text := 'app:' || p_app;
    v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
    v_global_count integer;
    v_global_started_at timestamptz;
    v_app_count integer;
    v_app_started_at timestamptz;
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

    insert into public.phone_sign_in_send_limits (scope) values (v_app_scope) on conflict (scope) do nothing;
    select send_count, window_started_at into v_app_count, v_app_started_at from public.phone_sign_in_send_limits where scope = v_app_scope;

    if v_app_started_at < v_cutoff then
        v_app_count := 0;
        update public.phone_sign_in_send_limits set send_count = 0, window_started_at = now() where scope = v_app_scope;
    end if;

    if v_app_count >= p_app_max then
        return 'app';
    end if;

    insert into public.phone_sign_in_send_limits (scope) values (v_ip_scope) on conflict (scope) do nothing;
    select send_count into v_ip_count from public.phone_sign_in_send_limits where scope = v_ip_scope;

    if v_ip_count >= p_ip_max then
        return 'ip';
    end if;

    update public.phone_sign_in_send_limits set send_count = send_count + 1 where scope in ('everyone', v_app_scope, v_ip_scope);
    return 'ok';
end;
$$;

revoke execute on function public.claim_phone_sign_in_send(text, integer, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_phone_sign_in_send(text, integer, integer, integer, text, integer) to service_role;
