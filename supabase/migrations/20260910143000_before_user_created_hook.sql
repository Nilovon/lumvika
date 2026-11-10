-- `blocked_email_domains` existe depuis le 12/08/2026 et n'a jamais bloqué personne: aucun code,
-- aucun trigger, aucune fonction ne la lisait. L'inscription est un `supabase.auth.signUp` côté
-- client, donc il n'existe aucun point serveur où l'intercepter, et c'est par là qu'un domaine
-- catch-all a ouvert douze comptes en six jours.
--
-- Le hook « Before User Created » est le seul crochet qui voie passer les deux chemins, email et
-- OAuth, avant que la ligne n'existe. Il reste à l'armer dans le dashboard (Authentication >
-- Hooks); tant qu'il ne pointe pas ici, cette fonction ne s'exécute jamais.
create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    candidate text;
    -- Not `domain`: PL/pgSQL would resolve that against blocked_email_domains.domain in the lookup
    -- below and raise `column reference is ambiguous`, which fails every single signup.
    email_domain text;
begin
    -- Le payload du hook porte l'utilisateur sous `user`. On accepte aussi un email à la racine:
    -- se tromper de forme couperait toutes les inscriptions, pas seulement les indésirables.
    candidate := lower(trim(coalesce(event -> 'user' ->> 'email', event ->> 'email', '')));
    if candidate = '' then
        return '{}'::jsonb;
    end if;

    email_domain := split_part(candidate, '@', 2);
    if email_domain = '' then
        return '{}'::jsonb;
    end if;

    -- Les sous-domaines comptent: un domaine catch-all sert aussi ses sous-domaines.
    -- Un catch-all a un DNS wildcard, bloquer la racine seule ne coute qu'un enregistrement DNS a
    -- l'attaquant.
    if exists (
        select 1 from public.blocked_email_domains b
        where lower(b.domain) = email_domain or email_domain like '%.' || lower(b.domain)
    ) then
        return jsonb_build_object(
            'error',
            jsonb_build_object('http_code', 400, 'message', 'This email domain is not accepted. Use another address.')
        );
    end if;

    return '{}'::jsonb;
end;
$$;

-- Le hook s'exécute sous `supabase_auth_admin`, qui n'a rien sur le schéma public par défaut.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant select on table public.blocked_email_domains to supabase_auth_admin;

-- Personne d'autre n'appelle ce hook, et surtout pas depuis le navigateur: la fonction est
-- `security definer`, l'exposer donnerait la liste des domaines bloqués à qui la sonde.
revoke execute on function public.before_user_created(jsonb) from public, anon, authenticated;

-- The domains blocked on Lumvika Cloud are not shipped: a deployment fills blocked_email_domains itself.
