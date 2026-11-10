-- A workspace's engine data-dir, archived to Hetzner Object Storage so its box can be destroyed and
-- the workspace brought back later on another one. The object itself lives in the bucket; this row
-- is what the hub knows about it. Service-role only: nothing here is for a member to read.

create type public.workspace_archive_status as enum ('archiving', 'archived', 'restoring', 'restored', 'failed');

create table public.workspace_archives (
    id uuid primary key default gen_random_uuid(),
    workspace_id bigint not null references public.workspaces (id) on delete cascade,
    -- 'failed' is an archive that never completed. A restore that fails leaves the row 'archived',
    -- with the reason in error_message: the archive itself is still good.
    status public.workspace_archive_status not null default 'archiving',
    object_key text not null unique,
    -- Of the encrypted object, as uploaded and read back.
    bytes bigint,
    sha256 text,
    -- The data-dir on disk before compression, to refuse a restore onto a box too small for it.
    raw_bytes bigint,
    data_version integer,
    engine_commit text,
    -- By name as well as id: a host row can be deleted, the archive outlives it.
    source_host_id uuid references public.engine_hosts (id) on delete set null,
    source_host_name text not null,
    source_box text not null,
    restored_to_instance_id uuid references public.engine_pool (id) on delete set null,
    error_message text,
    created_at timestamptz not null default now(),
    archived_at timestamptz,
    restored_at timestamptz,
    -- The bucket's lifecycle rule deletes the object 90 days after upload; this mirrors it.
    expires_at timestamptz
);

create index workspace_archives_workspace_idx on public.workspace_archives (workspace_id, created_at desc);

-- One job at a time per workspace: two archives racing would each stop the engine under the other.
create unique index workspace_archives_one_job_per_workspace_idx
    on public.workspace_archives (workspace_id)
    where status in ('archiving', 'restoring');

alter table public.workspace_archives enable row level security;
-- RLS does not cover truncate, and Supabase's default privileges hand it to anon on every new table.
revoke all on table public.workspace_archives from anon, authenticated;
