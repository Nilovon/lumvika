-- `alert` and `info` are the same thing now: an `info` notification is what flags a conversation as
-- unread until it is acknowledged. The label is parked rather than dropped, since `alter type ... drop
-- value` does not exist. `session_status.awaiting_ack` stays: it is `info` that raises it from now on.
alter type "public"."notification_kind" rename value 'alert' to 'unused_alert';
