import { describe, expect, it } from 'vitest'
import './process-report.js'

describe('process-report', () => {
    it('stops diagnostic reports from resolving network sockets', () => {
        expect((process.report as { excludeNetwork?: boolean }).excludeNetwork).toBe(true)
    })
})
