-- The one-Box-per-workspace split of 22/09 is done and the script that drove it is gone.

drop function if exists public.split_box_into_workspace(uuid, text, text, integer);
drop function if exists public.unsplit_box(uuid);
drop table if exists public.workspace_split_log;
