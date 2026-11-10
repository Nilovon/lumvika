-- Supabase Auth cannot read `infinity` out of `banned_until`: one such row makes every listing of
-- `auth.users` answer 500. A deleted account is banned for a century instead, like any other ban.
update auth.users set banned_until = now() + interval '100 years' where banned_until = 'infinity';

create or replace function public.anonymize_auth_user(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path to 'auth'
as $$
begin
    delete from auth.identities where user_id = p_user_id;
    delete from auth.mfa_factors where user_id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;
    delete from auth.refresh_tokens where user_id = p_user_id::text;

    update auth.users set
        email = p_email,
        phone = null,
        encrypted_password = '',
        raw_user_meta_data = '{}'::jsonb,
        raw_app_meta_data = '{"provider": "email", "providers": []}'::jsonb,
        banned_until = now() + interval '100 years'
    where id = p_user_id;
end;
$$;
