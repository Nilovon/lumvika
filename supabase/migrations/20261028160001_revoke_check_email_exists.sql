-- check_email_exists reads auth.users as SECURITY DEFINER and was left on the default EXECUTE
-- grant, so the anon key could probe any address through PostgREST. Every caller holds the service
-- role.
revoke execute on function public.check_email_exists(text) from public, anon, authenticated;
grant execute on function public.check_email_exists(text) to service_role;
