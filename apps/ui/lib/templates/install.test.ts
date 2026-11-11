import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectSingle = vi.fn()
const selectMany = vi.fn()
const importAgent = vi.fn()
const deriveUniqueHandles = vi.fn(async (_scope: unknown, _workspaceId: number, names: string[]) => names.map(name => name.toLowerCase()))
const downloadPrivateFile = vi.fn(async () => new Blob(['archive']))

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), selectSingle, selectMany }))
vi.mock('@/app/api/_services/agent.service', () => ({ importAgent, deriveUniqueHandles }))
vi.mock('@/lib/storage/private', () => ({ downloadPrivateFile }))

const { installTemplate } = await import('./install')

const TEMPLATE = { id: 'template-1', title: 'Ad Remaker', agents: [], agent_archives: [{ agentKey: 'ad-remaker', path: 'archives/ad-remaker.tar.gz', bytes: 1, capturedAt: '2026-10-01T00:00:00.000Z' }] }
const TARGET = { workspaceId: 13119, spaceId: 'space-1', actor: { kind: 'workspace' as const, workspaceId: 13119 } }

describe('installTemplate', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        selectSingle.mockResolvedValue({ data: TEMPLATE })
        importAgent.mockResolvedValue({ agent: { id: 'agent-new', disabled_at: null }, imported: { skippedPaths: [], triggers: [] } })
    })

    it('hands back the coworkers a workspace already has instead of installing the template again', async () => {
        selectMany.mockResolvedValue({ data: [{ id: 'agent-1' }] })

        const outcome = await installTemplate({} as never, 'ad-remaker', TARGET)

        expect(outcome).toEqual({ imported: 0, inactive: 0, agentIds: ['agent-1'], failed: [], warnings: [], alreadyInstalled: true })
        expect(selectMany).toHaveBeenCalledWith({}, 'agents', ['id'], { workspace_id: 13119, template_id: 'template-1' }, { column: 'created_at' })
        expect(importAgent).not.toHaveBeenCalled()
    })

    it('installs a second team when the user asks to install the template again', async () => {
        selectMany.mockResolvedValue({ data: [{ id: 'agent-1' }] })

        const outcome = await installTemplate({} as never, 'ad-remaker', { ...TARGET, again: true })

        expect(outcome).toMatchObject({ imported: 1, agentIds: ['agent-new'], alreadyInstalled: false })
        expect(selectMany).not.toHaveBeenCalled()
        expect(importAgent).toHaveBeenCalled()
    })

    it('installs a template the workspace does not have yet', async () => {
        selectMany.mockResolvedValue({ data: [] })

        const outcome = await installTemplate({} as never, 'ad-remaker', TARGET)

        expect(outcome).toMatchObject({ imported: 1, agentIds: ['agent-new'], alreadyInstalled: false })
        expect(importAgent).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'template-1', workspaceId: 13119, spaceId: 'space-1' }))
    })
})
