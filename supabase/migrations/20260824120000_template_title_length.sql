-- Catalogue cards and headings need a short product name. Reuse the already edited SEO title
-- where it fits, then name the exceptions explicitly: cutting at character 50 leaves broken words
-- and incomplete promises on the public page.
begin;

update public.templates
set
  title = meta_title,
  updated_at = now()
where char_length(title) > 50
  and nullif(btrim(meta_title), '') is not null
  and char_length(meta_title) <= 50;

update public.templates as template
set
  title = replacement.title,
  updated_at = now()
from (
  values
    ('weekly-ga4-traffic-report-email', 'Weekly GA4 traffic reports with anomaly flags'),
    ('audit-websites-conversion-seo-fixes', 'Audit sites for conversion, SEO and accessibility'),
    ('weekly-meeting-prep-briefs', 'Weekly meeting briefs from Calendar and HubSpot'),
    ('analyze-property-deals-apify', 'Analyze property deals and max offers via Apify'),
    ('track-competitor-changes-firecrawl', 'Track competitor changes with Firecrawl alerts'),
    ('seo-article-rewrite-plan', 'Build SEO rewrite plans from Search Console'),
    ('pre-meeting-briefs-from-bookings', 'Build pre-meeting company briefs via Monid'),
    ('weekly-cfo-diagnostics-from-quickbooks', 'Weekly CFO diagnostics from QuickBooks'),
    ('account-briefs-buying-signals', 'Build account briefs with Apollo buying signals'),
    ('detect-ticket-intent-log-hubspot', 'Turn Freshdesk tickets into HubSpot opportunities'),
    ('hiring-signal-leads-apollo-sheets', 'Turn job postings into B2B leads with Apollo'),
    ('triage-gmail-inbox-weekly', 'Triage Gmail weekly with labels and reply drafts'),
    ('produce-ai-shorts-with-buffer', 'Produce AI shorts with Higgsfield and Buffer'),
    ('weekly-billable-timesheet-from-activity', 'Build weekly timesheets from Gmail and GitHub'),
    ('shortlist-resumes-from-google-drive', 'Shortlist Drive resumes with Slack approval'),
    ('weekly-agency-client-roll-up', 'Weekly agency roll-up from ClickUp and HubSpot'),
    ('weekly-meta-ads-client-reports', 'Weekly Meta Ads reports in Google Docs and Slack'),
    ('ai-agent-for-logistics-order-processing-with-gpt-4o-gmail-and-google-sheet', 'Process logistics orders from Gmail with GPT-4o')
) as replacement(slug, title)
where template.slug = replacement.slug;

do $$
declare
  remaining_slugs text;
begin
  select string_agg(slug, ', ' order by slug)
  into remaining_slugs
  from public.templates
  where char_length(title) > 50;

  if remaining_slugs is not null then
    raise exception 'Templates still exceed the 50 character title limit: %', remaining_slugs;
  end if;
end
$$;

alter table public.templates
  add constraint templates_title_length_check
  check (char_length(title) <= 50);

commit;
