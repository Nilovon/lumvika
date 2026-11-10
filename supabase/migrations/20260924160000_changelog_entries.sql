-- Le « What's new » de l'app : une poignée d'annonces produit, publiées sans déploiement. Jusqu'ici
-- ce que Lumvika livrait ne se racontait que par la newsletter, donc par email, donc à une audience
-- qui n'est pas celle des gens qui ouvrent l'app.
--
-- Rien n'est scopé à un workspace, contrairement au Rewind : c'est la même liste pour tout le
-- monde, et c'est la même liste que la page publique /changelog, ce qui est la raison pour
-- laquelle elle est lisible par anon.

create table public.changelog_entries (
    id uuid primary key default gen_random_uuid(),
    -- Ancre de /changelog#slug côté landing, et clé d'idempotence du `on conflict` par lequel le
    -- skill add-changelog réécrit une entrée au lieu d'en créer une deuxième.
    slug text not null unique,
    title text not null,
    body_md text not null,
    image_url text,
    image_alt text,
    -- Le statut EST cette colonne. Pas de `published boolean` à côté : deux colonnes qui disent la
    -- même chose finissent par se contredire, et chaque écriture doit alors les réconcilier.
    -- null = brouillon, date future = programmé, date passée = en ligne.
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index changelog_entries_published_idx
    on public.changelog_entries (published_at desc)
    where published_at is not null;

alter table public.changelog_entries enable row level security;
revoke all on table public.changelog_entries from anon, authenticated;
grant select on table public.changelog_entries to anon, authenticated;

-- Une entrée publiée est publique : la landing la lit avec la clé anon. Les brouillons ne sortent
-- que par la service role, donc par /admin/changelog.
create policy "changelog_entries_select_published"
    on public.changelog_entries
    for select
    to anon, authenticated
    using (published_at is not null and published_at <= now());

-- Jusqu'où chacun a lu. Un curseur, pas une table de vues : le changelog est global et strictement
-- chronologique, la popup le déroule dans l'ordre et se ferme à la fin, donc « lu » n'a qu'un seul
-- degré de liberté, une date. Le Rewind a une table de vues parce qu'une semaine s'y pioche dans un
-- picker, dans le désordre.
--
-- Conséquence à ne jamais oublier : une entrée antidatée atterrit sous un curseur déjà plus haut et
-- n'est montrée à personne. Publier pose toujours now().
alter table public.users add column changelog_seen_at timestamptz not null default now();

-- Le défaut couvre les comptes à venir, ce backfill couvre ceux qui sont déjà là : ni les uns ni
-- les autres ne doivent se prendre tout l'historique à leur prochain passage.
update public.users set changelog_seen_at = now();
