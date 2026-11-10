-- Cinquième étape de la checklist « Getting started » : une carte posée pendant le trial sans carte,
-- pour que l'abonnement se convertisse tout seul à la fin au lieu d'être annulé par Stripe.
--
-- Cochée par la confirmation navigateur du formulaire carte et par le webhook Stripe du Checkout
-- `setup`. Les trials qui avaient déjà une carte sont rattrapés par la synchro au montage de la
-- pastille, la carte vivant chez Stripe ; les workspaces déjà payants sont cochés ici.
alter table "public"."workspace_getting_started" drop constraint "workspace_getting_started_item_check";

alter table "public"."workspace_getting_started" add constraint "workspace_getting_started_item_check"
    check ("item" in ('first_agent', 'ai_provider', 'invite', 'schedule', 'payment_method', 'reward', 'dismissed'));

insert into public.workspace_getting_started (workspace_id, item)
select id, 'payment_method' from public.workspaces where subscription_status in ('active', 'past_due')
on conflict do nothing;
