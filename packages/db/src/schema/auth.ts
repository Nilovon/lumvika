import { bigint, boolean, index, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Better Auth's tables, shaped as its drizzle adapter reads them: camelCase fields on snake_case
// columns, dates as `Date`. `public.users` holds Lumvika's side of a person and shares the id of `auth.users`.
export const authSchema = pgSchema('auth')

export const authUsers = authSchema.table('users', {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique('users_email_unique'),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authSessions = authSchema.table(
    'sessions',
    {
        id: uuid('id').primaryKey(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        token: text('token').notNull().unique('sessions_token_unique'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: uuid('user_id')
            .notNull()
            .references(() => authUsers.id, { onDelete: 'cascade' }),
    },
    table => [index('sessions_user_id_idx').on(table.userId)]
)

export const authAccounts = authSchema.table(
    'accounts',
    {
        id: uuid('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: uuid('user_id')
            .notNull()
            .references(() => authUsers.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
        refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
        scope: text('scope'),
        password: text('password'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('accounts_user_id_idx').on(table.userId)]
)

export const authVerifications = authSchema.table(
    'verifications',
    {
        id: uuid('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('verifications_identifier_idx').on(table.identifier)]
)

export const authRateLimits = authSchema.table('rate_limits', {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique('rate_limits_key_unique'),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})
