-- Results of a web search kept for a day, shared by every workspace: the same query asked again
-- within that day is answered from here instead of paying the search provider once more. Only the
-- service role reads or writes it.
create table public.web_search_cache (
    -- The query trimmed, lowercased and with its whitespace collapsed.
    query_key text primary key,
    -- The provider's results as returned to the engine: [{ title, url, snippet }].
    results jsonb not null,
    fetched_at timestamptz not null default now()
);

create index web_search_cache_fetched_at_idx on public.web_search_cache (fetched_at);

alter table public.web_search_cache enable row level security;
revoke all on table public.web_search_cache from anon, authenticated;
-- Stated rather than left to the default privileges, which do not hand it over on every stack.
grant all on table public.web_search_cache to service_role;

-- Whether the search was answered from web_search_cache, so the provider was not paid for it.
alter table public.web_search_events add column if not exists cached boolean not null default false;
