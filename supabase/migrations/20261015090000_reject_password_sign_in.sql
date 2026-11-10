-- Lumvika never issues a password: the web signs in by a code sent to the email or the phone, and
-- the phone flow opens its session with a magic link minted on the server. GoTrue still accepts
-- `signup {email, password}` with the publishable key, so anyone can create the account of an
-- address they do not own, with a password only they know. The real owner then gets "this email
-- already exists", receives a genuine code, confirms the attacker's account and builds on it, and
-- the attacker walks in with the password. The phone placeholder `<digits>@phone.lumvika.com` is
-- predictable, so the same works on a phone number.
--
-- This hook runs on every password sign-in and refuses it, whatever the password was worth: a
-- pre-planted password no longer opens anything. Its twin on staging and prod is armed by hand in
-- the dashboard, under Authentication > Hooks > Password Verification Attempt.
create or replace function public.password_verification_attempt(event jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'decision', 'reject',
        'message', 'Password sign-in is not available. Use the code sent to your email or phone.',
        'should_logout_user', false
    );
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.password_verification_attempt(jsonb) to supabase_auth_admin;
revoke execute on function public.password_verification_attempt(jsonb) from public, anon, authenticated;

-- Nobody signs up on a placeholder address: a phone account is created by the server with the
-- admin API, which `before_user_created` does not see, and a deleted account is renamed by SQL.
-- Pre-registering `<digits>@phone.lumvika.com` from the public signup would plant a password on a
-- number's future account and make the settings refuse that number as taken.
insert into public.blocked_email_domains (domain, note) values
    ('phone.lumvika.com', 'Placeholder address of a phone-born account, only the server files one'),
    ('deleted.lumvika.com', 'Placeholder address of a deleted account, only the server files one')
on conflict (domain) do nothing;
