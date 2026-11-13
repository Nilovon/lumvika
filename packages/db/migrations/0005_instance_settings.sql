CREATE TABLE "composio_auth_configs" (
	"toolkit" text PRIMARY KEY NOT NULL,
	"auth_config_id" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "composio_auth_configs_toolkit_check" CHECK (char_length(toolkit) <= 100),
	CONSTRAINT "composio_auth_configs_auth_config_id_check" CHECK (char_length(auth_config_id) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_key_check" CHECK (char_length(key) <= 100)
);
--> statement-breakpoint
ALTER TABLE "composio_auth_configs" ADD CONSTRAINT "composio_auth_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Both tables hold what the install connects with (the Composio API key acts for every coworker), so
-- only the server reads and writes them, on serviceScope(), after its admin check. Row level
-- security with no policy, and no grant to the roles the browser sessions run as.
ALTER TABLE "instance_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "composio_auth_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "instance_settings" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "composio_auth_configs" FROM anon, authenticated;
