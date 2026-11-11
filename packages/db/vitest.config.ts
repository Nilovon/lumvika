import { defineConfig } from 'vitest/config'

import { testDatabaseUrl } from './src/testing/database'

export default defineConfig({
    test: {
        globalSetup: ['./src/testing/global-setup.ts'],
        env: { DATABASE_URL: testDatabaseUrl() },
        fileParallelism: false,
    },
})
