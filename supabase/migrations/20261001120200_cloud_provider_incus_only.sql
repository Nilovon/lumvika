-- Every box runs on Incus since the fleet left AWS (07/09); the hub no longer knows another
-- provider. A Postgres enum cannot lose a label, so the type is rebuilt.

do $$
begin
    if exists (select 1 from public.engine_pool where provider::text <> 'incus') then
        raise exception 'engine_pool still holds rows on another provider than incus';
    end if;
end $$;

alter table public.engine_pool alter column provider drop default;
alter type public.cloud_provider rename to cloud_provider_old;
create type public.cloud_provider as enum ('incus');
alter table public.engine_pool alter column provider type public.cloud_provider using provider::text::public.cloud_provider;
alter table public.engine_pool alter column provider set default 'incus';
drop type public.cloud_provider_old;
