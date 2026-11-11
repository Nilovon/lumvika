-- Every committed change of a table the app follows live is signalled on one channel: the table, the
-- operation, the workspace and the user it concerns, and the row's key, never its content. The app
-- reads the row again as each subscriber, so row level security decides who sees it. A delete
-- carries only the key and the routing columns, so it tells nobody more than they already knew.
-- Arguments: the key columns (comma separated), the workspace column, the user column ('' for none).
CREATE FUNCTION "public"."live_notify"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  changed jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  workspace_column text := nullif(TG_ARGV[1], '');
  user_column text := nullif(TG_ARGV[2], '');
  routing text[] := array_remove(ARRAY[workspace_column, user_column], NULL);
  key_columns text[] := string_to_array(TG_ARGV[0], ',');
  workspace bigint := (changed ->> workspace_column)::bigint;
  payload jsonb;
BEGIN
  -- A session has no workspace of its own: it is its coworker's.
  IF TG_TABLE_NAME = 'sessions' THEN
    SELECT agents.workspace_id INTO workspace FROM agents WHERE agents.id = (changed ->> 'agent_id')::uuid;
  END IF;
  payload := jsonb_build_object(
    'kind', 'row',
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'workspace_id', workspace,
    'user_id', changed ->> user_column,
    'key', (SELECT jsonb_object_agg(name, changed -> name) FROM unnest(key_columns) AS name)
  );
  IF TG_OP = 'DELETE' THEN
    payload := payload || jsonb_build_object('old', (SELECT jsonb_object_agg(name, changed -> name) FROM unnest(key_columns || routing) AS name));
  END IF;
  PERFORM pg_notify('lumvika_live', payload::text);
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."live_notify"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('id', 'workspace_id', '');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('id', 'workspace_id', '');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('id', '', '');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."spaces" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('id', 'workspace_id', '');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('id', '', 'id');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."workspace_members" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('user_id,workspace_id', 'workspace_id', 'user_id');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('id', 'id', '');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."workspace_getting_started" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('workspace_id,item', 'workspace_id', '');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."session_reads" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('session_id,user_id', '', 'user_id');
--> statement-breakpoint
CREATE TRIGGER live_change AFTER INSERT OR UPDATE OR DELETE ON "public"."space_members" FOR EACH ROW EXECUTE FUNCTION "public"."live_notify"('space_id,user_id', 'workspace_id', 'user_id');
