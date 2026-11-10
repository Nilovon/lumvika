-- Le visuel composé d'une entrée porte une accroche à gauche : sur /changelog c'est une bannière,
-- dans la popup de l'app le titre est déjà écrit juste dessous. La popup montre donc sa propre
-- image, le bloc d'UI seul. Null = la popup retombe sur `image_url` (un GIF, une image générée).
alter table public.changelog_entries add column if not exists dialog_image_url text;

-- Les deux images existent aussi en sombre : un visuel clair dans une app sombre fait une dalle
-- blanche au milieu de la dialog. Null = la version claire sert dans les deux thèmes.
alter table public.changelog_entries add column if not exists image_dark_url text;
alter table public.changelog_entries add column if not exists dialog_image_dark_url text;
