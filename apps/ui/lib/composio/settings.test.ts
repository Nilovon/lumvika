import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const selectMaybeSingle = vi.fn()
const upsertRows = vi.fn()
vi.mock('@/lib/db', () => ({
    serviceScope: () => 'service',
    selectMaybeSingle: (...args: unknown[]) => selectMaybeSingle(...args),
    selectMany: vi.fn(),
    upsertRows: (...args: unknown[]) => upsertRows(...args),
    deleteRows: vi.fn(),
}))

const { composioApiKey, composioKeySource, forgetComposioSettingsCache, resolveAuthConfigId, saveComposioApiKey } = await import('./settings')

beforeEach(() => {
    forgetComposioSettingsCache()
    selectMaybeSingle.mockReset()
    upsertRows.mockReset().mockResolvedValue({ error: null })
})

afterEach(() => vi.unstubAllEnvs())

describe('the Composio API key', () => {
    it('comes from the environment first, without reading the database', async () => {
        vi.stubEnv('COMPOSIO_API_KEY', 'env-key')
        expect(await composioApiKey()).toBe('env-key')
        expect(await composioKeySource()).toBe('environment')
        expect(selectMaybeSingle).not.toHaveBeenCalled()
    })

    it('falls back to the key an admin saved in the app', async () => {
        vi.stubEnv('COMPOSIO_API_KEY', '')
        selectMaybeSingle.mockResolvedValue({ data: { value: 'saved-key' }, error: null })
        expect(await composioApiKey()).toBe('saved-key')
        expect(await composioKeySource()).toBe('app')
        expect(selectMaybeSingle).toHaveBeenCalledTimes(1)
    })

    it('is missing when neither holds one', async () => {
        vi.stubEnv('COMPOSIO_API_KEY', '')
        selectMaybeSingle.mockResolvedValue({ data: null, error: null })
        expect(await composioApiKey()).toBeNull()
        expect(await composioKeySource()).toBeNull()
    })

    it('is read again after an admin saves a new one', async () => {
        vi.stubEnv('COMPOSIO_API_KEY', '')
        selectMaybeSingle.mockResolvedValueOnce({ data: { value: 'old-key' }, error: null }).mockResolvedValueOnce({ data: { value: 'new-key' }, error: null })
        expect(await composioApiKey()).toBe('old-key')
        await saveComposioApiKey('new-key', 'user-1')
        expect(await composioApiKey()).toBe('new-key')
    })
})

describe('the auth config of a toolkit', () => {
    it('is the one an admin set, over the one in the manifest', async () => {
        selectMaybeSingle.mockResolvedValue({ data: { auth_config_id: 'ac_app' }, error: null })
        expect(await resolveAuthConfigId({ toolkit: 'gmail', authConfigId: 'ac_catalog' })).toBe('ac_app')
    })

    it('is the manifest one when none was set', async () => {
        selectMaybeSingle.mockResolvedValue({ data: null, error: null })
        expect(await resolveAuthConfigId({ toolkit: 'gmail', authConfigId: 'ac_catalog' })).toBe('ac_catalog')
    })

    it('stays empty when neither has one', async () => {
        selectMaybeSingle.mockResolvedValue({ data: null, error: null })
        expect(await resolveAuthConfigId({ toolkit: 'gmail', authConfigId: '' })).toBe('')
    })
})
