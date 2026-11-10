-- What the company exploration found, as the onboarding board shows it: the cards, the sources still
-- being read, and whether it is done. Written by the explore-company task as each source lands and
-- read back by the board, so the cards survive a reload. Shape: CompanyFindingsRow in
-- apps/ui/lib/company/explore/findings.ts.
alter table public.workspace_onboarding add column if not exists company_findings jsonb;
