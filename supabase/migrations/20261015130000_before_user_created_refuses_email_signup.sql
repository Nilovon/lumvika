-- Rerun never issues a password, and the hook that would refuse one at sign-in is not on our
-- Supabase plan. What is left is to keep a password from being planted: the public `signup`, and
-- `signInWithOtp` with `shouldCreateUser`, both create an account with `provider = 'email'`, and the
-- first carries a password of the caller's choosing. The hook cannot tell the two apart, so it
-- refuses both. The web creates its email accounts on the server with the admin API, which this
-- hook does not see, then asks for a code on an account that already exists; the phone flow does the
-- same under its placeholder address. Anonymous visitors, Google and Apple go through as before.
--
-- To ship only once the web code that creates accounts on the server is live: before it, every
-- email signup on the web is refused.
create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    candidate text;
begin
    if event -> 'user' -> 'app_metadata' ->> 'provider' in ('email', 'phone') then
        return jsonb_build_object(
            'error',
            jsonb_build_object('http_code', 403, 'message', 'Sign up on rerun.build with the code sent to your email, or with Google.')
        );
    end if;

    -- The user sits under `user`; an email at the root is still read, as in the first version of
    -- this hook: a wrong guess at the shape would cut every signup, not only the unwanted ones.
    candidate := coalesce(event -> 'user' ->> 'email', event ->> 'email', '');
    if public.email_domain_is_blocked(candidate) then
        return jsonb_build_object(
            'error',
            jsonb_build_object('http_code', 400, 'message', 'This email domain is not accepted. Use another address.')
        );
    end if;

    return '{}'::jsonb;
end;
$$;

grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.before_user_created(jsonb) from public, anon, authenticated;
