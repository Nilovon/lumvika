-- Account connectors a coworker can hold twice (two Gmail inboxes, two Notion workspaces). Paid
-- apps stay out: their account belongs to the workspace and is billed by the slot.
update public.services
   set manifest = manifest || jsonb_build_object('multiInstance', true), updated_at = now()
 where slug in (
   'gmail', 'google-calendar', 'google-drive', 'google-docs', 'google-sheets', 'google-slides',
   'google-meet', 'google-tasks', 'google-photos', 'google-search-console', 'google-analytics', 'google-bigquery',
   'outlook', 'instagram', 'youtube', 'reddit', 'linkedin', 'canva',
   'facebook', 'typeform',
   'github', 'notion', 'linear', 'atlassian', 'jira', 'asana', 'monday', 'airtable', 'clickup', 'dropbox', 'calendly',
   'stripe', 'supabase', 'neon', 'sentry', 'posthog', 'mixpanel', 'amplitude', 'intercom', 'pipedrive', 'kit', 'klaviyo',
   'slack'
 );
