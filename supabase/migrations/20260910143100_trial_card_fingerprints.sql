-- Le droit au trial s'accrochait au workspace (`workspaces.trial_ends_at`), donc un workspace neuf
-- valait un trial neuf: douze workspaces en six jours, douze boxes, et une seule et même carte
-- derrière deux d'entre eux. Le fingerprint Stripe est la seule chose qui traverse les domaines
-- email jetables, alors c'est lui qui porte désormais le droit au trial: la première ligne jamais
-- écrite pour un fingerprint le possède, les suivantes se font facturer tout de suite.
--
-- Table à part plutôt qu'une colonne sur `workspaces`: un workspace présente plusieurs cartes dans
-- sa vie (checkout, portail, second checkout), une colonne écraserait la trace de celle qui a
-- consommé le trial, et `workspaces` est lue partout et exposée par des grants colonne.
--
-- RLS sans policy et sans grant, comme agent_shares: seule la service role y touche.
create table public.trial_card_fingerprints (
    id uuid primary key default gen_random_uuid(),
    fingerprint text not null,
    -- Nullable, et `set null` plutôt que `cascade`: supprimer un workspace (purge des comptes
    -- anonymes, action admin) ne doit pas rendre son trial à la carte qui l'a consommé. La ligne
    -- orpheline continue de compter, et de gagner, contre tout workspace arrivé après elle.
    workspace_id bigint references public.workspaces(id) on delete set null,
    stripe_customer_id text,
    stripe_subscription_id text,
    payment_method_id text,
    -- Non nul quand c'est ce trial-ci qui a été coupé net, parce que la carte en avait déjà servi un.
    trial_skipped_at timestamp with time zone,
    created_at timestamp with time zone not null default now(),
    -- Doublement utile: elle rend l'upsert idempotent sous les rejeux de webhook, et son index a
    -- `fingerprint` en tête, ce qui sert la seule question posée à chaud. Pas d'index séparé.
    unique (fingerprint, workspace_id)
);

alter table public.trial_card_fingerprints enable row level security;
revoke all on table public.trial_card_fingerprints from anon, authenticated;

comment on column public.trial_card_fingerprints.fingerprint is 'Stripe payment_method.card.fingerprint: stable across customers for one physical card, and not reversible to a PAN.';
comment on column public.trial_card_fingerprints.created_at is 'Backdated by the audit script to the real trial_start, so "first claim wins" is historically true and not an artefact of the backfill order.';
