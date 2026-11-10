create extension if not exists "vector" with schema "public";

create type "public"."account_role" as enum ('member', 'expert');

create type "public"."agent_service_status" as enum ('active', 'needs_config', 'error');

create type "public"."agent_status" as enum ('idle', 'working', 'error', 'waiting_human', 'offline');

create type "public"."cloud_provider" as enum ('hetzner', 'azure', 'aws');

create type "public"."engine_pool_status" as enum ('provisioning', 'available', 'claimed', 'error', 'updating');

create type "public"."engine_update_status" as enum ('success', 'error');

create type "public"."expert_availability" as enum ('available', 'soon', 'unavailable');

create type "public"."expert_status" as enum ('draft', 'invited', 'published', 'declined');

create type "public"."expert_type" as enum ('studio', 'freelancer', 'expert');

create type "public"."notification_kind" as enum ('info', 'question', 'approval', 'progress', 'done', 'error', 'connector');

create type "public"."session_source" as enum ('dashboard', 'builder', 'schedule', 'agent', 'delegate', 'api', 'trigger');

create type "public"."session_status" as enum ('idle', 'working', 'error', 'waiting_human', 'awaiting_question', 'awaiting_approval', 'awaiting_connector');

create type "public"."template_pricing_model" as enum ('free', 'one_time', 'recurring');

create type "public"."template_purchase_status" as enum ('pending', 'active', 'past_due', 'canceled', 'refunded');

create type "public"."template_status" as enum ('draft', 'in_review', 'published', 'unlisted', 'archived');

create type "public"."workspace_role" as enum ('owner', 'builder', 'viewer');


  create table "public"."agents" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "soul_md" text default ''::text,
    "status" public.agent_status not null default 'idle'::public.agent_status,
    "col" integer not null default 0,
    "row" integer not null default 0,
    "workspace_id" integer not null,
    "created_at" timestamp with time zone not null default now(),
    "space_id" uuid not null,
    "engine_agent_id" text,
    "handle" text,
    "template_id" uuid,
    "disabled_at" timestamp with time zone,
    "disabled_reason" text,
    "disabled_schedule_slugs" text[] not null default '{}'::text[]
      );


alter table "public"."agents" enable row level security;


  create table "public"."api_keys" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" bigint not null,
    "name" text not null,
    "key_prefix" text not null,
    "key_hash" text not null,
    "created_by" text,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."api_keys" enable row level security;


  create table "public"."blocked_email_domains" (
    "domain" text not null,
    "note" text,
    "created_by" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."blocked_email_domains" enable row level security;


  create table "public"."blog_posts" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "title" text not null,
    "excerpt" text,
    "category" text not null,
    "cover_url" text,
    "author_name" text,
    "author_avatar" text,
    "body_mdx" text not null,
    "featured" boolean not null default false,
    "published" boolean not null default false,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "meta_title" text,
    "meta_description" text,
    "faq" jsonb not null default '[]'::jsonb,
    "related_slugs" text[] not null default '{}'::text[],
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."blog_posts" enable row level security;


  create table "public"."connector_requests" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" bigint,
    "agent_id" text,
    "description" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."connector_requests" enable row level security;


  create table "public"."creator_accounts" (
    "user_id" uuid not null,
    "stripe_account_id" text not null,
    "charges_enabled" boolean not null default false,
    "payouts_enabled" boolean not null default false,
    "details_submitted" boolean not null default false,
    "disabled_reason" text,
    "requirements_due" text[] not null default '{}'::text[],
    "country" text,
    "default_currency" text,
    "onboarded_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."creator_accounts" enable row level security;


  create table "public"."dashboard_page_versions" (
    "id" uuid not null default gen_random_uuid(),
    "page_id" uuid not null,
    "version" integer not null,
    "widgets" jsonb not null,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."dashboard_page_versions" enable row level security;


  create table "public"."dashboard_pages" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" integer not null,
    "title" text not null default 'Overview'::text,
    "slug" text not null,
    "position" integer not null default 0,
    "is_public" boolean not null default false,
    "accent_id" text not null default 'violet'::text,
    "draft_widgets" jsonb not null default '[]'::jsonb,
    "published_widgets" jsonb,
    "published_version" integer not null default 0,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "remix_prompt" text
      );


alter table "public"."dashboard_pages" enable row level security;


  create table "public"."engine_pool" (
    "id" uuid not null default gen_random_uuid(),
    "provider" public.cloud_provider not null default 'hetzner'::public.cloud_provider,
    "provider_server_id" text,
    "region" text,
    "server_type" text,
    "engine_host" text,
    "engine_api_key" text not null,
    "status" public.engine_pool_status not null default 'provisioning'::public.engine_pool_status,
    "claimed_by_space_id" uuid,
    "error_message" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "last_update_at" timestamp with time zone,
    "last_update_status" public.engine_update_status,
    "last_update_log" text
      );


alter table "public"."engine_pool" enable row level security;


  create table "public"."expert_email_opt_outs" (
    "email" text not null,
    "expert_id" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."expert_email_opt_outs" enable row level security;


  create table "public"."expert_hire_requests" (
    "id" uuid not null default gen_random_uuid(),
    "expert_id" uuid not null,
    "name" text not null,
    "email" text not null,
    "company_url" text,
    "message" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."expert_hire_requests" enable row level security;


  create table "public"."experts" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "name" text not null,
    "type" public.expert_type not null,
    "location" text,
    "bio" text,
    "budget" text,
    "avatar_url" text,
    "banner_url" text not null,
    "skills" text[] not null default '{}'::text[],
    "languages" text[] not null default '{}'::text[],
    "x_url" text,
    "linkedin_url" text,
    "github_url" text,
    "website_url" text,
    "featured" boolean not null default false,
    "status" public.expert_status not null default 'draft'::public.expert_status,
    "invited_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "claim_token" text not null default encode(extensions.gen_random_bytes(16), 'hex'::text),
    "availability" public.expert_availability not null default 'available'::public.expert_availability,
    "email" text,
    "seo_indexed" boolean not null default true,
    "timezone" text,
    "invite_scheduled_at" timestamp with time zone,
    "invite_run_id" text
      );


alter table "public"."experts" enable row level security;


  create table "public"."invitation_codes" (
    "id" uuid not null default gen_random_uuid(),
    "code" text not null,
    "plan" text not null,
    "max_uses" integer,
    "uses" integer not null default 0,
    "expires_at" timestamp with time zone,
    "active" boolean not null default true,
    "note" text,
    "created_by" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."invitation_codes" enable row level security;


  create table "public"."invitation_redemptions" (
    "id" uuid not null default gen_random_uuid(),
    "code_id" uuid not null,
    "workspace_id" integer not null,
    "user_id" uuid,
    "redeemed_at" timestamp with time zone not null default now()
      );


alter table "public"."invitation_redemptions" enable row level security;


  create table "public"."notifications" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" integer not null,
    "space_id" uuid not null,
    "agent_id" uuid,
    "engine_agent_id" text,
    "engine_session_id" text,
    "engine_run_id" text,
    "event" text not null default 'agent.notification'::text,
    "kind" public.notification_kind not null default 'info'::public.notification_kind,
    "message" text not null,
    "metadata" jsonb,
    "read_at" timestamp with time zone,
    "notified_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "source" public.session_source
      );


alter table "public"."notifications" enable row level security;


  create table "public"."published_files" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" integer not null,
    "space_id" uuid not null,
    "agent_id" uuid not null,
    "source_path" text not null,
    "storage_key" text not null,
    "content_type" text not null default 'application/octet-stream'::text,
    "size" bigint not null default 0,
    "public_url" text not null,
    "slug" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."published_files" enable row level security;


  create table "public"."rerun_usage_events" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" bigint not null,
    "space_id" uuid,
    "model" text not null,
    "input_tokens" integer not null default 0,
    "output_tokens" integer not null default 0,
    "cost_micros" bigint not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."rerun_usage_events" enable row level security;


  create table "public"."services" (
    "slug" text not null,
    "name" text not null,
    "category" text not null default 'other'::text,
    "summary" text not null default ''::text,
    "icon" text,
    "manifest" jsonb not null,
    "enabled" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "embedding" public.vector(1536),
    "verified" boolean not null default false
      );


alter table "public"."services" enable row level security;


  create table "public"."sessions" (
    "id" uuid not null default gen_random_uuid(),
    "agent_id" uuid not null,
    "title" text not null default 'New conversation'::text,
    "engine_session_id" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "status" public.session_status not null default 'idle'::public.session_status,
    "origin_agent_id" uuid,
    "source" public.session_source not null default 'builder'::public.session_source
      );


alter table "public"."sessions" enable row level security;


  create table "public"."spaces" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" integer not null,
    "name" text default 'Untitled Space'::text,
    "col_start" integer not null,
    "row_start" integer not null,
    "col_end" integer not null,
    "row_end" integer not null,
    "created_at" timestamp with time zone default now(),
    "engine_host" text not null,
    "engine_api_key" text,
    "pool_instance_id" uuid
      );


alter table "public"."spaces" enable row level security;


  create table "public"."stripe_events" (
    "id" text not null,
    "type" text not null,
    "connected_account_id" text,
    "claimed_at" timestamp with time zone not null default now(),
    "processed_at" timestamp with time zone
      );


alter table "public"."stripe_events" enable row level security;


  create table "public"."template_purchases" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" bigint not null,
    "template_id" uuid not null,
    "creator_id" uuid,
    "purchased_by" uuid,
    "pricing_model" public.template_pricing_model not null,
    "status" public.template_purchase_status not null default 'pending'::public.template_purchase_status,
    "amount_cents" integer not null default 0,
    "currency" text not null default 'usd'::text,
    "stripe_checkout_session_id" text,
    "stripe_payment_intent_id" text,
    "stripe_subscription_id" text,
    "stripe_price_id" text,
    "stripe_connected_account_id" text,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean not null default false,
    "activated_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."template_purchases" enable row level security;


  create table "public"."template_sales" (
    "id" uuid not null default gen_random_uuid(),
    "template_id" uuid,
    "template_slug" text not null,
    "template_title" text not null,
    "creator_id" uuid,
    "workspace_id" bigint,
    "purchase_id" uuid,
    "kind" text not null,
    "gross_cents" integer not null,
    "application_fee_cents" integer not null default 0,
    "net_cents" integer not null,
    "currency" text not null default 'usd'::text,
    "stripe_charge_id" text,
    "stripe_invoice_id" text,
    "stripe_connected_account_id" text,
    "occurred_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "tax_cents" integer not null default 0,
    "stripe_transfer_id" text
      );


alter table "public"."template_sales" enable row level security;


  create table "public"."templates" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "title" text not null,
    "tagline" text not null default ''::text,
    "long_description" text not null default ''::text,
    "category" text not null default 'other'::text,
    "tags" text[] not null default '{}'::text[],
    "gallery" jsonb not null default '[]'::jsonb,
    "video_url" text,
    "og_image_url" text,
    "meta_title" text,
    "meta_description" text,
    "setup_minutes" integer not null default 5,
    "featured" boolean not null default false,
    "status" public.template_status not null default 'draft'::public.template_status,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "show_in_marketplace" boolean not null default true,
    "show_in_library" boolean not null default true,
    "agents" jsonb not null default '[]'::jsonb,
    "connectors" jsonb not null default '[]'::jsonb,
    "agent_count" integer generated always as (COALESCE(jsonb_array_length(agents), 0)) stored,
    "agent_archives" jsonb not null default '[]'::jsonb,
    "faq" jsonb not null default '[]'::jsonb,
    "creator_id" uuid,
    "submitted_at" timestamp with time zone,
    "review_note" text,
    "pricing_model" public.template_pricing_model not null default 'free'::public.template_pricing_model,
    "price_amount_cents" integer not null default 0,
    "price_currency" text not null default 'usd'::text,
    "stripe_product_id" text,
    "stripe_price_id" text,
    "price_synced_at" timestamp with time zone
      );


alter table "public"."templates" enable row level security;


  create table "public"."users" (
    "id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "workspace_id" bigint not null,
    "verified" boolean not null default false,
    "onboarding_answers" jsonb,
    "onboarding_completed_at" timestamp with time zone,
    "email_notification_prefs" jsonb not null default '{"done": false, "info": false, "error": false, "billing": true, "product": true, "approval": false, "progress": false, "question": false}'::jsonb,
    "account_role" public.account_role not null default 'member'::public.account_role,
    "expert_profile_id" uuid
      );


alter table "public"."users" enable row level security;


  create table "public"."workspace_invitations" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" bigint not null,
    "email" text not null,
    "role" public.workspace_role not null default 'builder'::public.workspace_role,
    "token" text not null,
    "invited_by" uuid,
    "status" text not null default 'pending'::text,
    "created_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone not null,
    "accepted_at" timestamp with time zone
      );


alter table "public"."workspace_invitations" enable row level security;


  create table "public"."workspace_members" (
    "user_id" uuid not null,
    "workspace_id" bigint not null,
    "role" public.workspace_role not null default 'builder'::public.workspace_role,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."workspace_members" enable row level security;


  create table "public"."workspaces" (
    "id" bigint generated by default as identity not null,
    "created_at" timestamp with time zone not null default now(),
    "name" character varying,
    "plan" character varying not null default 'pro'::character varying,
    "stripe_customer_id" character varying,
    "trial_ends_at" timestamp with time zone,
    "max_agents" integer default 1,
    "max_spaces" integer default 1,
    "max_seats" integer default 1,
    "model_access" text default 'best'::text,
    "custom_integrations" boolean not null default false,
    "stripe_subscription_id" text,
    "stripe_price_id" text,
    "subscription_status" text,
    "current_period_end" timestamp with time zone,
    "icon_url" text not null,
    "rerun_budget_micros" bigint not null default 0,
    "rerun_used_micros" bigint not null default 0,
    "rerun_period_anchor" timestamp with time zone,
    "subdomain" text not null,
    "max_pages" integer default 2,
    "is_sandbox" boolean not null default false,
    "rerun_topup_micros" bigint not null default 0
      );


alter table "public"."workspaces" enable row level security;

CREATE INDEX agents_disabled_idx ON public.agents USING btree (workspace_id) WHERE (disabled_at IS NOT NULL);

CREATE UNIQUE INDEX agents_pkey ON public.agents USING btree (id);

CREATE UNIQUE INDEX agents_space_handle_uniq ON public.agents USING btree (space_id, handle);

CREATE INDEX agents_template_id_idx ON public.agents USING btree (template_id) WHERE (template_id IS NOT NULL);

CREATE UNIQUE INDEX api_keys_key_hash_key ON public.api_keys USING btree (key_hash);

CREATE UNIQUE INDEX api_keys_pkey ON public.api_keys USING btree (id);

CREATE INDEX api_keys_workspace_id_idx ON public.api_keys USING btree (workspace_id);

CREATE UNIQUE INDEX blocked_email_domains_pkey ON public.blocked_email_domains USING btree (domain);

CREATE INDEX blog_posts_category_idx ON public.blog_posts USING btree (category);

CREATE UNIQUE INDEX blog_posts_pkey ON public.blog_posts USING btree (id);

CREATE INDEX blog_posts_published_idx ON public.blog_posts USING btree (published, published_at DESC);

CREATE UNIQUE INDEX blog_posts_slug_key ON public.blog_posts USING btree (slug);

CREATE UNIQUE INDEX connector_requests_pkey ON public.connector_requests USING btree (id);

CREATE UNIQUE INDEX creator_accounts_pkey ON public.creator_accounts USING btree (user_id);

CREATE UNIQUE INDEX creator_accounts_stripe_account_id_key ON public.creator_accounts USING btree (stripe_account_id);

CREATE INDEX dashboard_page_versions_page_id_idx ON public.dashboard_page_versions USING btree (page_id);

CREATE UNIQUE INDEX dashboard_page_versions_page_id_version_key ON public.dashboard_page_versions USING btree (page_id, version);

CREATE UNIQUE INDEX dashboard_page_versions_pkey ON public.dashboard_page_versions USING btree (id);

CREATE UNIQUE INDEX dashboard_pages_pkey ON public.dashboard_pages USING btree (id);

CREATE INDEX dashboard_pages_workspace_id_idx ON public.dashboard_pages USING btree (workspace_id);

CREATE UNIQUE INDEX dashboard_pages_workspace_id_slug_key ON public.dashboard_pages USING btree (workspace_id, slug);

CREATE UNIQUE INDEX engine_pool_pkey ON public.engine_pool USING btree (id);

CREATE INDEX engine_pool_status_idx ON public.engine_pool USING btree (status);

CREATE UNIQUE INDEX expert_email_opt_outs_pkey ON public.expert_email_opt_outs USING btree (email);

CREATE INDEX expert_hire_requests_expert_id_idx ON public.expert_hire_requests USING btree (expert_id);

CREATE UNIQUE INDEX expert_hire_requests_pkey ON public.expert_hire_requests USING btree (id);

CREATE INDEX experts_claim_token_idx ON public.experts USING btree (claim_token);

CREATE UNIQUE INDEX experts_claim_token_key ON public.experts USING btree (claim_token);

CREATE INDEX experts_invite_scheduled_at_idx ON public.experts USING btree (invite_scheduled_at) WHERE (invite_scheduled_at IS NOT NULL);

CREATE UNIQUE INDEX experts_pkey ON public.experts USING btree (id);

CREATE UNIQUE INDEX experts_slug_key ON public.experts USING btree (slug);

CREATE INDEX experts_status_idx ON public.experts USING btree (status);

CREATE INDEX idx_agents_workspace_id ON public.agents USING btree (workspace_id);

CREATE INDEX idx_sessions_agent_id ON public.sessions USING btree (agent_id);

CREATE UNIQUE INDEX invitation_codes_code_key ON public.invitation_codes USING btree (code);

CREATE UNIQUE INDEX invitation_codes_pkey ON public.invitation_codes USING btree (id);

CREATE UNIQUE INDEX invitation_redemptions_code_id_workspace_id_key ON public.invitation_redemptions USING btree (code_id, workspace_id);

CREATE UNIQUE INDEX invitation_redemptions_pkey ON public.invitation_redemptions USING btree (id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE INDEX notifications_space_idx ON public.notifications USING btree (space_id);

CREATE INDEX notifications_space_unread_idx ON public.notifications USING btree (space_id) WHERE (read_at IS NULL);

CREATE INDEX notifications_workspace_idx ON public.notifications USING btree (workspace_id);

CREATE INDEX published_files_agent_idx ON public.published_files USING btree (agent_id);

CREATE UNIQUE INDEX published_files_agent_path_key ON public.published_files USING btree (agent_id, source_path);

CREATE UNIQUE INDEX published_files_pkey ON public.published_files USING btree (id);

CREATE UNIQUE INDEX published_files_slug_key ON public.published_files USING btree (slug);

CREATE INDEX published_files_workspace_idx ON public.published_files USING btree (workspace_id);

CREATE UNIQUE INDEX rerun_usage_events_pkey ON public.rerun_usage_events USING btree (id);

CREATE INDEX rerun_usage_events_workspace_idx ON public.rerun_usage_events USING btree (workspace_id, created_at DESC);

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (slug);

CREATE UNIQUE INDEX sessions_hermes_conversation_key ON public.sessions USING btree (engine_session_id);

CREATE INDEX sessions_origin_agent_idx ON public.sessions USING btree (origin_agent_id);

CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id);

CREATE UNIQUE INDEX spaces_engine_api_key_key ON public.spaces USING btree (engine_api_key) WHERE (engine_api_key IS NOT NULL);

CREATE UNIQUE INDEX spaces_pkey ON public.spaces USING btree (id);

CREATE UNIQUE INDEX stripe_events_pkey ON public.stripe_events USING btree (id);

CREATE INDEX stripe_events_unprocessed_idx ON public.stripe_events USING btree (claimed_at) WHERE (processed_at IS NULL);

CREATE UNIQUE INDEX template_purchases_checkout_key ON public.template_purchases USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);

CREATE INDEX template_purchases_creator_idx ON public.template_purchases USING btree (creator_id);

CREATE UNIQUE INDEX template_purchases_pkey ON public.template_purchases USING btree (id);

CREATE UNIQUE INDEX template_purchases_subscription_key ON public.template_purchases USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);

CREATE INDEX template_purchases_template_idx ON public.template_purchases USING btree (template_id);

CREATE UNIQUE INDEX template_purchases_workspace_template_key ON public.template_purchases USING btree (workspace_id, template_id);

CREATE UNIQUE INDEX template_sales_charge_key ON public.template_sales USING btree (stripe_charge_id) WHERE (stripe_charge_id IS NOT NULL);

CREATE INDEX template_sales_creator_occurred_idx ON public.template_sales USING btree (creator_id, occurred_at DESC);

CREATE UNIQUE INDEX template_sales_invoice_key ON public.template_sales USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);

CREATE UNIQUE INDEX template_sales_pkey ON public.template_sales USING btree (id);

CREATE INDEX template_sales_template_idx ON public.template_sales USING btree (template_id);

CREATE INDEX template_sales_transfer_idx ON public.template_sales USING btree (stripe_transfer_id);

CREATE INDEX templates_category_idx ON public.templates USING btree (category);

CREATE INDEX templates_creator_id_idx ON public.templates USING btree (creator_id) WHERE (creator_id IS NOT NULL);

CREATE INDEX templates_featured_idx ON public.templates USING btree (featured) WHERE featured;

CREATE INDEX templates_library_idx ON public.templates USING btree (show_in_library) WHERE show_in_library;

CREATE INDEX templates_marketplace_idx ON public.templates USING btree (show_in_marketplace) WHERE show_in_marketplace;

CREATE UNIQUE INDEX templates_pkey ON public.templates USING btree (id);

CREATE INDEX templates_pricing_model_idx ON public.templates USING btree (pricing_model) WHERE (pricing_model <> 'free'::public.template_pricing_model);

CREATE UNIQUE INDEX templates_slug_key ON public.templates USING btree (slug);

CREATE INDEX templates_status_idx ON public.templates USING btree (status);

CREATE UNIQUE INDEX templates_stripe_price_id_key ON public.templates USING btree (stripe_price_id) WHERE (stripe_price_id IS NOT NULL);

CREATE INDEX templates_tags_idx ON public.templates USING gin (tags);

CREATE UNIQUE INDEX users_expert_profile_id_key ON public.users USING btree (expert_profile_id) WHERE (expert_profile_id IS NOT NULL);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX workspace_invitations_pending_uniq ON public.workspace_invitations USING btree (workspace_id, lower(email)) WHERE (status = 'pending'::text);

CREATE UNIQUE INDEX workspace_invitations_pkey ON public.workspace_invitations USING btree (id);

CREATE UNIQUE INDEX workspace_invitations_token_key ON public.workspace_invitations USING btree (token);

CREATE UNIQUE INDEX workspace_members_pkey ON public.workspace_members USING btree (user_id, workspace_id);

CREATE INDEX workspace_members_workspace_id_idx ON public.workspace_members USING btree (workspace_id);

CREATE INDEX workspaces_is_sandbox_idx ON public.workspaces USING btree (is_sandbox) WHERE is_sandbox;

CREATE UNIQUE INDEX workspaces_pkey ON public.workspaces USING btree (id);

CREATE UNIQUE INDEX workspaces_subdomain_key ON public.workspaces USING btree (subdomain);

alter table "public"."agents" add constraint "agents_pkey" PRIMARY KEY using index "agents_pkey";

alter table "public"."api_keys" add constraint "api_keys_pkey" PRIMARY KEY using index "api_keys_pkey";

alter table "public"."blocked_email_domains" add constraint "blocked_email_domains_pkey" PRIMARY KEY using index "blocked_email_domains_pkey";

alter table "public"."blog_posts" add constraint "blog_posts_pkey" PRIMARY KEY using index "blog_posts_pkey";

alter table "public"."connector_requests" add constraint "connector_requests_pkey" PRIMARY KEY using index "connector_requests_pkey";

alter table "public"."creator_accounts" add constraint "creator_accounts_pkey" PRIMARY KEY using index "creator_accounts_pkey";

alter table "public"."dashboard_page_versions" add constraint "dashboard_page_versions_pkey" PRIMARY KEY using index "dashboard_page_versions_pkey";

alter table "public"."dashboard_pages" add constraint "dashboard_pages_pkey" PRIMARY KEY using index "dashboard_pages_pkey";

alter table "public"."engine_pool" add constraint "engine_pool_pkey" PRIMARY KEY using index "engine_pool_pkey";

alter table "public"."expert_email_opt_outs" add constraint "expert_email_opt_outs_pkey" PRIMARY KEY using index "expert_email_opt_outs_pkey";

alter table "public"."expert_hire_requests" add constraint "expert_hire_requests_pkey" PRIMARY KEY using index "expert_hire_requests_pkey";

alter table "public"."experts" add constraint "experts_pkey" PRIMARY KEY using index "experts_pkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_pkey" PRIMARY KEY using index "invitation_codes_pkey";

alter table "public"."invitation_redemptions" add constraint "invitation_redemptions_pkey" PRIMARY KEY using index "invitation_redemptions_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."published_files" add constraint "published_files_pkey" PRIMARY KEY using index "published_files_pkey";

alter table "public"."rerun_usage_events" add constraint "rerun_usage_events_pkey" PRIMARY KEY using index "rerun_usage_events_pkey";

alter table "public"."services" add constraint "services_pkey" PRIMARY KEY using index "services_pkey";

alter table "public"."sessions" add constraint "sessions_pkey" PRIMARY KEY using index "sessions_pkey";

alter table "public"."spaces" add constraint "spaces_pkey" PRIMARY KEY using index "spaces_pkey";

alter table "public"."stripe_events" add constraint "stripe_events_pkey" PRIMARY KEY using index "stripe_events_pkey";

alter table "public"."template_purchases" add constraint "template_purchases_pkey" PRIMARY KEY using index "template_purchases_pkey";

alter table "public"."template_sales" add constraint "template_sales_pkey" PRIMARY KEY using index "template_sales_pkey";

alter table "public"."templates" add constraint "templates_pkey" PRIMARY KEY using index "templates_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."workspace_invitations" add constraint "workspace_invitations_pkey" PRIMARY KEY using index "workspace_invitations_pkey";

alter table "public"."workspace_members" add constraint "workspace_members_pkey" PRIMARY KEY using index "workspace_members_pkey";

alter table "public"."workspaces" add constraint "workspaces_pkey" PRIMARY KEY using index "workspaces_pkey";

alter table "public"."agents" add constraint "agents_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE not valid;

alter table "public"."agents" validate constraint "agents_space_id_fkey";

alter table "public"."agents" add constraint "agents_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL not valid;

alter table "public"."agents" validate constraint "agents_template_id_fkey";

alter table "public"."agents" add constraint "agents_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."agents" validate constraint "agents_workspace_id_fkey";

alter table "public"."api_keys" add constraint "api_keys_key_hash_key" UNIQUE using index "api_keys_key_hash_key";

alter table "public"."api_keys" add constraint "api_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."api_keys" validate constraint "api_keys_workspace_id_fkey";

alter table "public"."blog_posts" add constraint "blog_posts_slug_key" UNIQUE using index "blog_posts_slug_key";

alter table "public"."connector_requests" add constraint "connector_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL not valid;

alter table "public"."connector_requests" validate constraint "connector_requests_workspace_id_fkey";

alter table "public"."creator_accounts" add constraint "creator_accounts_stripe_account_id_key" UNIQUE using index "creator_accounts_stripe_account_id_key";

alter table "public"."creator_accounts" add constraint "creator_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."creator_accounts" validate constraint "creator_accounts_user_id_fkey";

alter table "public"."dashboard_page_versions" add constraint "dashboard_page_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."dashboard_page_versions" validate constraint "dashboard_page_versions_created_by_fkey";

alter table "public"."dashboard_page_versions" add constraint "dashboard_page_versions_page_id_fkey" FOREIGN KEY (page_id) REFERENCES public.dashboard_pages(id) ON DELETE CASCADE not valid;

alter table "public"."dashboard_page_versions" validate constraint "dashboard_page_versions_page_id_fkey";

alter table "public"."dashboard_page_versions" add constraint "dashboard_page_versions_page_id_version_key" UNIQUE using index "dashboard_page_versions_page_id_version_key";

alter table "public"."dashboard_pages" add constraint "dashboard_pages_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."dashboard_pages" validate constraint "dashboard_pages_workspace_id_fkey";

alter table "public"."dashboard_pages" add constraint "dashboard_pages_workspace_id_slug_key" UNIQUE using index "dashboard_pages_workspace_id_slug_key";

alter table "public"."engine_pool" add constraint "engine_pool_claimed_by_space_id_fkey" FOREIGN KEY (claimed_by_space_id) REFERENCES public.spaces(id) ON DELETE SET NULL not valid;

alter table "public"."engine_pool" validate constraint "engine_pool_claimed_by_space_id_fkey";

alter table "public"."expert_email_opt_outs" add constraint "expert_email_opt_outs_expert_id_fkey" FOREIGN KEY (expert_id) REFERENCES public.experts(id) ON DELETE SET NULL not valid;

alter table "public"."expert_email_opt_outs" validate constraint "expert_email_opt_outs_expert_id_fkey";

alter table "public"."expert_hire_requests" add constraint "expert_hire_requests_expert_id_fkey" FOREIGN KEY (expert_id) REFERENCES public.experts(id) ON DELETE CASCADE not valid;

alter table "public"."expert_hire_requests" validate constraint "expert_hire_requests_expert_id_fkey";

alter table "public"."experts" add constraint "experts_claim_token_key" UNIQUE using index "experts_claim_token_key";

alter table "public"."experts" add constraint "experts_slug_key" UNIQUE using index "experts_slug_key";

alter table "public"."invitation_codes" add constraint "invitation_codes_code_key" UNIQUE using index "invitation_codes_code_key";

alter table "public"."invitation_redemptions" add constraint "invitation_redemptions_code_id_fkey" FOREIGN KEY (code_id) REFERENCES public.invitation_codes(id) ON DELETE CASCADE not valid;

alter table "public"."invitation_redemptions" validate constraint "invitation_redemptions_code_id_fkey";

alter table "public"."invitation_redemptions" add constraint "invitation_redemptions_code_id_workspace_id_key" UNIQUE using index "invitation_redemptions_code_id_workspace_id_key";

alter table "public"."invitation_redemptions" add constraint "invitation_redemptions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."invitation_redemptions" validate constraint "invitation_redemptions_workspace_id_fkey";

alter table "public"."notifications" add constraint "notifications_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL not valid;

alter table "public"."notifications" validate constraint "notifications_agent_id_fkey";

alter table "public"."notifications" add constraint "notifications_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_space_id_fkey";

alter table "public"."notifications" add constraint "notifications_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_workspace_id_fkey";

alter table "public"."published_files" add constraint "published_files_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE not valid;

alter table "public"."published_files" validate constraint "published_files_agent_id_fkey";

alter table "public"."published_files" add constraint "published_files_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE not valid;

alter table "public"."published_files" validate constraint "published_files_space_id_fkey";

alter table "public"."published_files" add constraint "published_files_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."published_files" validate constraint "published_files_workspace_id_fkey";

alter table "public"."rerun_usage_events" add constraint "rerun_usage_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."rerun_usage_events" validate constraint "rerun_usage_events_workspace_id_fkey";

alter table "public"."services" add constraint "services_category_check" CHECK ((category = ANY (ARRAY['payments'::text, 'ecommerce'::text, 'crm'::text, 'marketing'::text, 'seo'::text, 'analytics'::text, 'dev'::text, 'productivity'::text, 'other'::text]))) not valid;

alter table "public"."services" validate constraint "services_category_check";

alter table "public"."sessions" add constraint "sessions_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE not valid;

alter table "public"."sessions" validate constraint "sessions_agent_id_fkey";

alter table "public"."sessions" add constraint "sessions_hermes_conversation_key" UNIQUE using index "sessions_hermes_conversation_key";

alter table "public"."sessions" add constraint "sessions_origin_agent_id_fkey" FOREIGN KEY (origin_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL not valid;

alter table "public"."sessions" validate constraint "sessions_origin_agent_id_fkey";

alter table "public"."spaces" add constraint "spaces_pool_instance_id_fkey" FOREIGN KEY (pool_instance_id) REFERENCES public.engine_pool(id) ON DELETE SET NULL not valid;

alter table "public"."spaces" validate constraint "spaces_pool_instance_id_fkey";

alter table "public"."spaces" add constraint "spaces_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) not valid;

alter table "public"."spaces" validate constraint "spaces_workspace_id_fkey";

alter table "public"."template_purchases" add constraint "template_purchases_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."template_purchases" validate constraint "template_purchases_creator_id_fkey";

alter table "public"."template_purchases" add constraint "template_purchases_purchased_by_fkey" FOREIGN KEY (purchased_by) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."template_purchases" validate constraint "template_purchases_purchased_by_fkey";

alter table "public"."template_purchases" add constraint "template_purchases_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE RESTRICT not valid;

alter table "public"."template_purchases" validate constraint "template_purchases_template_id_fkey";

alter table "public"."template_purchases" add constraint "template_purchases_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."template_purchases" validate constraint "template_purchases_workspace_id_fkey";

alter table "public"."template_sales" add constraint "template_sales_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."template_sales" validate constraint "template_sales_creator_id_fkey";

alter table "public"."template_sales" add constraint "template_sales_kind_check" CHECK ((kind = ANY (ARRAY['one_time'::text, 'recurring'::text, 'refund'::text]))) not valid;

alter table "public"."template_sales" validate constraint "template_sales_kind_check";

alter table "public"."template_sales" add constraint "template_sales_purchase_id_fkey" FOREIGN KEY (purchase_id) REFERENCES public.template_purchases(id) ON DELETE SET NULL not valid;

alter table "public"."template_sales" validate constraint "template_sales_purchase_id_fkey";

alter table "public"."template_sales" add constraint "template_sales_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL not valid;

alter table "public"."template_sales" validate constraint "template_sales_template_id_fkey";

alter table "public"."template_sales" add constraint "template_sales_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL not valid;

alter table "public"."template_sales" validate constraint "template_sales_workspace_id_fkey";

alter table "public"."templates" add constraint "templates_category_check" CHECK ((category = ANY (ARRAY['agencies'::text, 'ecommerce'::text, 'saas'::text, 'sales'::text, 'recruiting'::text, 'real-estate'::text, 'legal'::text, 'creators'::text, 'productivity'::text, 'other'::text]))) not valid;

alter table "public"."templates" validate constraint "templates_category_check";

alter table "public"."templates" add constraint "templates_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."templates" validate constraint "templates_creator_id_fkey";

alter table "public"."templates" add constraint "templates_price_coherent" CHECK ((((pricing_model = 'free'::public.template_pricing_model) AND (price_amount_cents = 0)) OR ((pricing_model <> 'free'::public.template_pricing_model) AND ((price_amount_cents >= 100) AND (price_amount_cents <= 200000))))) not valid;

alter table "public"."templates" validate constraint "templates_price_coherent";

alter table "public"."templates" add constraint "templates_price_currency_check" CHECK ((price_currency = 'usd'::text)) not valid;

alter table "public"."templates" validate constraint "templates_price_currency_check";

alter table "public"."templates" add constraint "templates_slug_key" UNIQUE using index "templates_slug_key";

alter table "public"."users" add constraint "users_expert_profile_id_fkey" FOREIGN KEY (expert_profile_id) REFERENCES public.experts(id) ON DELETE SET NULL not valid;

alter table "public"."users" validate constraint "users_expert_profile_id_fkey";

alter table "public"."users" add constraint "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_id_fkey";

alter table "public"."users" add constraint "users_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_workspace_id_fkey";

alter table "public"."workspace_invitations" add constraint "workspace_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."workspace_invitations" validate constraint "workspace_invitations_invited_by_fkey";

alter table "public"."workspace_invitations" add constraint "workspace_invitations_token_key" UNIQUE using index "workspace_invitations_token_key";

alter table "public"."workspace_invitations" add constraint "workspace_invitations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_invitations" validate constraint "workspace_invitations_workspace_id_fkey";

alter table "public"."workspace_members" add constraint "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_user_id_fkey";

alter table "public"."workspace_members" add constraint "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_workspace_id_fkey";

alter table "public"."workspaces" add constraint "workspaces_rerun_topup_non_negative" CHECK ((rerun_topup_micros >= 0)) not valid;

alter table "public"."workspaces" validate constraint "workspaces_rerun_topup_non_negative";

alter table "public"."workspaces" add constraint "workspaces_subdomain_key" UNIQUE using index "workspaces_subdomain_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_email_exists(email text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'auth'
AS $function$
  select exists (
    select 1 from auth.users
    where lower(auth.users.email) = lower(check_email_exists.email)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.consume_rerun_credit(p_workspace_id bigint, p_micros bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
    update workspaces set
        rerun_used_micros = rerun_used_micros + p_micros,
        rerun_topup_micros = greatest(
            rerun_topup_micros - greatest(p_micros - greatest(rerun_budget_micros - rerun_used_micros, 0), 0), 0)
    where id = p_workspace_id;
$function$
;

CREATE OR REPLACE FUNCTION public.current_workspace_ids()
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select workspace_id from public.workspace_members where user_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.grant_rerun_topup(p_workspace_id bigint, p_micros bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
    update workspaces set rerun_topup_micros = rerun_topup_micros + p_micros where id = p_workspace_id;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_rerun_usage(p_workspace_id bigint, p_micros bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
  update public.workspaces
     set rerun_used_micros = rerun_used_micros + p_micros
   where id = p_workspace_id;
$function$
;

CREATE OR REPLACE FUNCTION public.match_services(query_embedding public.vector, match_count integer DEFAULT 20, match_threshold double precision DEFAULT 0.0, filter_category text DEFAULT NULL::text)
 RETURNS TABLE(slug text, name text, category text, summary text, icon text, manifest jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    select s.slug, s.name, s.category, s.summary, s.icon, s.manifest,
           1 - (s.embedding <=> query_embedding) as similarity
    from public.services s
    where s.enabled
      and s.embedding is not null
      and (filter_category is null or s.category = filter_category)
      and 1 - (s.embedding <=> query_embedding) >= match_threshold
    order by s.embedding <=> query_embedding
    limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_user_workspace_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    if new.workspace_id is distinct from old.workspace_id
       and current_user in ('authenticated', 'anon') then
        raise exception 'workspace_id is immutable';
    end if;
    return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_agent_status_from_sessions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update agents set status = (
    case
      when exists (select 1 from sessions where agent_id = new.agent_id and status = 'working') then 'working'
      when exists (select 1 from sessions where agent_id = new.agent_id and status = 'error') then 'error'
      when exists (select 1 from sessions where agent_id = new.agent_id and status = 'waiting_human') then 'waiting_human'
      else 'idle'
    end
  )::agent_status where id = new.agent_id;
  return new;
end;
$function$
;

grant delete on table "public"."agents" to "anon";

grant insert on table "public"."agents" to "anon";

grant references on table "public"."agents" to "anon";

grant select on table "public"."agents" to "anon";

grant trigger on table "public"."agents" to "anon";

grant truncate on table "public"."agents" to "anon";

grant update on table "public"."agents" to "anon";

grant delete on table "public"."agents" to "authenticated";

grant insert on table "public"."agents" to "authenticated";

grant references on table "public"."agents" to "authenticated";

grant select on table "public"."agents" to "authenticated";

grant trigger on table "public"."agents" to "authenticated";

grant truncate on table "public"."agents" to "authenticated";

grant update on table "public"."agents" to "authenticated";

grant delete on table "public"."agents" to "service_role";

grant insert on table "public"."agents" to "service_role";

grant references on table "public"."agents" to "service_role";

grant select on table "public"."agents" to "service_role";

grant trigger on table "public"."agents" to "service_role";

grant truncate on table "public"."agents" to "service_role";

grant update on table "public"."agents" to "service_role";

grant delete on table "public"."api_keys" to "anon";

grant insert on table "public"."api_keys" to "anon";

grant references on table "public"."api_keys" to "anon";

grant select on table "public"."api_keys" to "anon";

grant trigger on table "public"."api_keys" to "anon";

grant truncate on table "public"."api_keys" to "anon";

grant update on table "public"."api_keys" to "anon";

grant delete on table "public"."api_keys" to "authenticated";

grant insert on table "public"."api_keys" to "authenticated";

grant references on table "public"."api_keys" to "authenticated";

grant select on table "public"."api_keys" to "authenticated";

grant trigger on table "public"."api_keys" to "authenticated";

grant truncate on table "public"."api_keys" to "authenticated";

grant update on table "public"."api_keys" to "authenticated";

grant delete on table "public"."api_keys" to "service_role";

grant insert on table "public"."api_keys" to "service_role";

grant references on table "public"."api_keys" to "service_role";

grant select on table "public"."api_keys" to "service_role";

grant trigger on table "public"."api_keys" to "service_role";

grant truncate on table "public"."api_keys" to "service_role";

grant update on table "public"."api_keys" to "service_role";

grant delete on table "public"."blocked_email_domains" to "anon";

grant insert on table "public"."blocked_email_domains" to "anon";

grant references on table "public"."blocked_email_domains" to "anon";

grant select on table "public"."blocked_email_domains" to "anon";

grant trigger on table "public"."blocked_email_domains" to "anon";

grant truncate on table "public"."blocked_email_domains" to "anon";

grant update on table "public"."blocked_email_domains" to "anon";

grant delete on table "public"."blocked_email_domains" to "authenticated";

grant insert on table "public"."blocked_email_domains" to "authenticated";

grant references on table "public"."blocked_email_domains" to "authenticated";

grant select on table "public"."blocked_email_domains" to "authenticated";

grant trigger on table "public"."blocked_email_domains" to "authenticated";

grant truncate on table "public"."blocked_email_domains" to "authenticated";

grant update on table "public"."blocked_email_domains" to "authenticated";

grant delete on table "public"."blocked_email_domains" to "service_role";

grant insert on table "public"."blocked_email_domains" to "service_role";

grant references on table "public"."blocked_email_domains" to "service_role";

grant select on table "public"."blocked_email_domains" to "service_role";

grant trigger on table "public"."blocked_email_domains" to "service_role";

grant truncate on table "public"."blocked_email_domains" to "service_role";

grant update on table "public"."blocked_email_domains" to "service_role";

grant delete on table "public"."blog_posts" to "anon";

grant insert on table "public"."blog_posts" to "anon";

grant references on table "public"."blog_posts" to "anon";

grant select on table "public"."blog_posts" to "anon";

grant trigger on table "public"."blog_posts" to "anon";

grant truncate on table "public"."blog_posts" to "anon";

grant update on table "public"."blog_posts" to "anon";

grant delete on table "public"."blog_posts" to "authenticated";

grant insert on table "public"."blog_posts" to "authenticated";

grant references on table "public"."blog_posts" to "authenticated";

grant select on table "public"."blog_posts" to "authenticated";

grant trigger on table "public"."blog_posts" to "authenticated";

grant truncate on table "public"."blog_posts" to "authenticated";

grant update on table "public"."blog_posts" to "authenticated";

grant delete on table "public"."blog_posts" to "service_role";

grant insert on table "public"."blog_posts" to "service_role";

grant references on table "public"."blog_posts" to "service_role";

grant select on table "public"."blog_posts" to "service_role";

grant trigger on table "public"."blog_posts" to "service_role";

grant truncate on table "public"."blog_posts" to "service_role";

grant update on table "public"."blog_posts" to "service_role";

grant delete on table "public"."connector_requests" to "anon";

grant insert on table "public"."connector_requests" to "anon";

grant references on table "public"."connector_requests" to "anon";

grant select on table "public"."connector_requests" to "anon";

grant trigger on table "public"."connector_requests" to "anon";

grant truncate on table "public"."connector_requests" to "anon";

grant update on table "public"."connector_requests" to "anon";

grant delete on table "public"."connector_requests" to "authenticated";

grant insert on table "public"."connector_requests" to "authenticated";

grant references on table "public"."connector_requests" to "authenticated";

grant select on table "public"."connector_requests" to "authenticated";

grant trigger on table "public"."connector_requests" to "authenticated";

grant truncate on table "public"."connector_requests" to "authenticated";

grant update on table "public"."connector_requests" to "authenticated";

grant delete on table "public"."connector_requests" to "service_role";

grant insert on table "public"."connector_requests" to "service_role";

grant references on table "public"."connector_requests" to "service_role";

grant select on table "public"."connector_requests" to "service_role";

grant trigger on table "public"."connector_requests" to "service_role";

grant truncate on table "public"."connector_requests" to "service_role";

grant update on table "public"."connector_requests" to "service_role";

grant delete on table "public"."creator_accounts" to "service_role";

grant insert on table "public"."creator_accounts" to "service_role";

grant references on table "public"."creator_accounts" to "service_role";

grant select on table "public"."creator_accounts" to "service_role";

grant trigger on table "public"."creator_accounts" to "service_role";

grant truncate on table "public"."creator_accounts" to "service_role";

grant update on table "public"."creator_accounts" to "service_role";

grant delete on table "public"."dashboard_page_versions" to "anon";

grant insert on table "public"."dashboard_page_versions" to "anon";

grant references on table "public"."dashboard_page_versions" to "anon";

grant select on table "public"."dashboard_page_versions" to "anon";

grant trigger on table "public"."dashboard_page_versions" to "anon";

grant truncate on table "public"."dashboard_page_versions" to "anon";

grant update on table "public"."dashboard_page_versions" to "anon";

grant delete on table "public"."dashboard_page_versions" to "authenticated";

grant insert on table "public"."dashboard_page_versions" to "authenticated";

grant references on table "public"."dashboard_page_versions" to "authenticated";

grant select on table "public"."dashboard_page_versions" to "authenticated";

grant trigger on table "public"."dashboard_page_versions" to "authenticated";

grant truncate on table "public"."dashboard_page_versions" to "authenticated";

grant update on table "public"."dashboard_page_versions" to "authenticated";

grant delete on table "public"."dashboard_page_versions" to "service_role";

grant insert on table "public"."dashboard_page_versions" to "service_role";

grant references on table "public"."dashboard_page_versions" to "service_role";

grant select on table "public"."dashboard_page_versions" to "service_role";

grant trigger on table "public"."dashboard_page_versions" to "service_role";

grant truncate on table "public"."dashboard_page_versions" to "service_role";

grant update on table "public"."dashboard_page_versions" to "service_role";

grant delete on table "public"."dashboard_pages" to "anon";

grant insert on table "public"."dashboard_pages" to "anon";

grant references on table "public"."dashboard_pages" to "anon";

grant select on table "public"."dashboard_pages" to "anon";

grant trigger on table "public"."dashboard_pages" to "anon";

grant truncate on table "public"."dashboard_pages" to "anon";

grant update on table "public"."dashboard_pages" to "anon";

grant delete on table "public"."dashboard_pages" to "authenticated";

grant insert on table "public"."dashboard_pages" to "authenticated";

grant references on table "public"."dashboard_pages" to "authenticated";

grant select on table "public"."dashboard_pages" to "authenticated";

grant trigger on table "public"."dashboard_pages" to "authenticated";

grant truncate on table "public"."dashboard_pages" to "authenticated";

grant update on table "public"."dashboard_pages" to "authenticated";

grant delete on table "public"."dashboard_pages" to "service_role";

grant insert on table "public"."dashboard_pages" to "service_role";

grant references on table "public"."dashboard_pages" to "service_role";

grant select on table "public"."dashboard_pages" to "service_role";

grant trigger on table "public"."dashboard_pages" to "service_role";

grant truncate on table "public"."dashboard_pages" to "service_role";

grant update on table "public"."dashboard_pages" to "service_role";

grant delete on table "public"."engine_pool" to "anon";

grant insert on table "public"."engine_pool" to "anon";

grant references on table "public"."engine_pool" to "anon";

grant select on table "public"."engine_pool" to "anon";

grant trigger on table "public"."engine_pool" to "anon";

grant truncate on table "public"."engine_pool" to "anon";

grant update on table "public"."engine_pool" to "anon";

grant delete on table "public"."engine_pool" to "authenticated";

grant insert on table "public"."engine_pool" to "authenticated";

grant references on table "public"."engine_pool" to "authenticated";

grant select on table "public"."engine_pool" to "authenticated";

grant trigger on table "public"."engine_pool" to "authenticated";

grant truncate on table "public"."engine_pool" to "authenticated";

grant update on table "public"."engine_pool" to "authenticated";

grant delete on table "public"."engine_pool" to "service_role";

grant insert on table "public"."engine_pool" to "service_role";

grant references on table "public"."engine_pool" to "service_role";

grant select on table "public"."engine_pool" to "service_role";

grant trigger on table "public"."engine_pool" to "service_role";

grant truncate on table "public"."engine_pool" to "service_role";

grant update on table "public"."engine_pool" to "service_role";

grant delete on table "public"."expert_email_opt_outs" to "anon";

grant insert on table "public"."expert_email_opt_outs" to "anon";

grant references on table "public"."expert_email_opt_outs" to "anon";

grant select on table "public"."expert_email_opt_outs" to "anon";

grant trigger on table "public"."expert_email_opt_outs" to "anon";

grant truncate on table "public"."expert_email_opt_outs" to "anon";

grant update on table "public"."expert_email_opt_outs" to "anon";

grant delete on table "public"."expert_email_opt_outs" to "authenticated";

grant insert on table "public"."expert_email_opt_outs" to "authenticated";

grant references on table "public"."expert_email_opt_outs" to "authenticated";

grant select on table "public"."expert_email_opt_outs" to "authenticated";

grant trigger on table "public"."expert_email_opt_outs" to "authenticated";

grant truncate on table "public"."expert_email_opt_outs" to "authenticated";

grant update on table "public"."expert_email_opt_outs" to "authenticated";

grant delete on table "public"."expert_email_opt_outs" to "service_role";

grant insert on table "public"."expert_email_opt_outs" to "service_role";

grant references on table "public"."expert_email_opt_outs" to "service_role";

grant select on table "public"."expert_email_opt_outs" to "service_role";

grant trigger on table "public"."expert_email_opt_outs" to "service_role";

grant truncate on table "public"."expert_email_opt_outs" to "service_role";

grant update on table "public"."expert_email_opt_outs" to "service_role";

grant delete on table "public"."expert_hire_requests" to "anon";

grant insert on table "public"."expert_hire_requests" to "anon";

grant references on table "public"."expert_hire_requests" to "anon";

grant select on table "public"."expert_hire_requests" to "anon";

grant trigger on table "public"."expert_hire_requests" to "anon";

grant truncate on table "public"."expert_hire_requests" to "anon";

grant update on table "public"."expert_hire_requests" to "anon";

grant delete on table "public"."expert_hire_requests" to "authenticated";

grant insert on table "public"."expert_hire_requests" to "authenticated";

grant references on table "public"."expert_hire_requests" to "authenticated";

grant select on table "public"."expert_hire_requests" to "authenticated";

grant trigger on table "public"."expert_hire_requests" to "authenticated";

grant truncate on table "public"."expert_hire_requests" to "authenticated";

grant update on table "public"."expert_hire_requests" to "authenticated";

grant delete on table "public"."expert_hire_requests" to "service_role";

grant insert on table "public"."expert_hire_requests" to "service_role";

grant references on table "public"."expert_hire_requests" to "service_role";

grant select on table "public"."expert_hire_requests" to "service_role";

grant trigger on table "public"."expert_hire_requests" to "service_role";

grant truncate on table "public"."expert_hire_requests" to "service_role";

grant update on table "public"."expert_hire_requests" to "service_role";

grant delete on table "public"."experts" to "anon";

grant insert on table "public"."experts" to "anon";

grant references on table "public"."experts" to "anon";

grant trigger on table "public"."experts" to "anon";

grant truncate on table "public"."experts" to "anon";

grant update on table "public"."experts" to "anon";

grant delete on table "public"."experts" to "authenticated";

grant insert on table "public"."experts" to "authenticated";

grant references on table "public"."experts" to "authenticated";

grant select on table "public"."experts" to "authenticated";

grant trigger on table "public"."experts" to "authenticated";

grant truncate on table "public"."experts" to "authenticated";

grant update on table "public"."experts" to "authenticated";

grant delete on table "public"."experts" to "service_role";

grant insert on table "public"."experts" to "service_role";

grant references on table "public"."experts" to "service_role";

grant select on table "public"."experts" to "service_role";

grant trigger on table "public"."experts" to "service_role";

grant truncate on table "public"."experts" to "service_role";

grant update on table "public"."experts" to "service_role";

grant delete on table "public"."invitation_codes" to "anon";

grant insert on table "public"."invitation_codes" to "anon";

grant references on table "public"."invitation_codes" to "anon";

grant select on table "public"."invitation_codes" to "anon";

grant trigger on table "public"."invitation_codes" to "anon";

grant truncate on table "public"."invitation_codes" to "anon";

grant update on table "public"."invitation_codes" to "anon";

grant delete on table "public"."invitation_codes" to "authenticated";

grant insert on table "public"."invitation_codes" to "authenticated";

grant references on table "public"."invitation_codes" to "authenticated";

grant select on table "public"."invitation_codes" to "authenticated";

grant trigger on table "public"."invitation_codes" to "authenticated";

grant truncate on table "public"."invitation_codes" to "authenticated";

grant update on table "public"."invitation_codes" to "authenticated";

grant delete on table "public"."invitation_codes" to "service_role";

grant insert on table "public"."invitation_codes" to "service_role";

grant references on table "public"."invitation_codes" to "service_role";

grant select on table "public"."invitation_codes" to "service_role";

grant trigger on table "public"."invitation_codes" to "service_role";

grant truncate on table "public"."invitation_codes" to "service_role";

grant update on table "public"."invitation_codes" to "service_role";

grant delete on table "public"."invitation_redemptions" to "anon";

grant insert on table "public"."invitation_redemptions" to "anon";

grant references on table "public"."invitation_redemptions" to "anon";

grant select on table "public"."invitation_redemptions" to "anon";

grant trigger on table "public"."invitation_redemptions" to "anon";

grant truncate on table "public"."invitation_redemptions" to "anon";

grant update on table "public"."invitation_redemptions" to "anon";

grant delete on table "public"."invitation_redemptions" to "authenticated";

grant insert on table "public"."invitation_redemptions" to "authenticated";

grant references on table "public"."invitation_redemptions" to "authenticated";

grant select on table "public"."invitation_redemptions" to "authenticated";

grant trigger on table "public"."invitation_redemptions" to "authenticated";

grant truncate on table "public"."invitation_redemptions" to "authenticated";

grant update on table "public"."invitation_redemptions" to "authenticated";

grant delete on table "public"."invitation_redemptions" to "service_role";

grant insert on table "public"."invitation_redemptions" to "service_role";

grant references on table "public"."invitation_redemptions" to "service_role";

grant select on table "public"."invitation_redemptions" to "service_role";

grant trigger on table "public"."invitation_redemptions" to "service_role";

grant truncate on table "public"."invitation_redemptions" to "service_role";

grant update on table "public"."invitation_redemptions" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."published_files" to "anon";

grant insert on table "public"."published_files" to "anon";

grant references on table "public"."published_files" to "anon";

grant select on table "public"."published_files" to "anon";

grant trigger on table "public"."published_files" to "anon";

grant truncate on table "public"."published_files" to "anon";

grant update on table "public"."published_files" to "anon";

grant delete on table "public"."published_files" to "authenticated";

grant insert on table "public"."published_files" to "authenticated";

grant references on table "public"."published_files" to "authenticated";

grant select on table "public"."published_files" to "authenticated";

grant trigger on table "public"."published_files" to "authenticated";

grant truncate on table "public"."published_files" to "authenticated";

grant update on table "public"."published_files" to "authenticated";

grant delete on table "public"."published_files" to "service_role";

grant insert on table "public"."published_files" to "service_role";

grant references on table "public"."published_files" to "service_role";

grant select on table "public"."published_files" to "service_role";

grant trigger on table "public"."published_files" to "service_role";

grant truncate on table "public"."published_files" to "service_role";

grant update on table "public"."published_files" to "service_role";

grant delete on table "public"."rerun_usage_events" to "anon";

grant insert on table "public"."rerun_usage_events" to "anon";

grant references on table "public"."rerun_usage_events" to "anon";

grant select on table "public"."rerun_usage_events" to "anon";

grant trigger on table "public"."rerun_usage_events" to "anon";

grant truncate on table "public"."rerun_usage_events" to "anon";

grant update on table "public"."rerun_usage_events" to "anon";

grant delete on table "public"."rerun_usage_events" to "authenticated";

grant insert on table "public"."rerun_usage_events" to "authenticated";

grant references on table "public"."rerun_usage_events" to "authenticated";

grant select on table "public"."rerun_usage_events" to "authenticated";

grant trigger on table "public"."rerun_usage_events" to "authenticated";

grant truncate on table "public"."rerun_usage_events" to "authenticated";

grant update on table "public"."rerun_usage_events" to "authenticated";

grant delete on table "public"."rerun_usage_events" to "service_role";

grant insert on table "public"."rerun_usage_events" to "service_role";

grant references on table "public"."rerun_usage_events" to "service_role";

grant select on table "public"."rerun_usage_events" to "service_role";

grant trigger on table "public"."rerun_usage_events" to "service_role";

grant truncate on table "public"."rerun_usage_events" to "service_role";

grant update on table "public"."rerun_usage_events" to "service_role";

grant delete on table "public"."services" to "anon";

grant insert on table "public"."services" to "anon";

grant references on table "public"."services" to "anon";

grant trigger on table "public"."services" to "anon";

grant truncate on table "public"."services" to "anon";

grant update on table "public"."services" to "anon";

grant delete on table "public"."services" to "authenticated";

grant insert on table "public"."services" to "authenticated";

grant references on table "public"."services" to "authenticated";

grant trigger on table "public"."services" to "authenticated";

grant truncate on table "public"."services" to "authenticated";

grant update on table "public"."services" to "authenticated";

grant delete on table "public"."services" to "service_role";

grant insert on table "public"."services" to "service_role";

grant references on table "public"."services" to "service_role";

grant select on table "public"."services" to "service_role";

grant trigger on table "public"."services" to "service_role";

grant truncate on table "public"."services" to "service_role";

grant update on table "public"."services" to "service_role";

grant delete on table "public"."sessions" to "anon";

grant insert on table "public"."sessions" to "anon";

grant references on table "public"."sessions" to "anon";

grant select on table "public"."sessions" to "anon";

grant trigger on table "public"."sessions" to "anon";

grant truncate on table "public"."sessions" to "anon";

grant update on table "public"."sessions" to "anon";

grant delete on table "public"."sessions" to "authenticated";

grant insert on table "public"."sessions" to "authenticated";

grant references on table "public"."sessions" to "authenticated";

grant select on table "public"."sessions" to "authenticated";

grant trigger on table "public"."sessions" to "authenticated";

grant truncate on table "public"."sessions" to "authenticated";

grant update on table "public"."sessions" to "authenticated";

grant delete on table "public"."sessions" to "service_role";

grant insert on table "public"."sessions" to "service_role";

grant references on table "public"."sessions" to "service_role";

grant select on table "public"."sessions" to "service_role";

grant trigger on table "public"."sessions" to "service_role";

grant truncate on table "public"."sessions" to "service_role";

grant update on table "public"."sessions" to "service_role";

grant delete on table "public"."spaces" to "anon";

grant insert on table "public"."spaces" to "anon";

grant references on table "public"."spaces" to "anon";

grant select on table "public"."spaces" to "anon";

grant trigger on table "public"."spaces" to "anon";

grant truncate on table "public"."spaces" to "anon";

grant update on table "public"."spaces" to "anon";

grant delete on table "public"."spaces" to "authenticated";

grant references on table "public"."spaces" to "authenticated";

grant trigger on table "public"."spaces" to "authenticated";

grant truncate on table "public"."spaces" to "authenticated";

grant delete on table "public"."spaces" to "service_role";

grant insert on table "public"."spaces" to "service_role";

grant references on table "public"."spaces" to "service_role";

grant select on table "public"."spaces" to "service_role";

grant trigger on table "public"."spaces" to "service_role";

grant truncate on table "public"."spaces" to "service_role";

grant update on table "public"."spaces" to "service_role";

grant delete on table "public"."stripe_events" to "service_role";

grant insert on table "public"."stripe_events" to "service_role";

grant references on table "public"."stripe_events" to "service_role";

grant select on table "public"."stripe_events" to "service_role";

grant trigger on table "public"."stripe_events" to "service_role";

grant truncate on table "public"."stripe_events" to "service_role";

grant update on table "public"."stripe_events" to "service_role";

grant delete on table "public"."template_purchases" to "service_role";

grant insert on table "public"."template_purchases" to "service_role";

grant references on table "public"."template_purchases" to "service_role";

grant select on table "public"."template_purchases" to "service_role";

grant trigger on table "public"."template_purchases" to "service_role";

grant truncate on table "public"."template_purchases" to "service_role";

grant update on table "public"."template_purchases" to "service_role";

grant delete on table "public"."template_sales" to "service_role";

grant insert on table "public"."template_sales" to "service_role";

grant references on table "public"."template_sales" to "service_role";

grant select on table "public"."template_sales" to "service_role";

grant trigger on table "public"."template_sales" to "service_role";

grant truncate on table "public"."template_sales" to "service_role";

grant update on table "public"."template_sales" to "service_role";

grant delete on table "public"."templates" to "anon";

grant insert on table "public"."templates" to "anon";

grant references on table "public"."templates" to "anon";

grant trigger on table "public"."templates" to "anon";

grant truncate on table "public"."templates" to "anon";

grant update on table "public"."templates" to "anon";

grant delete on table "public"."templates" to "authenticated";

grant insert on table "public"."templates" to "authenticated";

grant references on table "public"."templates" to "authenticated";

grant trigger on table "public"."templates" to "authenticated";

grant truncate on table "public"."templates" to "authenticated";

grant update on table "public"."templates" to "authenticated";

grant delete on table "public"."templates" to "service_role";

grant insert on table "public"."templates" to "service_role";

grant references on table "public"."templates" to "service_role";

grant select on table "public"."templates" to "service_role";

grant trigger on table "public"."templates" to "service_role";

grant truncate on table "public"."templates" to "service_role";

grant update on table "public"."templates" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";

grant delete on table "public"."workspace_invitations" to "anon";

grant insert on table "public"."workspace_invitations" to "anon";

grant references on table "public"."workspace_invitations" to "anon";

grant select on table "public"."workspace_invitations" to "anon";

grant trigger on table "public"."workspace_invitations" to "anon";

grant truncate on table "public"."workspace_invitations" to "anon";

grant update on table "public"."workspace_invitations" to "anon";

grant delete on table "public"."workspace_invitations" to "authenticated";

grant insert on table "public"."workspace_invitations" to "authenticated";

grant references on table "public"."workspace_invitations" to "authenticated";

grant select on table "public"."workspace_invitations" to "authenticated";

grant trigger on table "public"."workspace_invitations" to "authenticated";

grant truncate on table "public"."workspace_invitations" to "authenticated";

grant update on table "public"."workspace_invitations" to "authenticated";

grant delete on table "public"."workspace_invitations" to "service_role";

grant insert on table "public"."workspace_invitations" to "service_role";

grant references on table "public"."workspace_invitations" to "service_role";

grant select on table "public"."workspace_invitations" to "service_role";

grant trigger on table "public"."workspace_invitations" to "service_role";

grant truncate on table "public"."workspace_invitations" to "service_role";

grant update on table "public"."workspace_invitations" to "service_role";

grant delete on table "public"."workspace_members" to "anon";

grant insert on table "public"."workspace_members" to "anon";

grant references on table "public"."workspace_members" to "anon";

grant select on table "public"."workspace_members" to "anon";

grant trigger on table "public"."workspace_members" to "anon";

grant truncate on table "public"."workspace_members" to "anon";

grant update on table "public"."workspace_members" to "anon";

grant delete on table "public"."workspace_members" to "authenticated";

grant insert on table "public"."workspace_members" to "authenticated";

grant references on table "public"."workspace_members" to "authenticated";

grant select on table "public"."workspace_members" to "authenticated";

grant trigger on table "public"."workspace_members" to "authenticated";

grant truncate on table "public"."workspace_members" to "authenticated";

grant update on table "public"."workspace_members" to "authenticated";

grant delete on table "public"."workspace_members" to "service_role";

grant insert on table "public"."workspace_members" to "service_role";

grant references on table "public"."workspace_members" to "service_role";

grant select on table "public"."workspace_members" to "service_role";

grant trigger on table "public"."workspace_members" to "service_role";

grant truncate on table "public"."workspace_members" to "service_role";

grant update on table "public"."workspace_members" to "service_role";

grant delete on table "public"."workspaces" to "anon";

grant insert on table "public"."workspaces" to "anon";

grant references on table "public"."workspaces" to "anon";

grant select on table "public"."workspaces" to "anon";

grant trigger on table "public"."workspaces" to "anon";

grant truncate on table "public"."workspaces" to "anon";

grant update on table "public"."workspaces" to "anon";

grant delete on table "public"."workspaces" to "authenticated";

grant insert on table "public"."workspaces" to "authenticated";

grant references on table "public"."workspaces" to "authenticated";

grant select on table "public"."workspaces" to "authenticated";

grant trigger on table "public"."workspaces" to "authenticated";

grant truncate on table "public"."workspaces" to "authenticated";

grant update on table "public"."workspaces" to "authenticated";

grant delete on table "public"."workspaces" to "service_role";

grant insert on table "public"."workspaces" to "service_role";

grant references on table "public"."workspaces" to "service_role";

grant select on table "public"."workspaces" to "service_role";

grant trigger on table "public"."workspaces" to "service_role";

grant truncate on table "public"."workspaces" to "service_role";

grant update on table "public"."workspaces" to "service_role";


  create policy "Users can delete agents in their workspace"
  on "public"."agents"
  as permissive
  for delete
  to public
using ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "Users can insert agents in their workspace"
  on "public"."agents"
  as permissive
  for insert
  to public
with check ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "Users can update agents in their workspace"
  on "public"."agents"
  as permissive
  for update
  to public
using ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "Users can view agents in their workspace"
  on "public"."agents"
  as permissive
  for select
  to public
using ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "Public can read published posts"
  on "public"."blog_posts"
  as permissive
  for select
  to public
using ((published = true));



  create policy "dashboard_page_versions_read"
  on "public"."dashboard_page_versions"
  as permissive
  for select
  to public
using ((page_id IN ( SELECT p.id
   FROM public.dashboard_pages p
  WHERE (p.workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)))));



  create policy "dashboard_pages_read"
  on "public"."dashboard_pages"
  as permissive
  for select
  to public
using (((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)) OR is_public));



  create policy "public read published experts"
  on "public"."experts"
  as permissive
  for select
  to anon, authenticated
using ((status = 'published'::public.expert_status));



  create policy "notifications_select_workspace_members"
  on "public"."notifications"
  as permissive
  for select
  to authenticated
using ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));



  create policy "public read enabled services"
  on "public"."services"
  as permissive
  for select
  to anon, authenticated
using (enabled);



  create policy "Users can delete sessions for their agents"
  on "public"."sessions"
  as permissive
  for delete
  to public
using ((agent_id IN ( SELECT a.id
   FROM public.agents a
  WHERE (a.workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)))));



  create policy "Users can insert sessions for their agents"
  on "public"."sessions"
  as permissive
  for insert
  to public
with check ((agent_id IN ( SELECT a.id
   FROM public.agents a
  WHERE (a.workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)))));



  create policy "Users can update sessions for their agents"
  on "public"."sessions"
  as permissive
  for update
  to public
using ((agent_id IN ( SELECT a.id
   FROM public.agents a
  WHERE (a.workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)))));



  create policy "Users can view sessions for their agents"
  on "public"."sessions"
  as permissive
  for select
  to public
using ((agent_id IN ( SELECT a.id
   FROM public.agents a
  WHERE (a.workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)))));



  create policy "spaces_delete_own_workspace"
  on "public"."spaces"
  as permissive
  for delete
  to public
using ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "spaces_insert_own_workspace"
  on "public"."spaces"
  as permissive
  for insert
  to public
with check ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "spaces_select_own_workspace"
  on "public"."spaces"
  as permissive
  for select
  to public
using ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "spaces_update_own_workspace"
  on "public"."spaces"
  as permissive
  for update
  to public
using ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)))
with check ((workspace_id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));



  create policy "anon reads public templates"
  on "public"."templates"
  as permissive
  for select
  to anon
using (((status = 'unlisted'::public.template_status) OR ((status = 'published'::public.template_status) AND show_in_marketplace)));



  create policy "members read listed templates"
  on "public"."templates"
  as permissive
  for select
  to authenticated
using (((status = 'unlisted'::public.template_status) OR ((status = 'published'::public.template_status) AND (show_in_marketplace OR show_in_library))));



  create policy "Users can insert their own record"
  on "public"."users"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "Users can update their own record"
  on "public"."users"
  as permissive
  for update
  to public
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "Users can view their own record"
  on "public"."users"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "Members can view their own memberships"
  on "public"."workspace_members"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "Users can view their workspace"
  on "public"."workspaces"
  as permissive
  for select
  to authenticated
using ((id IN ( SELECT public.current_workspace_ids() AS current_workspace_ids)));


CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_session_status_to_agent AFTER INSERT OR UPDATE OF status ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_agent_status_from_sessions();

CREATE TRIGGER users_lock_workspace_id BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.prevent_user_workspace_change();


