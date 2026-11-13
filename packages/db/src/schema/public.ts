// Pulled from the database the Supabase migrations had built (2026-11-09). From here on it is the
// source of truth: change it, then `pnpm db:generate` writes the migration.

import { type PgTableExtraConfigValue, pgTable, unique, uuid, text, boolean, index, foreignKey, uniqueIndex, integer, bigint, jsonb, check, smallint, vector, type AnyPgColumn, varchar, date, primaryKey, real, pgEnum, doublePrecision } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { authUsers } from './auth'
import { timestamptz, type Json } from './columns'

export const account_role = pgEnum('account_role', ['member', 'expert'])
export const agent_service_status = pgEnum('agent_service_status', ['active', 'needs_config', 'error'])
export const agent_status = pgEnum('agent_status', ['idle', 'working', 'error', 'waiting_human', 'offline'])
export const cloud_provider = pgEnum('cloud_provider', ['incus'])
export const engine_pool_status = pgEnum('engine_pool_status', ['provisioning', 'available', 'claimed', 'error', 'updating'])
export const engine_update_status = pgEnum('engine_update_status', ['success', 'error', 'deferred', 'abandoned'])
export const expert_application_status = pgEnum('expert_application_status', ['pending', 'accepted', 'rejected'])
export const expert_availability = pgEnum('expert_availability', ['available', 'soon', 'unavailable'])
export const expert_source = pgEnum('expert_source', ['seed', 'import', 'application'])
export const expert_status = pgEnum('expert_status', ['draft', 'invited', 'published', 'declined'])
export const expert_type = pgEnum('expert_type', ['studio', 'freelancer', 'expert'])
export const lifecycle_email_status = pgEnum('lifecycle_email_status', ['sent', 'failed'])
export const newsletter_recipient_status = pgEnum('newsletter_recipient_status', ['pending', 'sent', 'failed', 'skipped'])
export const newsletter_send_status = pgEnum('newsletter_send_status', ['queued', 'sending', 'sent', 'failed', 'canceled'])
export const notification_email_status = pgEnum('notification_email_status', ['sent', 'suppressed', 'digested', 'skipped'])
export const notification_kind = pgEnum('notification_kind', ['info', 'question', 'approval', 'done', 'error', 'connector'])
export const session_kind = pgEnum('session_kind', ['general', 'thread'])
export const session_outcome = pgEnum('session_outcome', ['done', 'nothing', 'failed'])
export const session_source = pgEnum('session_source', ['dashboard', 'builder', 'schedule', 'agent', 'delegate', 'api', 'trigger', 'issue', 'channel'])
export const session_status = pgEnum('session_status', ['idle', 'working', 'error', 'waiting_human', 'awaiting_question', 'awaiting_approval', 'awaiting_connector', 'awaiting_ack'])
export const team_member_role = pgEnum('team_member_role', ['lead', 'member'])
export const goal_status = pgEnum('goal_status', ['planned', 'active', 'achieved', 'cancelled'])
export const project_status = pgEnum('project_status', ['planned', 'active', 'paused', 'completed', 'archived'])
export const issue_status = pgEnum('issue_status', ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'])
export const issue_priority = pgEnum('issue_priority', ['none', 'low', 'medium', 'high', 'urgent'])
export const channel_kind = pgEnum('channel_kind', ['public', 'private', 'dm'])
export const template_pricing_model = pgEnum('template_pricing_model', ['free', 'one_time', 'recurring'])
export const template_purchase_status = pgEnum('template_purchase_status', ['pending', 'active', 'past_due', 'canceled', 'refunded'])
export const template_status = pgEnum('template_status', ['draft', 'in_review', 'published', 'unlisted', 'archived'])
export const workspace_archive_reason = pgEnum('workspace_archive_reason', ['access_ended', 'inactivity', 'manual'])
export const workspace_archive_status = pgEnum('workspace_archive_status', ['archiving', 'archived', 'restoring', 'restored', 'failed'])
export const workspace_role = pgEnum('workspace_role', ['admin', 'member'])

export const agents = pgTable(
    'agents',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        name: text().notNull(),
        description: text(),
        status: agent_status().default('idle').notNull(),
        col: integer().default(0).notNull(),
        row: integer().default(0).notNull(),
        workspace_id: integer().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        space_id: uuid().notNull(),
        engine_agent_id: text(),
        handle: text(),
        template_id: uuid(),
        disabled_at: timestamptz(),
        disabled_reason: text(),
        disabled_schedule_slugs: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        title: text(),
        reports_to_agent_id: uuid(),
        monthly_budget_micros: bigint({ mode: 'number' }),
    },
    (table): PgTableExtraConfigValue[] => [
        unique('agents_id_workspace_key').on(table.id, table.workspace_id),
        index('agents_reports_to_idx')
            .using('btree', table.reports_to_agent_id)
            .where(sql`(reports_to_agent_id IS NOT NULL)`),
        foreignKey({
            columns: [table.reports_to_agent_id],
            foreignColumns: [table.id],
            name: 'agents_reports_to_agent_id_fkey',
        }).onDelete('set null'),
        check('agents_monthly_budget_micros_check', sql`(monthly_budget_micros IS NULL) OR (monthly_budget_micros >= 0)`),
        check('agents_title_length_check', sql`(title IS NULL) OR (char_length(title) <= 120)`),
        index('agents_created_at_idx').using('btree', table.created_at),
        index('agents_disabled_idx')
            .using('btree', table.workspace_id)
            .where(sql`(disabled_at IS NOT NULL)`),
        index('agents_template_id_idx')
            .using('btree', table.template_id)
            .where(sql`(template_id IS NOT NULL)`),
        uniqueIndex('agents_workspace_handle_key')
            .using('btree', table.workspace_id, table.handle)
            .where(sql`(handle IS NOT NULL)`),
        index('idx_agents_workspace_id').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.space_id, table.workspace_id],
            foreignColumns: [spaces.id, spaces.workspace_id],
            name: 'agents_space_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.template_id],
            foreignColumns: [templates.id],
            name: 'agents_template_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'agents_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const agent_shares = pgTable(
    'agent_shares',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        token: text().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        created_by: uuid(),
        source_agent_id: uuid(),
        source_agent_name: text().notNull(),
        preview: jsonb().$type<Json>().notNull(),
        archive_path: text().notNull(),
        archive_bytes: bigint({ mode: 'number' }).notNull(),
        engine_commit: text(),
        include_memories: boolean().default(false).notNull(),
        include_database: boolean().default(false).notNull(),
        include_files: boolean().default(true).notNull(),
        install_count: integer().default(0).notNull(),
        revoked_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('agent_shares_active_idx')
            .using('btree', table.workspace_id)
            .where(sql`(revoked_at IS NULL)`),
        index('agent_shares_workspace_idx').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.created_by],
            foreignColumns: [users.id],
            name: 'agent_shares_created_by_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.source_agent_id],
            foreignColumns: [agents.id],
            name: 'agent_shares_source_agent_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'agent_shares_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('agent_shares_token_key').on(table.token),
    ]
)

export const api_keys = pgTable(
    'api_keys',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        name: text().notNull(),
        key_prefix: text().notNull(),
        key_hash: text().notNull(),
        created_by: text(),
        last_used_at: timestamptz(),
        revoked_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        created_by_user_id: uuid(),
        expires_at: timestamptz(),
        scope: text().default('account').notNull(),
        bound_agent_id: uuid(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('api_keys_workspace_id_idx').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.bound_agent_id],
            foreignColumns: [agents.id],
            name: 'api_keys_bound_agent_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.created_by_user_id],
            foreignColumns: [users.id],
            name: 'api_keys_created_by_user_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'api_keys_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('api_keys_key_hash_key').on(table.key_hash),
        check('api_keys_scope_check', sql`scope = ANY (ARRAY['account'::text, 'agent_import'::text])`),
    ]
)

export const app_connections = pgTable(
    'app_connections',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        app_slug: text().notNull(),
        provider_account_id: text(),
        provider_member_id: text(),
        label: text(),
        provider_webhook_id: text(),
        provider_webhook_secret: text(),
        connected_by: uuid(),
        status: text().default('connecting').notNull(),
        paused_until: timestamptz(),
        pause_reason: text(),
        last_event_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('app_connections_provider_account_idx')
            .using('btree', table.app_slug, table.provider_account_id)
            .where(sql`((provider_account_id IS NOT NULL) AND (status <> 'deleted'::text))`),
        index('app_connections_workspace_idx')
            .using('btree', table.workspace_id, table.app_slug)
            .where(sql`(status <> 'deleted'::text)`),
        foreignKey({
            columns: [table.connected_by],
            foreignColumns: [users.id],
            name: 'app_connections_connected_by_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'app_connections_workspace_id_fkey',
        }).onDelete('cascade'),
        check('app_connections_status_check', sql`status = ANY (ARRAY['connecting'::text, 'connected'::text, 'needs_reconnect'::text, 'paused'::text, 'deleted'::text])`),
    ]
)

export const app_webhook_events = pgTable('app_webhook_events', {
    event_id: text().primaryKey().notNull(),
    app_slug: text().notNull(),
    received_at: timestamptz()
        .default(sql`now()`)
        .notNull(),
    processed_at: timestamptz(),
})

export const blocked_email_domains = pgTable('blocked_email_domains', {
    domain: text().primaryKey().notNull(),
    note: text(),
    created_by: text(),
    created_at: timestamptz()
        .default(sql`now()`)
        .notNull(),
})

export const app_trial_claims = pgTable(
    'app_trial_claims',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        app_slug: text().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        provider_member_id: text().notNull(),
        claimed_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'app_trial_claims_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('app_trial_claims_app_slug_provider_member_id_key').on(table.app_slug, table.provider_member_id),
        unique('app_trial_claims_app_slug_workspace_id_key').on(table.app_slug, table.workspace_id),
    ]
)

export const email_sign_up_limits = pgTable('email_sign_up_limits', {
    scope: text().primaryKey().notNull(),
    sign_up_count: integer().default(0).notNull(),
    window_started_at: timestamptz()
        .default(sql`now()`)
        .notNull(),
})

export const engine_pairing_tokens = pgTable(
    'engine_pairing_tokens',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        token_hash: text().notNull(),
        created_by: uuid(),
        expires_at: timestamptz().notNull(),
        used_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('engine_pairing_tokens_workspace_id_idx').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.created_by],
            foreignColumns: [authUsers.id],
            name: 'engine_pairing_tokens_created_by_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'engine_pairing_tokens_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('engine_pairing_tokens_token_hash_key').on(table.token_hash),
    ]
)

export const engine_hosts = pgTable(
    'engine_hosts',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        name: text().notNull(),
        public_ip: text().notNull(),
        ssh_user: text().default('root').notNull(),
        max_boxes: smallint().default(40).notNull(),
        enabled: boolean().default(true).notNull(),
        notes: text(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [unique('engine_hosts_name_key').on(table.name), unique('engine_hosts_public_ip_key').on(table.public_ip), check('engine_hosts_max_boxes_check', sql`(max_boxes >= 1) AND (max_boxes <= 100)`)]
)

export const engine_pool = pgTable(
    'engine_pool',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        provider: cloud_provider().default('incus').notNull(),
        provider_server_id: text(),
        region: text(),
        server_type: text(),
        engine_host: text(),
        engine_api_key: text().notNull(),
        status: engine_pool_status().default('provisioning').notNull(),
        error_message: text(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        last_update_at: timestamptz(),
        last_update_status: engine_update_status(),
        last_update_log: text(),
        host_id: uuid(),
        box_index: smallint(),
        claimed_by_workspace_id: bigint({ mode: 'number' }),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('engine_pool_claimed_by_workspace_id_key')
            .using('btree', table.claimed_by_workspace_id)
            .where(sql`(claimed_by_workspace_id IS NOT NULL)`),
        uniqueIndex('engine_pool_engine_api_key_key').using('btree', table.engine_api_key),
        uniqueIndex('engine_pool_host_box_index_key')
            .using('btree', table.host_id, table.box_index)
            .where(sql`(host_id IS NOT NULL)`),
        index('engine_pool_status_idx').using('btree', table.status),
        foreignKey({
            columns: [table.claimed_by_workspace_id],
            foreignColumns: [workspaces.id],
            name: 'engine_pool_claimed_by_workspace_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.host_id],
            foreignColumns: [engine_hosts.id],
            name: 'engine_pool_host_id_fkey',
        }).onDelete('set null'),
    ]
)

export const expert_hire_requests = pgTable(
    'expert_hire_requests',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        expert_id: uuid().notNull(),
        name: text().notNull(),
        email: text().notNull(),
        company_url: text(),
        message: text().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('expert_hire_requests_expert_id_idx').using('btree', table.expert_id),
        foreignKey({
            columns: [table.expert_id],
            foreignColumns: [experts.id],
            name: 'expert_hire_requests_expert_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const connector_requests = pgTable(
    'connector_requests',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }),
        agent_id: text(),
        description: text().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'connector_requests_workspace_id_fkey',
        }).onDelete('set null'),
    ]
)

export const creator_accounts = pgTable(
    'creator_accounts',
    {
        user_id: uuid().primaryKey().notNull(),
        stripe_account_id: text().notNull(),
        charges_enabled: boolean().default(false).notNull(),
        payouts_enabled: boolean().default(false).notNull(),
        details_submitted: boolean().default(false).notNull(),
        disabled_reason: text(),
        requirements_due: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        country: text(),
        default_currency: text(),
        onboarded_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'creator_accounts_user_id_fkey',
        }).onDelete('cascade'),
        unique('creator_accounts_stripe_account_id_key').on(table.stripe_account_id),
    ]
)

export const device_tokens = pgTable(
    'device_tokens',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        user_id: uuid().notNull(),
        token: text().notNull(),
        platform: text().notNull(),
        app_version: text(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        last_seen_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        revoked_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('device_tokens_user_active_idx')
            .using('btree', table.user_id)
            .where(sql`(revoked_at IS NULL)`),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [authUsers.id],
            name: 'device_tokens_user_id_fkey',
        }).onDelete('cascade'),
        unique('device_tokens_token_key').on(table.token),
    ]
)

export const lumvika_usage_events = pgTable(
    'lumvika_usage_events',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        space_id: uuid(),
        model: text().notNull(),
        input_tokens: integer().default(0).notNull(),
        output_tokens: integer().default(0).notNull(),
        cost_micros: bigint({ mode: 'number' }).default(0).notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        tier: text(),
        engine_agent_id: text(),
        billed: boolean().default(true).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('lumvika_usage_events_workspace_idx').using('btree', table.workspace_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'lumvika_usage_events_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const message_feedback = pgTable(
    'message_feedback',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        user_id: uuid(),
        agent_id: uuid(),
        session_id: uuid(),
        message_id: text().notNull(),
        rating: text().notNull(),
        category: text(),
        details: text(),
        message_text: text().notNull(),
        transcript: jsonb().$type<Json>().default([]).notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        steward_conversation_id: uuid(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('message_feedback_rating_idx').using('btree', table.rating, table.created_at.desc().nullsFirst()),
        index('message_feedback_recent_idx').using('btree', table.created_at.desc().nullsFirst()),
        index('message_feedback_workspace_idx').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.agent_id],
            foreignColumns: [agents.id],
            name: 'message_feedback_agent_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.session_id],
            foreignColumns: [sessions.id],
            name: 'message_feedback_session_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.steward_conversation_id],
            foreignColumns: [steward_conversations.id],
            name: 'message_feedback_steward_conversation_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'message_feedback_user_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'message_feedback_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('message_feedback_session_id_message_id_key').on(table.session_id, table.message_id),
        unique('message_feedback_steward_conversation_message_key').on(table.steward_conversation_id, table.message_id),
        check('message_feedback_rating_check', sql`rating = ANY (ARRAY['up'::text, 'down'::text])`),
    ]
)

export const newsletter_recipients = pgTable(
    'newsletter_recipients',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        send_id: uuid().notNull(),
        user_id: uuid().notNull(),
        email: text().notNull(),
        status: newsletter_recipient_status().default('pending').notNull(),
        email_id: text(),
        error: text(),
        sent_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('newsletter_recipients_pending_idx').using('btree', table.send_id, table.status, table.user_id),
        uniqueIndex('newsletter_recipients_unique_idx').using('btree', table.send_id, table.user_id),
        foreignKey({
            columns: [table.send_id],
            foreignColumns: [newsletter_sends.id],
            name: 'newsletter_recipients_send_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'newsletter_recipients_user_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const notification_email_dispatches = pgTable(
    'notification_email_dispatches',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        notification_id: uuid().notNull(),
        user_id: uuid().notNull(),
        workspace_id: integer().notNull(),
        source_key: text().notNull(),
        kind: notification_kind().notNull(),
        status: notification_email_status().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        digested_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('notification_email_dispatches_pending_idx')
            .using('btree', table.user_id, table.created_at)
            .where(sql`(status = 'suppressed'::notification_email_status)`),
        index('notification_email_dispatches_source_window_idx').using('btree', table.user_id, table.source_key, table.created_at.desc().nullsFirst()),
        index('notification_email_dispatches_user_window_idx').using('btree', table.user_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.notification_id],
            foreignColumns: [notifications.id],
            name: 'notification_email_dispatches_notification_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'notification_email_dispatches_user_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'notification_email_dispatches_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const notification_email_suppressions = pgTable(
    'notification_email_suppressions',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        user_id: uuid().notNull(),
        source_key: text().notNull(),
        suppressed_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        last_event_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        released_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('notification_email_suppressions_active_key')
            .using('btree', table.user_id, table.source_key)
            .where(sql`(released_at IS NULL)`),
        index('notification_email_suppressions_source_idx')
            .using('btree', table.source_key)
            .where(sql`(released_at IS NULL)`),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'notification_email_suppressions_user_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const invitation_codes = pgTable(
    'invitation_codes',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        code: text().notNull(),
        plan: text().notNull(),
        max_uses: integer(),
        uses: integer().default(0).notNull(),
        expires_at: timestamptz(),
        active: boolean().default(true).notNull(),
        note: text(),
        created_by: text(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [unique('invitation_codes_code_key').on(table.code)]
)

export const lifecycle_emails = pgTable(
    'lifecycle_emails',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        user_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        sequence_key: text().notNull(),
        agent_id: uuid(),
        status: lifecycle_email_status().default('sent').notNull(),
        sent_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        metadata: jsonb().$type<Json>(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('lifecycle_emails_once_per_agent_idx')
            .using('btree', table.agent_id, table.sequence_key)
            .where(sql`(agent_id IS NOT NULL)`),
        uniqueIndex('lifecycle_emails_once_per_user_idx')
            .using('btree', table.user_id, table.sequence_key)
            .where(sql`(sequence_key = ANY (ARRAY['onboarding_resume'::text, 'agent_recommendations'::text, 'creator_pitch'::text]))`),
        uniqueIndex('lifecycle_emails_once_per_workspace_idx')
            .using('btree', table.workspace_id, table.sequence_key)
            .where(sql`(sequence_key = ANY (ARRAY['team_invite'::text, 'trial_started'::text, 'trial_ended'::text, 'trial_ending_2h'::text, 'trial_ending_3d'::text, 'subscription_ending_7d'::text, 'subscription_ending_3d'::text, 'subscription_ending_24h'::text]))`),
        index('lifecycle_emails_user_recent_idx').using('btree', table.user_id, table.sent_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.agent_id],
            foreignColumns: [agents.id],
            name: 'lifecycle_emails_agent_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'lifecycle_emails_user_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'lifecycle_emails_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const newsletter_sends = pgTable(
    'newsletter_sends',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        slug: text().notNull(),
        subject: text().notNull(),
        status: newsletter_send_status().default('queued').notNull(),
        audience_size: integer().default(0).notNull(),
        sent_count: integer().default(0).notNull(),
        failed_count: integer().default(0).notNull(),
        skipped_count: integer().default(0).notNull(),
        run_id: text(),
        error: text(),
        created_by: uuid(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        started_at: timestamptz(),
        completed_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('newsletter_sends_created_at_idx').using('btree', table.created_at.desc().nullsFirst()),
        uniqueIndex('newsletter_sends_slug_idx')
            .using('btree', table.slug)
            .where(sql`(status <> 'canceled'::newsletter_send_status)`),
        foreignKey({
            columns: [table.created_by],
            foreignColumns: [users.id],
            name: 'newsletter_sends_created_by_fkey',
        }).onDelete('set null'),
    ]
)

export const paid_data_events = pgTable(
    'paid_data_events',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity({ name: 'paid_data_events_id_seq' }),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        engine_agent_id: text(),
        tool: text().notNull(),
        capability: text().notNull(),
        served_by: text(),
        outcome: text().notNull(),
        provider_cost_micros: bigint({ mode: 'number' }).default(0).notNull(),
        billed_micros: bigint({ mode: 'number' }).default(0).notNull(),
        treg_status: integer(),
        treg_call_id: text(),
        duration_ms: integer(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('paid_data_events_created_idx').using('btree', table.created_at.desc().nullsFirst()),
        index('paid_data_events_workspace_created_idx').using('btree', table.workspace_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'paid_data_events_workspace_id_fkey',
        }).onDelete('cascade'),
        check('paid_data_events_outcome_check', sql`outcome = ANY (ARRAY['ok'::text, 'miss'::text, 'pending'::text, 'error'::text])`),
    ]
)

export const oauth_pending_grants = pgTable(
    'oauth_pending_grants',
    {
        jti: text().primaryKey().notNull(),
        agent_id: text().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        user_id: uuid().notNull(),
        kind: text(),
        payload: jsonb().$type<Json>(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        expires_at: timestamptz().notNull(),
    },
    (table): PgTableExtraConfigValue[] => [index('oauth_pending_grants_expires_at_idx').using('btree', table.expires_at)]
)

export const published_access_codes = pgTable(
    'published_access_codes',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        published_file_id: uuid().notNull(),
        email: text().notNull(),
        code_hash: text().notNull(),
        attempts: integer().default(0).notNull(),
        expires_at: timestamptz().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('published_access_codes_lookup_idx').using('btree', table.published_file_id, table.email),
        foreignKey({
            columns: [table.published_file_id],
            foreignColumns: [published_files.id],
            name: 'published_access_codes_published_file_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const services = pgTable(
    'services',
    {
        slug: text().primaryKey().notNull(),
        name: text().notNull(),
        category: text().default('other').notNull(),
        summary: text().default('').notNull(),
        icon: text(),
        manifest: jsonb().$type<Json>().notNull(),
        enabled: boolean().default(false).notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        embedding: vector({ dimensions: 1536 }),
        verified: boolean().default(false).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [check('services_category_check', sql`category = ANY (ARRAY['payments'::text, 'ecommerce'::text, 'crm'::text, 'marketing'::text, 'seo'::text, 'analytics'::text, 'dev'::text, 'productivity'::text, 'other'::text])`)]
)

export const published_gate_attempts = pgTable('published_gate_attempts', {
    scope: text().primaryKey().notNull(),
    attempt_count: integer().default(0).notNull(),
    window_started_at: timestamptz()
        .default(sql`now()`)
        .notNull(),
})

export const steward_conversations = pgTable(
    'steward_conversations',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        user_id: uuid().notNull(),
        title: text(),
        messages: jsonb().$type<Json>().default([]).notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        backend: text().default('hub').notNull(),
        engine_session_id: text(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('steward_conversations_recent_idx').using('btree', table.workspace_id, table.user_id, table.updated_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'steward_conversations_user_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'steward_conversations_workspace_id_fkey',
        }).onDelete('cascade'),
        check('steward_conversations_backend_check', sql`backend = ANY (ARRAY['hub'::text, 'engine'::text])`),
    ]
)

export const steward_builds = pgTable(
    'steward_builds',
    {
        workspace_id: bigint({ mode: 'number' }).primaryKey().notNull(),
        started_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        finished_at: timestamptz(),
        result: jsonb().$type<Json>(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'steward_builds_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const template_purchases = pgTable(
    'template_purchases',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        template_id: uuid().notNull(),
        creator_id: uuid(),
        purchased_by: uuid(),
        pricing_model: template_pricing_model().notNull(),
        status: template_purchase_status().default('pending').notNull(),
        amount_cents: integer().default(0).notNull(),
        currency: text().default('usd').notNull(),
        stripe_checkout_session_id: text(),
        stripe_payment_intent_id: text(),
        stripe_subscription_id: text(),
        stripe_price_id: text(),
        stripe_connected_account_id: text(),
        current_period_end: timestamptz(),
        cancel_at_period_end: boolean().default(false).notNull(),
        activated_at: timestamptz(),
        revoked_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('template_purchases_checkout_key')
            .using('btree', table.stripe_checkout_session_id)
            .where(sql`(stripe_checkout_session_id IS NOT NULL)`),
        index('template_purchases_creator_idx').using('btree', table.creator_id),
        uniqueIndex('template_purchases_subscription_key')
            .using('btree', table.stripe_subscription_id)
            .where(sql`(stripe_subscription_id IS NOT NULL)`),
        index('template_purchases_template_idx').using('btree', table.template_id),
        uniqueIndex('template_purchases_workspace_template_key').using('btree', table.workspace_id, table.template_id),
        foreignKey({
            columns: [table.creator_id],
            foreignColumns: [users.id],
            name: 'template_purchases_creator_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.purchased_by],
            foreignColumns: [users.id],
            name: 'template_purchases_purchased_by_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.template_id],
            foreignColumns: [templates.id],
            name: 'template_purchases_template_id_fkey',
        }).onDelete('restrict'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'template_purchases_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const trial_card_fingerprints = pgTable(
    'trial_card_fingerprints',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        fingerprint: text().notNull(),
        workspace_id: bigint({ mode: 'number' }),
        stripe_customer_id: text(),
        stripe_subscription_id: text(),
        payment_method_id: text(),
        trial_skipped_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'trial_card_fingerprints_workspace_id_fkey',
        }).onDelete('set null'),
        unique('trial_card_fingerprints_fingerprint_workspace_id_key').on(table.fingerprint, table.workspace_id),
    ]
)

export const template_sales = pgTable(
    'template_sales',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        template_id: uuid(),
        template_slug: text().notNull(),
        template_title: text().notNull(),
        creator_id: uuid(),
        workspace_id: bigint({ mode: 'number' }),
        purchase_id: uuid(),
        kind: text().notNull(),
        gross_cents: integer().notNull(),
        application_fee_cents: integer().default(0).notNull(),
        net_cents: integer().notNull(),
        currency: text().default('usd').notNull(),
        stripe_charge_id: text(),
        stripe_invoice_id: text(),
        stripe_connected_account_id: text(),
        occurred_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        tax_cents: integer().default(0).notNull(),
        stripe_transfer_id: text(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('template_sales_charge_key')
            .using('btree', table.stripe_charge_id)
            .where(sql`(stripe_charge_id IS NOT NULL)`),
        index('template_sales_creator_occurred_idx').using('btree', table.creator_id, table.occurred_at.desc().nullsFirst()),
        uniqueIndex('template_sales_invoice_key')
            .using('btree', table.stripe_invoice_id)
            .where(sql`(stripe_invoice_id IS NOT NULL)`),
        index('template_sales_template_idx').using('btree', table.template_id),
        index('template_sales_transfer_idx').using('btree', table.stripe_transfer_id),
        foreignKey({
            columns: [table.creator_id],
            foreignColumns: [users.id],
            name: 'template_sales_creator_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.purchase_id],
            foreignColumns: [template_purchases.id],
            name: 'template_sales_purchase_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.template_id],
            foreignColumns: [templates.id],
            name: 'template_sales_template_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'template_sales_workspace_id_fkey',
        }).onDelete('set null'),
        check('template_sales_kind_check', sql`kind = ANY (ARRAY['one_time'::text, 'recurring'::text, 'refund'::text])`),
    ]
)

export const templates = pgTable(
    'templates',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        slug: text().notNull(),
        title: text().notNull(),
        tagline: text().default('').notNull(),
        long_description: text().default('').notNull(),
        category: text().default('other').notNull(),
        tags: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        gallery: jsonb().$type<Json>().default([]).notNull(),
        video_url: text(),
        og_image_url: text(),
        meta_title: text(),
        meta_description: text(),
        setup_minutes: integer().default(5).notNull(),
        featured: boolean().default(false).notNull(),
        status: template_status().default('draft').notNull(),
        published_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        show_in_marketplace: boolean().default(true).notNull(),
        show_in_library: boolean().default(true).notNull(),
        agents: jsonb().$type<Json>().default([]).notNull(),
        connectors: jsonb().$type<Json>().default([]).notNull(),
        agent_count: integer().generatedAlwaysAs(sql`COALESCE(jsonb_array_length(agents), 0)`),
        agent_archives: jsonb().$type<Json>().default([]).notNull(),
        faq: jsonb().$type<Json>().default([]).notNull(),
        creator_id: uuid(),
        submitted_at: timestamptz(),
        review_note: text(),
        pricing_model: template_pricing_model().default('free').notNull(),
        price_amount_cents: integer().default(0).notNull(),
        price_currency: text().default('usd').notNull(),
        stripe_product_id: text(),
        stripe_price_id: text(),
        price_synced_at: timestamptz(),
        card_image_dark_url: text(),
        card_image_light_url: text(),
        story: jsonb().$type<Json>().default([]).notNull(),
        lead_magnet: boolean().default(false).notNull(),
        role_page: jsonb().$type<Json>().default({}).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('templates_category_idx').using('btree', table.category),
        index('templates_creator_id_idx')
            .using('btree', table.creator_id)
            .where(sql`(creator_id IS NOT NULL)`),
        index('templates_featured_idx')
            .using('btree', table.featured)
            .where(sql`featured`),
        index('templates_library_idx')
            .using('btree', table.show_in_library)
            .where(sql`show_in_library`),
        index('templates_marketplace_idx')
            .using('btree', table.show_in_marketplace)
            .where(sql`show_in_marketplace`),
        index('templates_pricing_model_idx')
            .using('btree', table.pricing_model)
            .where(sql`(pricing_model <> 'free'::template_pricing_model)`),
        index('templates_status_idx').using('btree', table.status),
        uniqueIndex('templates_stripe_price_id_key')
            .using('btree', table.stripe_price_id)
            .where(sql`(stripe_price_id IS NOT NULL)`),
        index('templates_tags_idx').using('gin', table.tags),
        foreignKey({
            columns: [table.creator_id],
            foreignColumns: [users.id],
            name: 'templates_creator_id_fkey',
        }).onDelete('set null'),
        unique('templates_slug_key').on(table.slug),
        check('templates_category_check', sql`category = ANY (ARRAY['agencies'::text, 'ecommerce'::text, 'saas'::text, 'sales'::text, 'recruiting'::text, 'real-estate'::text, 'legal'::text, 'creators'::text, 'productivity'::text, 'other'::text])`),
        check('templates_price_coherent', sql`((pricing_model = 'free'::template_pricing_model) AND (price_amount_cents = 0)) OR ((pricing_model <> 'free'::template_pricing_model) AND ((price_amount_cents >= 100) AND (price_amount_cents <= 200000)))`),
        check('templates_price_currency_check', sql`price_currency = 'usd'::text`),
        check('templates_title_length_check', sql`char_length(title) <= 50`),
    ]
)

export const user_presence = pgTable(
    'user_presence',
    {
        user_id: uuid().primaryKey().notNull(),
        last_seen_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'user_presence_user_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const stripe_events = pgTable(
    'stripe_events',
    {
        id: text().primaryKey().notNull(),
        type: text().notNull(),
        connected_account_id: text(),
        claimed_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        processed_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('stripe_events_unprocessed_idx')
            .using('btree', table.claimed_at)
            .where(sql`(processed_at IS NULL)`),
    ]
)

export const published_files = pgTable(
    'published_files',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: integer().notNull(),
        space_id: uuid(),
        agent_id: uuid().notNull(),
        source_path: text().notNull(),
        storage_key: text().notNull(),
        content_type: text().default('application/octet-stream').notNull(),
        size: bigint({ mode: 'number' }).default(0).notNull(),
        public_url: text().notNull(),
        slug: text().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        kind: text().default('file').notNull(),
        files: text().array(),
        access: text().default('workspace').notNull(),
        invited: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        password_hash: text(),
        requested_access: text(),
        access_version: integer().default(1).notNull(),
        title: text(),
        thumbnail_key: text(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('published_files_agent_idx').using('btree', table.agent_id),
        uniqueIndex('published_files_agent_path_key').using('btree', table.agent_id, table.source_path),
        uniqueIndex('published_files_slug_key').using('btree', table.slug),
        index('published_files_workspace_idx').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.agent_id],
            foreignColumns: [agents.id],
            name: 'published_files_agent_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.space_id],
            foreignColumns: [spaces.id],
            name: 'published_files_space_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'published_files_workspace_id_fkey',
        }).onDelete('cascade'),
        check('published_files_access_check', sql`access = ANY (ARRAY['public'::text, 'workspace'::text, 'password'::text, 'invited'::text])`),
        check('published_files_kind_check', sql`kind = ANY (ARRAY['file'::text, 'site'::text])`),
        check('published_files_requested_access_check', sql`requested_access = 'public'::text`),
    ]
)

export const users = pgTable(
    'users',
    {
        id: uuid().primaryKey().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        verified: boolean().default(false).notNull(),
        onboarding_answers: jsonb().$type<Json>(),
        onboarding_completed_at: timestamptz(),
        email_notification_prefs: jsonb().$type<Json>().default({ done: false, info: false, error: false, billing: true, product: true, approval: false, progress: false, question: false }).notNull(),
        account_role: account_role().default('member').notNull(),
        expert_profile_id: uuid(),
        signed_up_at: timestamptz(),
        changelog_seen_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        deleted_at: timestamptz(),
        locale: text(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('users_expert_profile_id_key')
            .using('btree', table.expert_profile_id)
            .where(sql`(expert_profile_id IS NOT NULL)`),
        index('users_onboarding_completed_idx')
            .using('btree', table.onboarding_completed_at)
            .where(sql`(onboarding_completed_at IS NOT NULL)`),
        index('users_signed_up_idx')
            .using('btree', table.signed_up_at)
            .where(sql`(signed_up_at IS NOT NULL)`),
        foreignKey({
            columns: [table.expert_profile_id],
            foreignColumns: [experts.id],
            name: 'users_expert_profile_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.id],
            foreignColumns: [authUsers.id],
            name: 'users_id_fkey',
        })
            .onUpdate('cascade')
            .onDelete('cascade'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'users_workspace_id_fkey',
        })
            .onUpdate('cascade')
            .onDelete('cascade'),
        check('users_locale_format', sql`(locale IS NULL) OR (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'::text)`),
    ]
)

export const whatsapp_messages = pgTable(
    'whatsapp_messages',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        user_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }),
        agent_id: uuid(),
        phone: text().notNull(),
        template_key: text().notNull(),
        language: text().notNull(),
        category: text().notNull(),
        dedupe_key: text(),
        bird_message_id: text(),
        status: text().default('pending').notNull(),
        sent_at: timestamptz(),
        delivered_at: timestamptz(),
        read_at: timestamptz(),
        failed_at: timestamptz(),
        error_code: text(),
        meta_error_code: text(),
        error: text(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('whatsapp_messages_user_recent_idx').using('btree', table.user_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.agent_id],
            foreignColumns: [agents.id],
            name: 'whatsapp_messages_agent_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'whatsapp_messages_user_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'whatsapp_messages_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('whatsapp_messages_dedupe_key_key').on(table.dedupe_key),
        unique('whatsapp_messages_bird_message_id_key').on(table.bird_message_id),
        check('whatsapp_messages_category_check', sql`category = ANY (ARRAY['marketing'::text, 'utility'::text])`),
        check('whatsapp_messages_status_check', sql`status = ANY (ARRAY['pending'::text, 'accepted'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'rejected'::text])`),
    ]
)

export const web_search_events = pgTable(
    'web_search_events',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity({ name: 'web_search_events_id_seq' }),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        engine_agent_id: text(),
        query: text().notNull(),
        outcome: text().notNull(),
        result_count: integer().default(0).notNull(),
        provider_status: integer(),
        duration_ms: integer(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        cached: boolean().default(false).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('web_search_events_created_idx').using('btree', table.created_at.desc().nullsFirst()),
        index('web_search_events_workspace_created_idx').using('btree', table.workspace_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'web_search_events_workspace_id_fkey',
        }).onDelete('cascade'),
        check('web_search_events_outcome_check', sql`outcome = ANY (ARRAY['ok'::text, 'empty'::text, 'error'::text])`),
    ]
)

export const workspace_archives = pgTable(
    'workspace_archives',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        status: workspace_archive_status().default('archiving').notNull(),
        object_key: text().notNull(),
        bytes: bigint({ mode: 'number' }),
        sha256: text(),
        raw_bytes: bigint({ mode: 'number' }),
        data_version: integer(),
        engine_commit: text(),
        source_host_id: uuid(),
        source_host_name: text().notNull(),
        source_box: text().notNull(),
        restored_to_instance_id: uuid(),
        error_message: text(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        archived_at: timestamptz(),
        restored_at: timestamptz(),
        expires_at: timestamptz(),
        reason: workspace_archive_reason().default('access_ended').notNull(),
        reactivation_requested_at: timestamptz(),
        reactivation_request_note: text(),
        reactivation_approved_at: timestamptz(),
        reactivation_rejected_at: timestamptz(),
        reactivation_reviewed_by: uuid(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('workspace_archives_one_job_per_workspace_idx')
            .using('btree', table.workspace_id)
            .where(sql`(status = ANY (ARRAY['archiving'::workspace_archive_status, 'restoring'::workspace_archive_status]))`),
        index('workspace_archives_reactivation_pending_idx')
            .using('btree', table.reactivation_requested_at)
            .where(sql`((reactivation_requested_at IS NOT NULL) AND (reactivation_approved_at IS NULL) AND (reactivation_rejected_at IS NULL))`),
        index('workspace_archives_workspace_idx').using('btree', table.workspace_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.reactivation_reviewed_by],
            foreignColumns: [users.id],
            name: 'workspace_archives_reactivation_reviewed_by_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.restored_to_instance_id],
            foreignColumns: [engine_pool.id],
            name: 'workspace_archives_restored_to_instance_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.source_host_id],
            foreignColumns: [engine_hosts.id],
            name: 'workspace_archives_source_host_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'workspace_archives_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('workspace_archives_object_key_key').on(table.object_key),
    ]
)

export const workspace_onboarding = pgTable(
    'workspace_onboarding',
    {
        workspace_id: bigint({ mode: 'number' }).primaryKey().notNull(),
        answers: jsonb().$type<Json>().default({}).notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        company_findings: jsonb().$type<Json>(),
        agent_ideas: jsonb().$type<Json>(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'workspace_onboarding_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const workspaces = pgTable(
    'workspaces',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity({ name: 'workspaces_id_seq' }),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        name: varchar(),
        plan: varchar().default('pro').notNull(),
        stripe_customer_id: varchar(),
        trial_ends_at: timestamptz(),
        max_agents: integer().default(1),
        max_seats: integer(),
        model_access: text().default('best'),
        custom_integrations: boolean().default(false).notNull(),
        stripe_subscription_id: text(),
        stripe_price_id: text(),
        subscription_status: text(),
        current_period_end: timestamptz(),
        icon_url: text(),
        lumvika_budget_micros: bigint({ mode: 'number' }).default(0).notNull(),
        lumvika_used_micros: bigint({ mode: 'number' }).default(0).notNull(),
        lumvika_period_anchor: timestamptz(),
        is_sandbox: boolean().default(false).notNull(),
        lumvika_topup_micros: bigint({ mode: 'number' }).default(0).notNull(),
        subscription_cancel_at: timestamptz(),
        first_paid_at: timestamptz(),
        boxes_disabled_at: timestamptz(),
        boxes_deleted_at: timestamptz(),
        waitlisted_at: timestamptz(),
        onboarded_at: timestamptz(),
        boxes_archived_at: timestamptz(),
        renewal_reminder_at: timestamptz(),
        renewal_reminder_user_id: uuid(),
        last_active_at: timestamptz(),
        price_arm: text(),
        payment_failed_at: timestamptz(),
        trial_started_at: timestamptz(),
        lumvika_credit_paused_at: timestamptz(),
        publish_policy: text(),
        locale: text().default('en').notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('workspaces_boxes_archived_at_idx')
            .using('btree', table.boxes_archived_at)
            .where(sql`(boxes_archived_at IS NOT NULL)`),
        index('workspaces_is_sandbox_idx')
            .using('btree', table.is_sandbox)
            .where(sql`is_sandbox`),
        index('workspaces_onboarded_at_idx')
            .using('btree', table.onboarded_at)
            .where(sql`(onboarded_at IS NOT NULL)`),
        index('workspaces_renewal_reminder_at_idx')
            .using('btree', table.renewal_reminder_at)
            .where(sql`(renewal_reminder_at IS NOT NULL)`),
        index('workspaces_subscription_cancel_at_idx')
            .using('btree', table.subscription_cancel_at)
            .where(sql`(subscription_cancel_at IS NOT NULL)`),
        index('workspaces_trial_ends_at_idx')
            .using('btree', table.trial_ends_at)
            .where(sql`(trial_ends_at IS NOT NULL)`),
        foreignKey({
            columns: [table.renewal_reminder_user_id],
            foreignColumns: [users.id],
            name: 'workspaces_renewal_reminder_user_id_fkey',
        }).onDelete('set null'),
        check('workspaces_locale_format', sql`locale ~ '^[a-z]{2}(-[A-Z]{2})?$'::text`),
        check('workspaces_lumvika_topup_non_negative', sql`lumvika_topup_micros >= 0`),
        check('workspaces_price_arm_check', sql`price_arm = ANY (ARRAY['29'::text, '49'::text])`),
        check('workspaces_publish_policy_check', sql`publish_policy = ANY (ARRAY['people'::text, 'anyone'::text, 'never'::text])`),
    ]
)

export const web_fetch_events = pgTable(
    'web_fetch_events',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity({ name: 'web_fetch_events_id_seq' }),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        engine_agent_id: text(),
        url: text().notNull(),
        host: text(),
        direct_status: integer(),
        outcome: text().notNull(),
        provider_status: integer(),
        page_status: integer(),
        content_chars: integer().default(0).notNull(),
        duration_ms: integer(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('web_fetch_events_created_idx').using('btree', table.created_at.desc().nullsFirst()),
        index('web_fetch_events_workspace_created_idx').using('btree', table.workspace_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'web_fetch_events_workspace_id_fkey',
        }).onDelete('cascade'),
        check('web_fetch_events_outcome_check', sql`outcome = ANY (ARRAY['ok'::text, 'empty'::text, 'error'::text])`),
    ]
)

export const web_search_cache = pgTable(
    'web_search_cache',
    {
        query_key: text().primaryKey().notNull(),
        results: jsonb().$type<Json>().notNull(),
        fetched_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [index('web_search_cache_fetched_at_idx').using('btree', table.fetched_at)]
)

export const invitation_redemptions = pgTable(
    'invitation_redemptions',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        code_id: uuid().notNull(),
        workspace_id: integer().notNull(),
        user_id: uuid(),
        redeemed_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.code_id],
            foreignColumns: [invitation_codes.id],
            name: 'invitation_redemptions_code_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'invitation_redemptions_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('invitation_redemptions_code_id_workspace_id_key').on(table.code_id, table.workspace_id),
    ]
)

export const notifications = pgTable(
    'notifications',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: integer().notNull(),
        space_id: uuid(),
        agent_id: uuid(),
        engine_agent_id: text(),
        engine_session_id: text(),
        engine_run_id: text(),
        event: text().default('agent.notification').notNull(),
        kind: notification_kind().default('info').notNull(),
        message: text().notNull(),
        metadata: jsonb().$type<Json>(),
        read_at: timestamptz(),
        notified_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        source: session_source(),
        recipients: jsonb().$type<Json>(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('notifications_agent_event_idx')
            .using('btree', table.agent_id, table.event)
            .where(sql`(agent_id IS NOT NULL)`),
        index('notifications_space_idx').using('btree', table.space_id),
        index('notifications_space_unread_idx')
            .using('btree', table.space_id)
            .where(sql`(read_at IS NULL)`),
        index('notifications_workspace_done_idx')
            .using('btree', table.workspace_id, table.created_at.desc().nullsFirst())
            .where(sql`(kind = 'done'::notification_kind)`),
        index('notifications_workspace_idx').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.agent_id],
            foreignColumns: [agents.id],
            name: 'notifications_agent_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.space_id],
            foreignColumns: [spaces.id],
            name: 'notifications_space_id_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'notifications_workspace_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const blog_posts = pgTable(
    'blog_posts',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        slug: text().notNull(),
        title: text().notNull(),
        excerpt: text(),
        category: text().notNull(),
        cover_url: text(),
        author_name: text(),
        author_avatar: text(),
        body_mdx: text().notNull(),
        featured: boolean().default(false).notNull(),
        published: boolean().default(false).notNull(),
        published_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        meta_title: text(),
        meta_description: text(),
        faq: jsonb().$type<Json>().default([]).notNull(),
        related_slugs: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [index('blog_posts_category_idx').using('btree', table.category), index('blog_posts_published_idx').using('btree', table.published, table.published_at.desc().nullsFirst()), unique('blog_posts_slug_key').on(table.slug)]
)

export const changelog_entries = pgTable(
    'changelog_entries',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        slug: text().notNull(),
        title: text().notNull(),
        body_md: text().notNull(),
        image_url: text(),
        image_alt: text(),
        published_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        dialog_image_url: text(),
        image_dark_url: text(),
        dialog_image_dark_url: text(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('changelog_entries_published_idx')
            .using('btree', table.published_at.desc().nullsFirst())
            .where(sql`(published_at IS NOT NULL)`),
        unique('changelog_entries_slug_key').on(table.slug),
    ]
)

export const expert_email_opt_outs = pgTable(
    'expert_email_opt_outs',
    {
        email: text().primaryKey().notNull(),
        expert_id: uuid(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.expert_id],
            foreignColumns: [experts.id],
            name: 'expert_email_opt_outs_expert_id_fkey',
        }).onDelete('set null'),
    ]
)

export const experts = pgTable(
    'experts',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        slug: text().notNull(),
        name: text().notNull(),
        type: expert_type().notNull(),
        location: text(),
        bio: text(),
        budget: text(),
        avatar_url: text(),
        banner_url: text().notNull(),
        skills: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        languages: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        x_url: text(),
        linkedin_url: text(),
        github_url: text(),
        website_url: text(),
        featured: boolean().default(false).notNull(),
        status: expert_status().default('draft').notNull(),
        invited_at: timestamptz(),
        accepted_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        claim_token: text()
            .default(sql`encode(gen_random_bytes(16), 'hex'::text)`)
            .notNull(),
        availability: expert_availability().default('available').notNull(),
        email: text(),
        seo_indexed: boolean().default(true).notNull(),
        timezone: text(),
        invite_scheduled_at: timestamptz(),
        invite_run_id: text(),
        source: expert_source().default('import').notNull(),
        application_status: expert_application_status(),
        application_reviewed_at: timestamptz(),
        application_reviewed_by: uuid(),
        application_note: text(),
        creator_token: text(),
        creator_joined_at: timestamptz(),
        creator_terms_accepted_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('experts_application_status_idx')
            .using('btree', table.application_status)
            .where(sql`(application_status IS NOT NULL)`),
        index('experts_claim_token_idx').using('btree', table.claim_token),
        index('experts_invite_scheduled_at_idx')
            .using('btree', table.invite_scheduled_at)
            .where(sql`(invite_scheduled_at IS NOT NULL)`),
        index('experts_status_idx').using('btree', table.status),
        foreignKey({
            columns: [table.application_reviewed_by],
            foreignColumns: [users.id],
            name: 'experts_application_reviewed_by_fkey',
        }).onDelete('set null'),
        unique('experts_slug_key').on(table.slug),
        unique('experts_claim_token_key').on(table.claim_token),
        unique('experts_creator_token_key').on(table.creator_token),
    ]
)

export const spaces = pgTable(
    'spaces',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: integer().notNull(),
        name: text().default('Untitled Space'),
        col_start: integer().notNull(),
        row_start: integer().notNull(),
        col_end: integer().notNull(),
        row_end: integer().notNull(),
        created_at: timestamptz().default(sql`now()`),
        visibility: text().default('workspace').notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('spaces_id_workspace_id_key').using('btree', table.id, table.workspace_id),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'spaces_workspace_id_fkey',
        }),
        check('spaces_visibility_check', sql`visibility = ANY (ARRAY['workspace'::text, 'restricted'::text])`),
    ]
)

export const notification_push_dispatches = pgTable(
    'notification_push_dispatches',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        user_id: uuid().notNull(),
        source_key: text().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('notification_push_dispatches_user_window_idx').using('btree', table.user_id, table.created_at.desc().nullsFirst()),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [authUsers.id],
            name: 'notification_push_dispatches_user_id_fkey',
        }).onDelete('cascade'),
    ]
)

export const sessions = pgTable(
    'sessions',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        agent_id: uuid().notNull(),
        title: text().default('New conversation').notNull(),
        engine_session_id: text().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        status: session_status().default('idle').notNull(),
        origin_agent_id: uuid(),
        source: session_source().default('builder').notNull(),
        automation_name: text(),
        outcome: session_outcome(),
        kind: session_kind().default('thread').notNull(),
        first_message: text(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('idx_sessions_agent_id').using('btree', table.agent_id),
        uniqueIndex('sessions_general_per_agent_idx')
            .using('btree', table.agent_id)
            .where(sql`(kind = 'general'::session_kind)`),
        index('sessions_origin_agent_idx').using('btree', table.origin_agent_id),
        foreignKey({
            columns: [table.agent_id],
            foreignColumns: [agents.id],
            name: 'sessions_agent_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.origin_agent_id],
            foreignColumns: [agents.id],
            name: 'sessions_origin_agent_id_fkey',
        }).onDelete('set null'),
        unique('sessions_hermes_conversation_key').on(table.engine_session_id),
    ]
)

export const workspace_invitations = pgTable(
    'workspace_invitations',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        email: text().notNull(),
        token: text().notNull(),
        invited_by: uuid(),
        status: text().default('pending').notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        expires_at: timestamptz().notNull(),
        accepted_at: timestamptz(),
        box_scope: text().default('all').notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('workspace_invitations_pending_uniq')
            .using('btree', sql`workspace_id`, sql`lower(email)`)
            .where(sql`(status = 'pending'::text)`),
        foreignKey({
            columns: [table.invited_by],
            foreignColumns: [users.id],
            name: 'workspace_invitations_invited_by_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'workspace_invitations_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('workspace_invitations_token_key').on(table.token),
        check('workspace_invitations_box_scope_check', sql`box_scope = ANY (ARRAY['all'::text, 'assigned'::text])`),
    ]
)

export const workspace_rewinds = pgTable(
    'workspace_rewinds',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        week_start: date().notNull(),
        payload: jsonb().$type<Json>().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('workspace_rewinds_recent_idx').using('btree', table.workspace_id, table.week_start.desc().nullsFirst()),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'workspace_rewinds_workspace_id_fkey',
        }).onDelete('cascade'),
        unique('workspace_rewinds_workspace_id_week_start_key').on(table.workspace_id, table.week_start),
    ]
)

export const session_participants = pgTable(
    'session_participants',
    {
        session_id: uuid().notNull(),
        user_id: uuid().notNull(),
        last_message_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('session_participants_user_idx').using('btree', table.user_id),
        foreignKey({
            columns: [table.session_id],
            foreignColumns: [sessions.id],
            name: 'session_participants_session_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'session_participants_user_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.session_id, table.user_id], name: 'session_participants_pkey' }),
    ]
)

export const session_reads = pgTable(
    'session_reads',
    {
        session_id: uuid().notNull(),
        user_id: uuid().notNull(),
        seen_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('session_reads_user_idx').using('btree', table.user_id),
        foreignKey({
            columns: [table.session_id],
            foreignColumns: [sessions.id],
            name: 'session_reads_session_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'session_reads_user_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.session_id, table.user_id], name: 'session_reads_pkey' }),
    ]
)

export const workspace_rewind_views = pgTable(
    'workspace_rewind_views',
    {
        rewind_id: uuid().notNull(),
        user_id: uuid().notNull(),
        viewed_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.rewind_id],
            foreignColumns: [workspace_rewinds.id],
            name: 'workspace_rewind_views_rewind_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'workspace_rewind_views_user_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.rewind_id, table.user_id], name: 'workspace_rewind_views_pkey' }),
    ]
)

export const notification_incidents = pgTable(
    'notification_incidents',
    {
        user_id: uuid().notNull(),
        source_key: text().notNull(),
        opened_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        resolved_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('notification_incidents_open_source_idx')
            .using('btree', table.source_key)
            .where(sql`(resolved_at IS NULL)`),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'notification_incidents_user_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.user_id, table.source_key], name: 'notification_incidents_pkey' }),
    ]
)

export const workspace_getting_started = pgTable(
    'workspace_getting_started',
    {
        workspace_id: bigint({ mode: 'number' }).notNull(),
        item: text().notNull(),
        done_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        reported_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'workspace_getting_started_workspace_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.workspace_id, table.item], name: 'workspace_getting_started_pkey' }),
        check('workspace_getting_started_item_check', sql`item = ANY (ARRAY['first_agent'::text, 'ai_provider'::text, 'invite'::text, 'schedule'::text, 'payment_method'::text, 'reward'::text, 'dismissed'::text])`),
    ]
)

export const app_usage_counters = pgTable(
    'app_usage_counters',
    {
        scope: text().notNull(),
        action: text().notNull(),
        period: text().notNull(),
        count: integer().default(0).notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [primaryKey({ columns: [table.scope, table.action, table.period], name: 'app_usage_counters_pkey' })]
)

export const workspace_members = pgTable(
    'workspace_members',
    {
        user_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        role: workspace_role().default('admin').notNull(),
        box_scope: text().default('all').notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('workspace_members_workspace_id_idx').using('btree', table.workspace_id),
        index('workspace_members_workspace_role_idx').using('btree', table.workspace_id, table.role),
        foreignKey({
            columns: [table.user_id],
            foreignColumns: [users.id],
            name: 'workspace_members_user_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'workspace_members_workspace_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.user_id, table.workspace_id], name: 'workspace_members_pkey' }),
        check('workspace_members_box_scope_check', sql`box_scope = ANY (ARRAY['all'::text, 'assigned'::text])`),
    ]
)

export const space_members = pgTable(
    'space_members',
    {
        space_id: uuid().notNull(),
        user_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        access: text().notNull(),
        granted_by: uuid(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('space_members_user_idx').using('btree', table.user_id, table.workspace_id),
        index('space_members_workspace_idx').using('btree', table.workspace_id),
        foreignKey({
            columns: [table.granted_by],
            foreignColumns: [users.id],
            name: 'space_members_granted_by_fkey',
        }).onDelete('set null'),
        foreignKey({
            columns: [table.space_id, table.workspace_id],
            foreignColumns: [spaces.id, spaces.workspace_id],
            name: 'space_members_space_id_workspace_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.user_id, table.workspace_id],
            foreignColumns: [workspace_members.user_id, workspace_members.workspace_id],
            name: 'space_members_user_id_workspace_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.space_id, table.user_id], name: 'space_members_pkey' }),
        check('space_members_access_check', sql`access = ANY (ARRAY['use'::text, 'manage'::text])`),
    ]
)

export const service_alternatives = pgTable(
    'service_alternatives',
    {
        service_slug: text().notNull(),
        alternative_slug: text().notNull(),
        probability: real().notNull(),
        confidence: real().notNull(),
        model: text().notNull(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('service_alternatives_alternative_slug_idx').using('btree', table.alternative_slug),
        foreignKey({
            columns: [table.alternative_slug],
            foreignColumns: [services.slug],
            name: 'service_alternatives_alternative_slug_fkey',
        })
            .onUpdate('cascade')
            .onDelete('cascade'),
        foreignKey({
            columns: [table.service_slug],
            foreignColumns: [services.slug],
            name: 'service_alternatives_service_slug_fkey',
        })
            .onUpdate('cascade')
            .onDelete('cascade'),
        primaryKey({ columns: [table.service_slug, table.alternative_slug], name: 'service_alternatives_pkey' }),
        check('service_alternatives_check', sql`service_slug <> alternative_slug`),
        check('service_alternatives_confidence_check', sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision)`),
        check('service_alternatives_probability_check', sql`(probability >= (0)::double precision) AND (probability <= (1)::double precision)`),
    ]
)

export const app_connection_agents = pgTable(
    'app_connection_agents',
    {
        agent_id: uuid().notNull(),
        app_slug: text().notNull(),
        connection_id: uuid().notNull(),
        wake_on_events: text()
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        trigger_slug: text(),
        trigger_token: text(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('app_connection_agents_connection_idx').using('btree', table.connection_id),
        foreignKey({
            columns: [table.agent_id],
            foreignColumns: [agents.id],
            name: 'app_connection_agents_agent_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.connection_id],
            foreignColumns: [app_connections.id],
            name: 'app_connection_agents_connection_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.agent_id, table.app_slug], name: 'app_connection_agents_pkey' }),
    ]
)

export const engine_box_metrics = pgTable(
    'engine_box_metrics',
    {
        host_id: uuid().notNull(),
        box_name: text().notNull(),
        sampled_at: timestamptz().notNull(),
        running: boolean().notNull(),
        rss_mb: integer(),
        cpu_cores: real(),
        active_runs: smallint(),
        engine_ok: boolean().notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('engine_box_metrics_host_sampled_idx').using('btree', table.host_id, table.sampled_at),
        foreignKey({
            columns: [table.host_id],
            foreignColumns: [engine_hosts.id],
            name: 'engine_box_metrics_host_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.host_id, table.box_name, table.sampled_at], name: 'engine_box_metrics_pkey' }),
    ]
)

export const workspace_apps = pgTable(
    'workspace_apps',
    {
        workspace_id: bigint({ mode: 'number' }).notNull(),
        app_slug: text().notNull(),
        status: text().default('active').notNull(),
        slots: integer().default(0).notNull(),
        trial_ends_at: timestamptz(),
        trial_reminder_sent_at: timestamptz(),
        trial_settled_at: timestamptz(),
        frozen_at: timestamptz(),
        created_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
        updated_at: timestamptz()
            .default(sql`now()`)
            .notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.workspace_id],
            foreignColumns: [workspaces.id],
            name: 'workspace_apps_workspace_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.workspace_id, table.app_slug], name: 'workspace_apps_pkey' }),
        check('workspace_apps_slots_check', sql`slots >= 0`),
        check('workspace_apps_status_check', sql`status = ANY (ARRAY['active'::text, 'frozen'::text, 'uninstalled'::text])`),
    ]
)

export const engine_host_metrics = pgTable(
    'engine_host_metrics',
    {
        host_id: uuid().notNull(),
        sampled_at: timestamptz().notNull(),
        cpu_pct: real(),
        load1: real().notNull(),
        load5: real().notNull(),
        load15: real().notNull(),
        cores: smallint().notNull(),
        mem_total_mb: integer().notNull(),
        mem_available_mb: integer().notNull(),
        arc_mb: integer(),
        swap_total_mb: integer().notNull(),
        swap_used_mb: integer().notNull(),
        psi_cpu: real(),
        psi_mem: real(),
        psi_io: real(),
        disk_total_gb: real(),
        disk_used_gb: real(),
        net_rx_bps: bigint({ mode: 'number' }),
        net_tx_bps: bigint({ mode: 'number' }),
        boxes_running: smallint().notNull(),
        boxes_total: smallint().notNull(),
        active_runs: smallint().notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({
            columns: [table.host_id],
            foreignColumns: [engine_hosts.id],
            name: 'engine_host_metrics_host_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.host_id, table.sampled_at], name: 'engine_host_metrics_pkey' }),
    ]
)

export const teams = pgTable(
    'teams',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        name: text().notNull(),
        description: text(),
        color: text(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        uniqueIndex('teams_workspace_name_key').using('btree', sql`workspace_id`, sql`lower(name)`),
        unique('teams_id_workspace_id_key').on(table.id, table.workspace_id),
        foreignKey({ columns: [table.workspace_id], foreignColumns: [workspaces.id], name: 'teams_workspace_id_fkey' }).onDelete('cascade'),
        check('teams_name_check', sql`(char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)`),
        check('teams_description_check', sql`(description IS NULL) OR (char_length(description) <= 2000)`),
        check('teams_color_check', sql`(color IS NULL) OR (color ~ '^#[0-9a-fA-F]{6}$'::text)`),
    ]
)

export const team_members = pgTable(
    'team_members',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        team_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        user_id: uuid(),
        agent_id: uuid(),
        role: team_member_role().default('member').notNull(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('team_members_agent_idx').using('btree', table.agent_id).where(sql`(agent_id IS NOT NULL)`),
        uniqueIndex('team_members_team_agent_key').using('btree', table.team_id, table.agent_id).where(sql`(agent_id IS NOT NULL)`),
        uniqueIndex('team_members_team_user_key').using('btree', table.team_id, table.user_id).where(sql`(user_id IS NOT NULL)`),
        index('team_members_user_idx').using('btree', table.user_id, table.workspace_id).where(sql`(user_id IS NOT NULL)`),
        index('team_members_workspace_idx').using('btree', table.workspace_id),
        foreignKey({ columns: [table.agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'team_members_agent_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.team_id, table.workspace_id], foreignColumns: [teams.id, teams.workspace_id], name: 'team_members_team_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.user_id, table.workspace_id], foreignColumns: [workspace_members.user_id, workspace_members.workspace_id], name: 'team_members_user_id_workspace_id_fkey' }).onDelete('cascade'),
        check('team_members_check', sql`num_nonnulls(user_id, agent_id) = 1`),
    ]
)

export const goals = pgTable(
    'goals',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        parent_goal_id: uuid(),
        team_id: uuid(),
        title: text().notNull(),
        description: text(),
        status: goal_status().default('planned').notNull(),
        owner_user_id: uuid(),
        target_date: date(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('goals_parent_idx').using('btree', table.parent_goal_id).where(sql`(parent_goal_id IS NOT NULL)`),
        index('goals_team_idx').using('btree', table.team_id).where(sql`(team_id IS NOT NULL)`),
        index('goals_workspace_idx').using('btree', table.workspace_id, table.status),
        unique('goals_id_workspace_id_key').on(table.id, table.workspace_id),
        foreignKey({ columns: [table.owner_user_id, table.workspace_id], foreignColumns: [workspace_members.user_id, workspace_members.workspace_id], name: 'goals_owner_user_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.parent_goal_id, table.workspace_id], foreignColumns: [table.id, table.workspace_id], name: 'goals_parent_goal_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.team_id, table.workspace_id], foreignColumns: [teams.id, teams.workspace_id], name: 'goals_team_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.workspace_id], foreignColumns: [workspaces.id], name: 'goals_workspace_id_fkey' }).onDelete('cascade'),
        check('goals_title_check', sql`(char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200)`),
        check('goals_description_check', sql`(description IS NULL) OR (char_length(description) <= 20000)`),
        check('goals_check', sql`(parent_goal_id IS NULL) OR (parent_goal_id <> id)`),
    ]
)

export const projects = pgTable(
    'projects',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        key: text().notNull(),
        name: text().notNull(),
        description: text(),
        instructions: text(),
        status: project_status().default('active').notNull(),
        visibility: text().default('workspace').notNull(),
        team_id: uuid(),
        goal_id: uuid(),
        lead_user_id: uuid(),
        lead_agent_id: uuid(),
        monthly_budget_micros: bigint({ mode: 'number' }),
        target_date: date(),
        created_by: uuid(),
        archived_at: timestamptz(),
        issue_counter: integer().default(0).notNull(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('projects_goal_idx').using('btree', table.goal_id).where(sql`(goal_id IS NOT NULL)`),
        index('projects_team_idx').using('btree', table.team_id).where(sql`(team_id IS NOT NULL)`),
        index('projects_workspace_idx').using('btree', table.workspace_id, table.status),
        unique('projects_id_workspace_id_key').on(table.id, table.workspace_id),
        unique('projects_workspace_id_key_key').on(table.workspace_id, table.key),
        foreignKey({ columns: [table.created_by], foreignColumns: [users.id], name: 'projects_created_by_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.goal_id, table.workspace_id], foreignColumns: [goals.id, goals.workspace_id], name: 'projects_goal_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.lead_agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'projects_lead_agent_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.lead_user_id, table.workspace_id], foreignColumns: [workspace_members.user_id, workspace_members.workspace_id], name: 'projects_lead_user_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.team_id, table.workspace_id], foreignColumns: [teams.id, teams.workspace_id], name: 'projects_team_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.workspace_id], foreignColumns: [workspaces.id], name: 'projects_workspace_id_fkey' }).onDelete('cascade'),
        check('projects_key_check', sql`key ~ '^[A-Z][A-Z0-9]{1,5}$'::text`),
        check('projects_name_check', sql`(char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120)`),
        check('projects_description_check', sql`(description IS NULL) OR (char_length(description) <= 20000)`),
        check('projects_instructions_check', sql`(instructions IS NULL) OR (char_length(instructions) <= 50000)`),
        check('projects_visibility_check', sql`visibility = ANY (ARRAY['workspace'::text, 'restricted'::text])`),
        check('projects_monthly_budget_micros_check', sql`(monthly_budget_micros IS NULL) OR (monthly_budget_micros >= 0)`),
        check('projects_check', sql`num_nonnulls(lead_user_id, lead_agent_id) <= 1`),
    ]
)

export const project_members = pgTable(
    'project_members',
    {
        project_id: uuid().notNull(),
        user_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        access: text().notNull(),
        granted_by: uuid(),
        created_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('project_members_user_idx').using('btree', table.user_id, table.workspace_id),
        index('project_members_workspace_idx').using('btree', table.workspace_id),
        primaryKey({ columns: [table.project_id, table.user_id], name: 'project_members_pkey'}),
        foreignKey({ columns: [table.granted_by], foreignColumns: [users.id], name: 'project_members_granted_by_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.project_id, table.workspace_id], foreignColumns: [projects.id, projects.workspace_id], name: 'project_members_project_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.user_id, table.workspace_id], foreignColumns: [workspace_members.user_id, workspace_members.workspace_id], name: 'project_members_user_id_workspace_id_fkey' }).onDelete('cascade'),
        check('project_members_access_check', sql`access = ANY (ARRAY['use'::text, 'manage'::text])`),
    ]
)

export const issues = pgTable(
    'issues',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        project_id: uuid().notNull(),
        number: integer().default(0).notNull(),
        title: text().notNull(),
        description: text(),
        status: issue_status().default('backlog').notNull(),
        priority: issue_priority().default('none').notNull(),
        assignee_user_id: uuid(),
        assignee_agent_id: uuid(),
        created_by_user_id: uuid(),
        created_by_agent_id: uuid(),
        parent_issue_id: uuid(),
        goal_id: uuid(),
        due_date: date(),
        position: doublePrecision().default(0).notNull(),
        blocked_reason: text(),
        checkout_run_id: text(),
        checked_out_at: timestamptz(),
        session_id: uuid(),
        started_at: timestamptz(),
        completed_at: timestamptz(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('issues_assignee_agent_idx').using('btree', table.assignee_agent_id, table.status).where(sql`(assignee_agent_id IS NOT NULL)`),
        index('issues_assignee_user_idx').using('btree', table.assignee_user_id, table.status).where(sql`(assignee_user_id IS NOT NULL)`),
        index('issues_board_idx').using('btree', table.project_id, table.status, table.position),
        index('issues_checkout_idx').using('btree', table.checkout_run_id).where(sql`(checkout_run_id IS NOT NULL)`),
        index('issues_goal_idx').using('btree', table.goal_id).where(sql`(goal_id IS NOT NULL)`),
        index('issues_parent_idx').using('btree', table.parent_issue_id).where(sql`(parent_issue_id IS NOT NULL)`),
        index('issues_session_idx').using('btree', table.session_id).where(sql`(session_id IS NOT NULL)`),
        index('issues_workspace_updated_idx').using('btree', table.workspace_id, table.updated_at.desc().nullsFirst()),
        unique('issues_id_workspace_id_key').on(table.id, table.workspace_id),
        unique('issues_project_id_number_key').on(table.project_id, table.number),
        foreignKey({ columns: [table.assignee_agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'issues_assignee_agent_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.assignee_user_id, table.workspace_id], foreignColumns: [workspace_members.user_id, workspace_members.workspace_id], name: 'issues_assignee_user_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.created_by_agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'issues_created_by_agent_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.created_by_user_id], foreignColumns: [users.id], name: 'issues_created_by_user_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.goal_id, table.workspace_id], foreignColumns: [goals.id, goals.workspace_id], name: 'issues_goal_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.parent_issue_id, table.workspace_id], foreignColumns: [table.id, table.workspace_id], name: 'issues_parent_issue_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.project_id, table.workspace_id], foreignColumns: [projects.id, projects.workspace_id], name: 'issues_project_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.session_id], foreignColumns: [sessions.id], name: 'issues_session_id_fkey' }).onDelete('set null'),
        check('issues_title_check', sql`(char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 300)`),
        check('issues_description_check', sql`(description IS NULL) OR (char_length(description) <= 100000)`),
        check('issues_blocked_reason_check', sql`(blocked_reason IS NULL) OR (char_length(blocked_reason) <= 2000)`),
        check('issues_check', sql`num_nonnulls(assignee_user_id, assignee_agent_id) <= 1`),
        check('issues_check1', sql`num_nonnulls(created_by_user_id, created_by_agent_id) <= 1`),
        check('issues_check2', sql`(checkout_run_id IS NULL) = (checked_out_at IS NULL)`),
        check('issues_check3', sql`(parent_issue_id IS NULL) OR (parent_issue_id <> id)`),
    ]
)

export const issue_comments = pgTable(
    'issue_comments',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        issue_id: uuid().notNull(),
        author_user_id: uuid(),
        author_agent_id: uuid(),
        body: text().notNull(),
        edited_at: timestamptz(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('issue_comments_issue_idx').using('btree', table.issue_id, table.created_at),
        index('issue_comments_workspace_idx').using('btree', table.workspace_id),
        foreignKey({ columns: [table.author_agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'issue_comments_author_agent_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.author_user_id], foreignColumns: [users.id], name: 'issue_comments_author_user_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.issue_id, table.workspace_id], foreignColumns: [issues.id, issues.workspace_id], name: 'issue_comments_issue_id_workspace_id_fkey' }).onDelete('cascade'),
        check('issue_comments_body_check', sql`(char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 50000)`),
        check('issue_comments_check', sql`num_nonnulls(author_user_id, author_agent_id) <= 1`),
    ]
)

export const activity_events = pgTable(
    'activity_events',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        project_id: uuid(),
        issue_id: uuid(),
        entity_type: text().notNull(),
        entity_id: uuid().notNull(),
        action: text().notNull(),
        actor_user_id: uuid(),
        actor_agent_id: uuid(),
        metadata: jsonb().$type<Json>().default({}).notNull(),
        created_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('activity_events_actor_agent_idx').using('btree', table.actor_agent_id, table.created_at.desc().nullsFirst()).where(sql`(actor_agent_id IS NOT NULL)`),
        index('activity_events_entity_idx').using('btree', table.entity_type, table.entity_id, table.created_at.desc().nullsFirst()),
        index('activity_events_issue_idx').using('btree', table.issue_id, table.created_at.desc().nullsFirst()).where(sql`(issue_id IS NOT NULL)`),
        index('activity_events_project_idx').using('btree', table.project_id, table.created_at.desc().nullsFirst()).where(sql`(project_id IS NOT NULL)`),
        uniqueIndex('activity_events_run_failed_once').using('btree', sql`workspace_id`, sql`((metadata ->> 'runId'::text))`).where(sql`(action = 'issue.run_failed'::text)`),
        index('activity_events_workspace_idx').using('btree', table.workspace_id, table.created_at.desc().nullsFirst()),
        foreignKey({ columns: [table.issue_id, table.workspace_id], foreignColumns: [issues.id, issues.workspace_id], name: 'activity_events_issue_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.project_id, table.workspace_id], foreignColumns: [projects.id, projects.workspace_id], name: 'activity_events_project_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.workspace_id], foreignColumns: [workspaces.id], name: 'activity_events_workspace_id_fkey' }).onDelete('cascade'),
        check('activity_events_entity_type_check', sql`entity_type ~ '^[a-z_]{1,40}$'::text`),
        check('activity_events_action_check', sql`action ~ '^[a-z_]{1,40}\\.[a-z_]{1,40}$'::text`),
        check('activity_events_check', sql`num_nonnulls(actor_user_id, actor_agent_id) <= 1`),
    ]
)

export const channels = pgTable(
    'channels',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        name: text().notNull(),
        description: text(),
        kind: channel_kind().default('public').notNull(),
        project_id: uuid(),
        team_id: uuid(),
        created_by: uuid(),
        archived_at: timestamptz(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('channels_project_idx').using('btree', table.project_id).where(sql`(project_id IS NOT NULL)`),
        index('channels_team_idx').using('btree', table.team_id).where(sql`(team_id IS NOT NULL)`),
        index('channels_workspace_idx').using('btree', table.workspace_id, table.kind),
        uniqueIndex('channels_workspace_name_key').using('btree', sql`workspace_id`, sql`lower(name)`).where(sql`((kind <> 'dm'::channel_kind) AND (archived_at IS NULL))`),
        unique('channels_id_workspace_id_key').on(table.id, table.workspace_id),
        foreignKey({ columns: [table.created_by], foreignColumns: [users.id], name: 'channels_created_by_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.project_id, table.workspace_id], foreignColumns: [projects.id, projects.workspace_id], name: 'channels_project_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.team_id, table.workspace_id], foreignColumns: [teams.id, teams.workspace_id], name: 'channels_team_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.workspace_id], foreignColumns: [workspaces.id], name: 'channels_workspace_id_fkey' }).onDelete('cascade'),
        check('channels_name_check', sql`char_length(name) <= 80`),
        check('channels_description_check', sql`(description IS NULL) OR (char_length(description) <= 2000)`),
        check('channels_check', sql`(kind = 'dm'::channel_kind) OR (char_length(btrim(name)) >= 1)`),
    ]
)

export const channel_members = pgTable(
    'channel_members',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        channel_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        user_id: uuid(),
        agent_id: uuid(),
        last_read_at: timestamptz(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('channel_members_agent_idx').using('btree', table.agent_id).where(sql`(agent_id IS NOT NULL)`),
        uniqueIndex('channel_members_channel_agent_key').using('btree', table.channel_id, table.agent_id).where(sql`(agent_id IS NOT NULL)`),
        uniqueIndex('channel_members_channel_user_key').using('btree', table.channel_id, table.user_id).where(sql`(user_id IS NOT NULL)`),
        index('channel_members_user_idx').using('btree', table.user_id, table.workspace_id).where(sql`(user_id IS NOT NULL)`),
        foreignKey({ columns: [table.agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'channel_members_agent_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.channel_id, table.workspace_id], foreignColumns: [channels.id, channels.workspace_id], name: 'channel_members_channel_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.user_id, table.workspace_id], foreignColumns: [workspace_members.user_id, workspace_members.workspace_id], name: 'channel_members_user_id_workspace_id_fkey' }).onDelete('cascade'),
        check('channel_members_check', sql`num_nonnulls(user_id, agent_id) = 1`),
    ]
)

export const channel_messages = pgTable(
    'channel_messages',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        channel_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        author_user_id: uuid(),
        author_agent_id: uuid(),
        body: text().notNull(),
        parent_message_id: uuid(),
        mentions: jsonb().$type<Json>().default([]).notNull(),
        edited_at: timestamptz(),
        deleted_at: timestamptz(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('channel_messages_channel_idx').using('btree', table.channel_id, table.created_at.desc().nullsFirst()),
        index('channel_messages_parent_idx').using('btree', table.parent_message_id, table.created_at).where(sql`(parent_message_id IS NOT NULL)`),
        index('channel_messages_workspace_idx').using('btree', table.workspace_id),
        unique('channel_messages_id_channel_id_key').on(table.id, table.channel_id),
        foreignKey({ columns: [table.author_agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'channel_messages_author_agent_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.author_user_id], foreignColumns: [users.id], name: 'channel_messages_author_user_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.channel_id, table.workspace_id], foreignColumns: [channels.id, channels.workspace_id], name: 'channel_messages_channel_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.parent_message_id, table.channel_id], foreignColumns: [table.id, table.channel_id], name: 'channel_messages_parent_message_id_channel_id_fkey' }).onDelete('cascade'),
        check('channel_messages_body_check', sql`char_length(body) <= 40000`),
        check('channel_messages_mentions_check', sql`jsonb_typeof(mentions) = 'array'::text`),
        check('channel_messages_check', sql`num_nonnulls(author_user_id, author_agent_id) <= 1`),
        check('channel_messages_check1', sql`(parent_message_id IS NULL) OR (parent_message_id <> id)`),
    ]
)

export const channel_agent_turns = pgTable(
    'channel_agent_turns',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        channel_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        agent_id: uuid().notNull(),
        thread_message_id: uuid().notNull(),
        trigger_message_id: uuid().notNull(),
        requested_by: uuid(),
        status: text().default('answering').notNull(),
        failure: text(),
        engine_run_id: text(),
        reply_message_id: uuid(),
        finished_at: timestamptz(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('channel_agent_turns_channel_idx').using('btree', table.channel_id, table.created_at.desc().nullsFirst()),
        uniqueIndex('channel_agent_turns_in_flight_key').using('btree', table.agent_id, table.thread_message_id).where(sql`(status = 'answering'::text)`),
        index('channel_agent_turns_run_idx').using('btree', table.workspace_id, table.engine_run_id).where(sql`(engine_run_id IS NOT NULL)`),
        foreignKey({ columns: [table.agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'channel_agent_turns_agent_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.channel_id, table.workspace_id], foreignColumns: [channels.id, channels.workspace_id], name: 'channel_agent_turns_channel_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.requested_by], foreignColumns: [users.id], name: 'channel_agent_turns_requested_by_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.thread_message_id, table.channel_id], foreignColumns: [channel_messages.id, channel_messages.channel_id], name: 'channel_agent_turns_thread_message_id_channel_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.trigger_message_id, table.channel_id], foreignColumns: [channel_messages.id, channel_messages.channel_id], name: 'channel_agent_turns_trigger_message_id_channel_id_fkey' }).onDelete('cascade'),
        check('channel_agent_turns_status_check', sql`status = ANY (ARRAY['answering'::text, 'answered'::text, 'failed'::text])`),
        check('channel_agent_turns_failure_check', sql`(failure IS NULL) OR (failure = ANY (ARRAY['engine_unreachable'::text, 'engine_outdated'::text, 'coworker_disabled'::text, 'no_model'::text, 'no_access'::text, 'not_member'::text, 'timeout'::text, 'failed'::text, 'needs_input'::text, 'cancelled'::text]))`),
    ]
)

export const channel_agent_sessions = pgTable(
    'channel_agent_sessions',
    {
        channel_id: uuid().notNull(),
        agent_id: uuid().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        engine_session_id: text().notNull(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        primaryKey({ columns: [table.channel_id, table.agent_id], name: 'channel_agent_sessions_pkey'}),
        foreignKey({ columns: [table.agent_id, table.workspace_id], foreignColumns: [agents.id, agents.workspace_id], name: 'channel_agent_sessions_agent_id_workspace_id_fkey' }).onDelete('cascade'),
        foreignKey({ columns: [table.channel_id, table.workspace_id], foreignColumns: [channels.id, channels.workspace_id], name: 'channel_agent_sessions_channel_id_workspace_id_fkey' }).onDelete('cascade'),
    ]
)

export const assistant_chats = pgTable(
    'assistant_chats',
    {
        id: uuid().defaultRandom().primaryKey().notNull(),
        workspace_id: bigint({ mode: 'number' }).notNull(),
        user_id: uuid().notNull(),
        project_id: uuid(),
        title: text().default('New chat').notNull(),
        engine_session_id: text(),
        model: text(),
        shared: boolean().default(false).notNull(),
        last_message_at: timestamptz(),
        archived_at: timestamptz(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
        stop_requested_at: timestamptz(),
    },
    (table): PgTableExtraConfigValue[] => [
        index('assistant_chats_owner_idx').using('btree', table.user_id, table.workspace_id, table.last_message_at.desc()),
        index('assistant_chats_project_idx').using('btree', table.project_id).where(sql`(project_id IS NOT NULL)`),
        index('assistant_chats_shared_idx').using('btree', table.workspace_id, table.last_message_at.desc()).where(sql`shared`),
        unique('assistant_chats_engine_session_id_key').on(table.engine_session_id),
        foreignKey({ columns: [table.project_id, table.workspace_id], foreignColumns: [projects.id, projects.workspace_id], name: 'assistant_chats_project_id_workspace_id_fkey' }).onDelete('set null'),
        foreignKey({ columns: [table.user_id, table.workspace_id], foreignColumns: [workspace_members.user_id, workspace_members.workspace_id], name: 'assistant_chats_user_id_workspace_id_fkey' }).onDelete('cascade'),
        check('assistant_chats_title_check', sql`char_length(title) <= 200`),
        check('assistant_chats_model_check', sql`(model IS NULL) OR (char_length(model) <= 200)`),
    ]
)

// Settings of the install itself, one row per key, read and written only by the server
// (serviceScope) after its own admin check: `anon` and `authenticated` have no grant on it.
export const instance_settings = pgTable(
    'instance_settings',
    {
        key: text().primaryKey().notNull(),
        value: text().notNull(),
        updated_by: uuid(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({ columns: [table.updated_by], foreignColumns: [authUsers.id], name: 'instance_settings_updated_by_fkey' }).onDelete('set null'),
        check('instance_settings_key_check', sql`char_length(key) <= 100`),
    ]
)

// The Composio auth config an install uses for a toolkit. Kept out of `services.manifest`, which a
// reseed of the catalog overwrites; when a row is here, it wins over the id the manifest carries.
export const composio_auth_configs = pgTable(
    'composio_auth_configs',
    {
        toolkit: text().primaryKey().notNull(),
        auth_config_id: text().notNull(),
        updated_by: uuid(),
        created_at: timestamptz().default(sql`now()`).notNull(),
        updated_at: timestamptz().default(sql`now()`).notNull(),
    },
    (table): PgTableExtraConfigValue[] => [
        foreignKey({ columns: [table.updated_by], foreignColumns: [authUsers.id], name: 'composio_auth_configs_updated_by_fkey' }).onDelete('set null'),
        check('composio_auth_configs_toolkit_check', sql`char_length(toolkit) <= 100`),
        check('composio_auth_configs_auth_config_id_check', sql`char_length(auth_config_id) BETWEEN 1 AND 200`),
    ]
)
