-- The template cards draw the isogrid board of a captured agent. The capture is stored as an
-- artefact rather than produced on demand, and there is one per theme: a light card in a dark
-- frame is a black slab.
alter table public.templates
  add column card_image_dark_url text,
  add column card_image_light_url text;

comment on column public.templates.card_image_dark_url is
  'Isogrid board capture, dark theme, served by the template cards. Written by the card renderer, never by the editor.';
comment on column public.templates.card_image_light_url is
  'Isogrid board capture, light theme, served by the template cards. Written by the card renderer, never by the editor.';

-- SELECT on this table is granted column by column (20260812121424_column_level_grants.sql), so a
-- new column is invisible to the landing until it is named here.
grant select (card_image_dark_url, card_image_light_url) on public.templates to anon;
grant select (card_image_dark_url, card_image_light_url) on public.templates to authenticated;
