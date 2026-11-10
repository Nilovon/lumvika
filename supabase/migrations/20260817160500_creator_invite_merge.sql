-- The marketplace claim link and the creator acceptance link were two ways of writing to the same
-- people. They are now one email pointing at /creator/join/<creator_token>, so a single date says
-- when it left.

update public.experts set invited_at = coalesce(invited_at, creator_invited_at) where creator_invited_at is not null;

alter table public.experts drop column creator_invited_at;

-- `creator_token` is the capability that opens an account with a sandbox, and the baseline dump
-- left a table-level SELECT to `authenticated` that the column-level grants never revoked. Combined
-- with the `public read published experts` policy, any logged-in account could read the token (and
-- claim_token, and email) of any published expert. Same column list as anon, nothing more.
revoke select on public.experts from authenticated;
grant select (availability, avatar_url, banner_url, bio, budget, created_at, featured, github_url, id, languages, linkedin_url, location, name, seo_indexed, skills, slug, status, type, updated_at, website_url, x_url) on public.experts to authenticated;
