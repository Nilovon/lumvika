-- `progress` notifications are dropped on the way in since the kind was retired, and `unused_alert`
-- was never written again after `alert` merged into `info`. The rows left over are deleted (their
-- email dispatches go with them through the cascade) and the enum is rebuilt without both labels.
--
-- Push after the code that no longer lists these kinds is live on staging and prod.

delete from public.notifications where kind in ('progress', 'unused_alert');
delete from public.notification_email_dispatches where kind in ('progress', 'unused_alert');

alter table public.notifications alter column kind drop default;
alter type public.notification_kind rename to notification_kind_old;
create type public.notification_kind as enum ('info', 'question', 'approval', 'done', 'error', 'connector');
alter table public.notifications alter column kind type public.notification_kind using kind::text::public.notification_kind;
alter table public.notification_email_dispatches alter column kind type public.notification_kind using kind::text::public.notification_kind;
alter table public.notifications alter column kind set default 'info';
drop type public.notification_kind_old;
