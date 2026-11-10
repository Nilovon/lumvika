-- Supabase grants every privilege to anon and authenticated on any table created in public, and a
-- schema dump records the grants that remain rather than the revokes that removed them. These four
-- tables were stripped of that default on production, so a database rebuilt from the baseline hands
-- back truncate on the billing history to a role that holds nothing but the publishable key. Row
-- level security does not cover truncate.

revoke all on table public.creator_accounts from anon, authenticated;
revoke all on table public.stripe_events from anon, authenticated;
revoke all on table public.template_purchases from anon, authenticated;
revoke all on table public.template_sales from anon, authenticated;
