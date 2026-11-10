-- The member who created an API key, as an id. `created_by` stays the label shown in the list; it
-- was being read as the author of what a key starts, which an email never matches. Nullable: keys
-- created before this, and keys the back-office creates, have no member behind them.
alter table public.api_keys
    add column if not exists created_by_user_id uuid references public.users(id) on delete set null;
