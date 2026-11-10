import { afterEach, describe, expect, it, vi } from 'vitest'
import { notificationUrl, redirectDelivery } from './client'

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('redirectDelivery', () => {
    it('delivers to the real recipient when no redirect inbox is set', () => {
        vi.stubEnv('EMAIL_REDIRECT_TO', '')
        expect(redirectDelivery('user@acme.com', 'Welcome')).toEqual({ to: 'user@acme.com', subject: 'Welcome' })
    })

    it('reroutes every mail to the redirect inbox and names the intended recipient in the subject', () => {
        vi.stubEnv('EMAIL_REDIRECT_TO', 'qa@rerun.build')
        expect(redirectDelivery('user@acme.com', 'Welcome')).toEqual({ to: 'qa@rerun.build', subject: '[staging → user@acme.com] Welcome' })
    })

    it('reads the variable at send time, not at import', () => {
        vi.stubEnv('EMAIL_REDIRECT_TO', '')
        expect(redirectDelivery('a@b.c', 's').to).toBe('a@b.c')
        vi.stubEnv('EMAIL_REDIRECT_TO', 'qa@rerun.build')
        expect(redirectDelivery('a@b.c', 's').to).toBe('qa@rerun.build')
    })
})

describe('notificationUrl', () => {
    it('points the board at the notification it opens', () => {
        expect(notificationUrl('3f9e7b94-7f12-81dd')).toMatch(/\/\?notification=3f9e7b94-7f12-81dd$/)
    })
})

describe('IS_PRODUCTION_MAILER', () => {
    it('is off in production as soon as a redirect inbox is set', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('EMAIL_REDIRECT_TO', 'qa@rerun.build')
        vi.resetModules()
        expect((await import('./client')).IS_PRODUCTION_MAILER).toBe(false)
        vi.stubEnv('EMAIL_REDIRECT_TO', '')
        vi.resetModules()
        expect((await import('./client')).IS_PRODUCTION_MAILER).toBe(true)
    })
})

describe('getResendClient', () => {
    it('has no client without an API key and reuses the one it built', async () => {
        vi.resetModules()
        vi.stubEnv('RESEND_API_KEY', '')
        const first = await import('./client')
        expect(first.getResendClient()).toBeNull()
        vi.stubEnv('RESEND_API_KEY', 're_test')
        expect(first.getResendClient()).toBe(first.getResendClient())
        expect(first.getResendClient()).not.toBeNull()
    })
})
