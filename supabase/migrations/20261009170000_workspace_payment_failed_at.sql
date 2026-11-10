-- When the charge behind a `past_due` subscription was first declined. The teardown counts its day
-- of grace from here rather than from a notice, so a workspace whose owner has neither a real
-- address nor a reachable number is paused like any other.
--
-- Stamped on the first attempt of each invoice and never cleared: it is only read while the
-- subscription is `past_due`, and the next declined invoice overwrites it.
alter table "public"."workspaces" add column "payment_failed_at" timestamptz;
