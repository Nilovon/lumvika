import { describe, expect, it } from 'vitest'

import { defaultInstanceEnvVar, instanceEnvVar, instanceServerName, newServiceInstanceId, ordinalInstanceLabel } from './instances'
import type { RegistryEntry } from './registry'

const entry = (label?: string): RegistryEntry => ({ status: 'active', config: {}, mcpServers: [], envKeys: [], skills: [], installedAt: '', ...(label ? { label } : {}) })

describe('service instances', () => {
    it('draws a fresh six-character id', () => {
        expect(newServiceInstanceId()).toMatch(/^[a-z0-9]{6}$/)
    })

    it('caps the server name at 64 characters with a single dash', () => {
        expect(instanceServerName('gmail', 'k3x9ab')).toBe('gmail-k3x9ab')
        const long = instanceServerName('x'.repeat(80), 'k3x9ab')
        expect(long).toHaveLength(64)
        expect(long.endsWith('-k3x9ab')).toBe(true)
    })

    it('suffixes env vars with the instance id', () => {
        expect(instanceEnvVar('SLACK_BOT_TOKEN', 'k3x9ab')).toBe('SLACK_BOT_TOKEN_K3X9AB')
        expect(defaultInstanceEnvVar('google-drive', 'k3x9ab', 'api_key')).toBe('LUMVIKA_SVC_GOOGLE_DRIVE_K3X9AB_API_KEY')
        expect(defaultInstanceEnvVar('google-drive', undefined, 'api_key')).toBe('LUMVIKA_SVC_GOOGLE_DRIVE_API_KEY')
    })

    it('numbers a new account after the ones already shown', () => {
        expect(ordinalInstanceLabel('Gmail', { services: { gmail: entry() } }, 'gmail')).toBe('Gmail 2')
        expect(ordinalInstanceLabel('Gmail', { services: { gmail: entry(), 'gmail@aaaaaa': entry('Gmail 2') } }, 'gmail')).toBe('Gmail 3')
        expect(ordinalInstanceLabel('Gmail', { services: { 'gmail@bbbbbb': entry('Gmail 3') } }, 'gmail')).toBe('Gmail 2')
    })
})
