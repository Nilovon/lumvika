-- These two labels were added to production by hand before this migration existed, so the file only
-- renamed them. A database rebuilt from the migrations alone never had them, hence the add here.
alter type "public"."notification_kind" add value if not exists 'alert';

alter type "public"."session_status" add value if not exists 'awaiting_ack';
