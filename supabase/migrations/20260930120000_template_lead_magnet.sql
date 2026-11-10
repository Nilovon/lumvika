-- A template page used as a lead magnet: on a phone, a visitor landing on it straight from a link
-- gets a sheet with the board and the call to action a few seconds in. Admin-only, like `featured`.
alter table public.templates
  add column lead_magnet boolean not null default false;

comment on column public.templates.lead_magnet is
  'Opens the call-to-action sheet on the public page for direct mobile visits. Set in the admin editor only.';

-- SELECT on this table is granted column by column (20260812121424_column_level_grants.sql), so a
-- new column is invisible to the landing until it is named here.
grant select (lead_magnet) on public.templates to anon;
grant select (lead_magnet) on public.templates to authenticated;
