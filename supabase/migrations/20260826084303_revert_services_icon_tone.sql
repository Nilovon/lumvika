-- Recorded after the fact: this migration only ever existed in the production history table, applied
-- from the dashboard. `services.icon_tone` and its enum were added by hand too, so on a database
-- rebuilt from the migrations alone both statements are no-ops; the file exists so the local history
-- and the remote one line up.
alter table public.services drop column if exists icon_tone;

drop type if exists public.icon_tone;
