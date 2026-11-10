-- Les boxes engine tournent aussi en VM Incus sur nos serveurs bare metal (infra/incus-host).
-- La valeur d'enum vit dans sa propre migration: Postgres refuse d'utiliser une valeur ajoutée
-- par ALTER TYPE dans la même transaction que son ajout, et la migration suivante s'en sert.
alter type "public"."cloud_provider" add value if not exists 'incus';
