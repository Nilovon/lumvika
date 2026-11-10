-- A user who deletes their account is anonymized, not deleted: `public.users` cascades from
-- `auth.users`, and deleting the auth row would take with it the memberships and the steward
-- conversations that are kept to trace a bug back.
alter table "public"."users" add column "deleted_at" timestamptz;

-- Turns an auth user into a shell nobody can sign into. Its identities go, so the same Google
-- account or address signs up afresh instead of being matched to this row, and the ban holds
-- even if a stale token is replayed. The admin API cannot delete an identity, hence the SQL.
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
        banned_until = 'infinity'
    where id = p_user_id;
end;
$$;

revoke execute on function public.anonymize_auth_user(uuid, text) from public, anon, authenticated;
-- Stated rather than left to the default privileges, which do not hand it over on every stack.
grant execute on function public.anonymize_auth_user(uuid, text) to service_role;
