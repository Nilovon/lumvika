-- Quand le pool d'engines est vide, un compte qui vient de s'inscrire est arrêté derrière un mur
-- « waitlist » avant le premier tour du Steward. Ce tampon dit qui a été refusé et quand ; il n'est
-- jamais effacé, le mur lui-même se déduit de l'état du pool à chaque chargement.
alter table public.workspaces add column waitlisted_at timestamp with time zone null;
