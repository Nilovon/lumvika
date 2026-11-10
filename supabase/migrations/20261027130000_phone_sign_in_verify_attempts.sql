-- A code is checked by Bird, which counts the tries on its side; the App Review number is checked
-- here against a fixed code, and nothing counted its tries. Every check now takes one try out of a
-- window per number and one per caller address, before anything is compared. Same table as the
-- sends, under scopes of their own.

-- Counts one try, or says which window is full: 'ok', 'phone' or 'ip'. The try is counted first and
-- compared after, so calls fired together each see their own place in the window.
create or replace function public.claim_phone_sign_in_verify(p_phone text, p_ip text, p_phone_max integer, p_ip_max integer, p_window_seconds integer)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_phone_scope text := 'verify:phone:' || p_phone;
    v_ip_scope text := 'verify:ip:' || p_ip;
    v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
    v_phone_count integer;
    v_ip_count integer;
begin
    delete from public.phone_sign_in_send_limits where scope like 'verify:%' and window_started_at < v_cutoff;

    insert into public.phone_sign_in_send_limits (scope) values (v_phone_scope), (v_ip_scope) on conflict (scope) do nothing;

    update public.phone_sign_in_send_limits set send_count = send_count + 1 where scope = v_phone_scope returning send_count into v_phone_count;
    update public.phone_sign_in_send_limits set send_count = send_count + 1 where scope = v_ip_scope returning send_count into v_ip_count;

    if v_phone_count > p_phone_max then
        return 'phone';
    end if;
    if v_ip_count > p_ip_max then
        return 'ip';
    end if;
    return 'ok';
end;
$$;

revoke execute on function public.claim_phone_sign_in_verify(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_phone_sign_in_verify(text, text, integer, integer, integer) to service_role;
