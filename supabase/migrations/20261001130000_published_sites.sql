-- A published entry is either one file, or a whole folder served as a site from <slug>.lumvika.site.
-- For a site, storage_key is the versioned folder prefix and files lists every path under it,
-- relative to that prefix: the route serving the site answers 404 from it without asking Storage.
alter table public.published_files
    add column kind text not null default 'file' check (kind in ('file', 'site')),
    add column files text[];
