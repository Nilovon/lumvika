-- Les hôtes bare metal qui portent les boxes Incus. Une ligne par serveur dédié, éditable depuis
-- /admin/pool, pour que le hub sache où provisionner et combien de boxes un hôte peut encore
-- porter. RLS sans policy: seule la service role y touche, comme engine_pool.
create table "public"."engine_hosts" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "public_ip" text not null,
    "ssh_user" text not null default 'root',
    "max_boxes" smallint not null default 40,
    "enabled" boolean not null default true,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

alter table "public"."engine_hosts" enable row level security;

alter table "public"."engine_hosts" add constraint "engine_hosts_pkey" primary key ("id");
alter table "public"."engine_hosts" add constraint "engine_hosts_name_key" unique ("name");
alter table "public"."engine_hosts" add constraint "engine_hosts_public_ip_key" unique ("public_ip");
alter table "public"."engine_hosts" add constraint "engine_hosts_max_boxes_check" check ("max_boxes" between 1 and 100);

alter table "public"."engine_pool" add column "host_id" uuid;
alter table "public"."engine_pool" add column "box_index" smallint;

alter table "public"."engine_pool" add constraint "engine_pool_host_id_fkey"
    foreign key ("host_id") references "public"."engine_hosts"("id") on delete set null;

-- L'allocateur d'index de box: le seul verrou qui empêche deux provisionnings parallèles de
-- réserver le même index, donc la même IP privée et le même port public sur l'hôte.
create unique index engine_pool_host_box_index_key
    on "public"."engine_pool" ("host_id", "box_index") where "host_id" is not null;
