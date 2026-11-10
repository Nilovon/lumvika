-- The "Remix this Box" lead magnet is gone: no page reads this prompt, no button offers it, and the
-- admin field that wrote it has been removed. The column was the last trace of the feature.
begin;

alter table public.dashboard_pages
  drop column remix_prompt;

commit;
