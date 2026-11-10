-- The phone wall follows its row: a number verified in another tab, the installed app or a phone
-- sign-in lifts the wall everywhere the account is open, not only in the tab that verified it. The
-- owner-only select policy already keeps each subscriber to their own row.
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'user_phones'
    ) then
        alter publication supabase_realtime add table public.user_phones;
    end if;
end $$;
