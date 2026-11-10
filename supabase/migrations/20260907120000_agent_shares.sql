-- Envoyer un agent à quelqu'un par lien, hors marketplace. Une ligne = un lien, et l'archive qu'il
-- distribue est figée à sa création: le lien ne rappelle jamais la box source, donc il survit à
-- l'extinction de la box comme à la suppression de l'agent, et il ne peut pas distribuer des
-- données que l'agent a gagnées après coup.
--
-- RLS sans aucune policy et sans grant: seule la service role y touche. C'est ce qui garantit que
-- `token` ne peut fuir par aucune lecture, comme pour workspace_invitations. Cf.
-- 20260817160500_creator_invite_merge.sql, qui existe parce qu'un token s'était retrouvé dans un
-- grant colonne.
create table public.agent_shares (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    workspace_id bigint not null references public.workspaces(id) on delete cascade,
    created_by uuid references public.users(id) on delete set null,
    -- Le lien survit à l'agent dont il est parti: il ne sert qu'à nommer la source côté propriétaire.
    source_agent_id uuid references public.agents(id) on delete set null,
    source_agent_name text not null,

    -- La fiche que voit le destinataire, projetée du plan d'archive au moment du partage. Aucun
    -- identifiant d'infrastructure: ni engine id, ni chemin de bucket, ni workspace.
    preview jsonb not null,

    -- L'objet du bucket privé `agent-shares`.
    archive_path text not null,
    archive_bytes bigint not null,
    engine_commit text,

    include_memories boolean not null default false,
    include_database boolean not null default false,
    include_files boolean not null default true,

    install_count integer not null default 0,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone not null default now()
);

alter table public.agent_shares enable row level security;

create index agent_shares_workspace_idx on public.agent_shares (workspace_id);
-- Le compte des liens vivants d'un workspace, lu à chaque création pour le plafond anti-abus.
create index agent_shares_active_idx on public.agent_shares (workspace_id) where revoked_at is null;

comment on column public.agent_shares.token is 'Capability: whoever holds it can install the agent. Never expose it in a grant or a policy.';
comment on column public.agent_shares.preview is 'Frozen public card. Redacted by construction: projected from the archive plan, never from the agent folder.';
