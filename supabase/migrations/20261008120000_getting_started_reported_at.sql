-- Les étapes cochées par un trigger (`first_agent`, `invite`) n'arrivaient jamais dans PostHog :
-- seul le code qui insère la ligne lui-même savait qu'elle était neuve. `reported_at` rend le
-- signalement rattrapable : le serveur réclame les lignes où il est encore nul, d'où qu'elles
-- viennent, et émet l'event daté de `done_at`.
--
-- Tout ce qui existe déjà est marqué comme signalé : rejouer l'historique poserait dans PostHog des
-- centaines d'étapes datées du jour où la checklist a été créée, pas de celui où elles ont été faites.
alter table "public"."workspace_getting_started" add column "reported_at" timestamp with time zone;

update public.workspace_getting_started set reported_at = done_at where reported_at is null;
