-- The widget dashboard is gone: no editor, no public render, no contract. The two tables held its
-- pages and their published versions, `workspaces.subdomain` existed only to serve those pages on
-- `<subdomain>.lumvika.site`, and `max_pages` was their per-plan quota.
--
-- Apply this before deploying the code that stops writing `subdomain`: the column is NOT NULL with
-- no default, so until it is dropped every workspace insert (signup, sandbox, provisioning) fails.
begin;

drop table if exists public.dashboard_page_versions;
drop table if exists public.dashboard_pages;

alter table public.workspaces
  drop column if exists subdomain,
  drop column if exists max_pages;

commit;
