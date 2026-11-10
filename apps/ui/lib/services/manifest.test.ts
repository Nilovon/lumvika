import { composioTarget, defaultMethod, predictInstall, serviceManifestSchema } from '@/lib/services/manifest'
import { describe, expect, it } from 'vitest'

const linkedinManifest = {
    slug: 'linkedin',
    name: 'LinkedIn',
    category: 'marketing',
    authMethods: [
        {
            id: 'composio',
            label: 'Connect with LinkedIn',
            kind: 'composio',
            recommended: true,
            composio: { toolkit: 'linkedin', authConfigId: 'ac_test', allowedTools: ['LINKEDIN_GET_MY_INFO'] },
            mcpServers: [
                {
                    name: 'linkedin',
                    transport: 'http',
                    url: '${RERUN_HUB_BASE_URL}/api/mcp/composio/linkedin',
                    headers: { 'x-rerun-key': '${RERUN_API_KEY}', 'x-rerun-agent': '${agent.id}' },
                },
            ],
        },
    ],
}

describe('composio manifests', () => {
    it('parses a composio auth method', () => {
        const manifest = serviceManifestSchema.parse(linkedinManifest)
        const method = defaultMethod(manifest)
        expect(method.kind).toBe('composio')
        expect(method.composio).toEqual({ toolkit: 'linkedin', authConfigId: 'ac_test', allowedTools: ['LINKEDIN_GET_MY_INFO'] })
    })

    it('resolves the composio target from the method', () => {
        const manifest = serviceManifestSchema.parse(linkedinManifest)
        expect(composioTarget(defaultMethod(manifest))).toEqual({ toolkit: 'linkedin', serverName: 'linkedin' })
    })

    it('returns no target for a non-composio method', () => {
        const manifest = serviceManifestSchema.parse({ slug: 's', name: 'S', inputs: [{ key: 'API_KEY', label: 'API key', secret: true, required: true }] })
        expect(composioTarget(defaultMethod(manifest))).toBeNull()
    })

    it('predicts needs_auth for a composio install', () => {
        const manifest = serviceManifestSchema.parse(linkedinManifest)
        expect(predictInstall(manifest).outcome).toBe('needs_auth')
    })
})

describe('multiInstance', () => {
    it('defaults to a single account', () => {
        expect(serviceManifestSchema.parse(linkedinManifest).multiInstance).toBe(false)
    })

    it('keeps the flag when the manifest sets it', () => {
        expect(serviceManifestSchema.parse({ ...linkedinManifest, multiInstance: true }).multiInstance).toBe(true)
    })
})
