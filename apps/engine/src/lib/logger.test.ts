process.env.RERUN_LOG_LEVEL = 'error'

const { describe, expect, it } = await import('vitest')
const { logger } = await import('./logger.js')

describe('logger', () => {
    it('uses the level from the environment', () => {
        expect(logger.level).toBe('error')
        expect(logger.isLevelEnabled('warn')).toBe(false)
        expect(logger.isLevelEnabled('error')).toBe(true)
    })
})
