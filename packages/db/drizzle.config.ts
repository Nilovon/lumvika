import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/schema/index.ts',
    out: './migrations',
    schemaFilter: ['public', 'auth'],
    dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://lumvika:lumvika@127.0.0.1:54432/lumvika' },
    migrations: { schema: 'drizzle', table: 'migrations' },
})
