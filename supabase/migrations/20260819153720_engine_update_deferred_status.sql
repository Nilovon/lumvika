-- Un engine occupé refuse son update: la task le reporte avec backoff, puis abandonne. Les deux cas
-- finissaient enregistrés en `error`, donc impossible de distinguer "il retentera tout seul" d'un
-- build cassé. On les nomme.
alter type "public"."engine_update_status" add value 'deferred';

alter type "public"."engine_update_status" add value 'abandoned';
