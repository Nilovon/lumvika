-- Le test A/B du prix : le plan de base se vend à 29 $ ou à 49 $ selon le bras tiré à la création
-- du workspace. Le bras est figé ici plutôt que recalculé, parce qu'il vient du cookie que la
-- landing a posé avant l'inscription et que ce cookie ne suit ni un autre appareil ni un coéquipier
-- invité.
--
-- Nul = hors test, au prix liste : tous les workspaces d'avant le test, les sandbox, le mobile.
-- Seul le service role écrit la colonne : `workspaces` n'a de policy que pour la lecture.
alter table "public"."workspaces" add column "price_arm" text;

alter table "public"."workspaces" add constraint "workspaces_price_arm_check" check (price_arm in ('29', '49'));
