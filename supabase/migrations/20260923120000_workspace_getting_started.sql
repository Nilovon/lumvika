-- La checklist « Getting started » de la pastille du board : une ligne par étape acquise, jamais
-- supprimée, pour qu'une coche ne se défasse pas quand on supprime l'agent qui l'avait gagnée.
-- `reward` est la réservation des jours de trial offerts (posée avant l'appel Stripe, retirée s'il
-- échoue), `dismissed` le « Hide » de l'owner.
--
-- Chaque étape s'écrit là où la chose naît : les triggers ci-dessous pour ce qui vit dans Supabase
-- (agents, invitations, membres), le webhook engine pour ce qui vit sur la machine (connexions IA,
-- schedules). La table est dans la publication realtime : la pastille se coche à la seconde.
--
-- Lecture pour les membres du workspace, écriture réservée au service role et aux triggers : un
-- client qui pourrait insérer sa ligne `reward` ou ses étapes se servirait lui-même en jours de trial.
create table "public"."workspace_getting_started" (
    "workspace_id" bigint not null,
    "item" text not null,
    "done_at" timestamp with time zone not null default now()
);

alter table "public"."workspace_getting_started" enable row level security;

alter table "public"."workspace_getting_started" add constraint "workspace_getting_started_pkey" primary key ("workspace_id", "item");
alter table "public"."workspace_getting_started" add constraint "workspace_getting_started_workspace_id_fkey"
    foreign key ("workspace_id") references "public"."workspaces"("id") on delete cascade;
alter table "public"."workspace_getting_started" add constraint "workspace_getting_started_item_check"
    check ("item" in ('first_agent', 'ai_provider', 'invite', 'schedule', 'reward', 'dismissed'));

revoke all on table public.workspace_getting_started from anon, authenticated;
grant select on table public.workspace_getting_started to authenticated;

create policy "Members read their workspace checklist"
on "public"."workspace_getting_started"
as permissive
for select
to authenticated
using ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'workspace_getting_started'
    ) then
        alter publication supabase_realtime add table public.workspace_getting_started;
    end if;
end $$;

create or replace function public.mark_getting_started(p_workspace_id bigint, p_item text)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
    insert into public.workspace_getting_started (workspace_id, item)
    values (p_workspace_id, p_item)
    on conflict do nothing
$function$;

revoke execute on function public.mark_getting_started(bigint, text) from public, anon, authenticated;

create or replace function public.getting_started_on_agent()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
    perform public.mark_getting_started(new.workspace_id, 'first_agent');
    return null;
end
$function$;

create trigger getting_started_on_agent
    after insert on public.agents
    for each row execute function public.getting_started_on_agent();

create or replace function public.getting_started_on_invitation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
    perform public.mark_getting_started(new.workspace_id, 'invite');
    return null;
end
$function$;

create trigger getting_started_on_invitation
    after insert on public.workspace_invitations
    for each row execute function public.getting_started_on_invitation();

-- Le premier membre est l'owner qui crée le workspace : seul un deuxième compte pour une invitation.
create or replace function public.getting_started_on_member()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
    if (select count(*) from public.workspace_members where workspace_id = new.workspace_id) > 1 then
        perform public.mark_getting_started(new.workspace_id, 'invite');
    end if;
    return null;
end
$function$;

create trigger getting_started_on_member
    after insert on public.workspace_members
    for each row execute function public.getting_started_on_member();

revoke execute on function public.getting_started_on_agent() from public, anon, authenticated;
revoke execute on function public.getting_started_on_invitation() from public, anon, authenticated;
revoke execute on function public.getting_started_on_member() from public, anon, authenticated;

-- Ce qui était déjà fait avant la checklist. Les connexions IA et les schedules vivent sur la
-- machine : c'est la synchro au montage de la pastille qui les rattrape.
insert into public.workspace_getting_started (workspace_id, item)
select distinct workspace_id, 'first_agent' from public.agents
on conflict do nothing;

insert into public.workspace_getting_started (workspace_id, item)
select workspace_id, 'invite' from public.workspace_members group by workspace_id having count(*) > 1
union
select distinct workspace_id, 'invite' from public.workspace_invitations where status = 'pending'
on conflict do nothing;
