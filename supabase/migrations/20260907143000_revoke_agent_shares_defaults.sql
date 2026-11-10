-- 20260907120000_agent_shares.sql annonce une table « sans grant », mais Supabase accorde tout à
-- anon et authenticated sur n'importe quelle table créée dans public. RLS sans policy bloque bien
-- select/insert/update/delete, pas truncate: la clé publishable suffisait donc à vider tous les
-- liens de partage vivants, et avec eux les archives qu'ils distribuent. Cf.
-- 20260812122529_revoke_billing_table_defaults.sql, écrite pour le même défaut.

revoke all on table public.agent_shares from anon, authenticated;
