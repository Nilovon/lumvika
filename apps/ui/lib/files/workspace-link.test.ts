import { describe, expect, it } from 'vitest'
import { AGENT_WORKSPACE_FILE_TAG, agentImageSrc, agentWorkspacePathFromHref, remarkAgentWorkspaceLinks } from './workspace-link'

describe('agentWorkspacePathFromHref', () => {
    it('extracts the nested path from an engine workspace link', () => {
        expect(agentWorkspacePathFromHref('/home/lumvika/lumvika/agents/wxpacyfio82izmpv41j6c/workspace/Hooks/E-commerce/50-HOOKS.md')).toBe('Hooks/E-commerce/50-HOOKS.md')
    })

    it('decodes spaces and unicode characters', () => {
        expect(agentWorkspacePathFromHref('/data/agents/agent-1/workspace/Briefs/Id%C3%A9es%20ao%C3%BBt.md')).toBe('Briefs/Idées août.md')
    })

    it('ignores query strings and fragments', () => {
        expect(agentWorkspacePathFromHref('/data/agents/agent-1/workspace/report.md?download=1#top')).toBe('report.md')
    })

    it.each([
        'https://example.com/agents/agent-1/workspace/report.md',
        'Hooks/report.md',
        '/workspace/report.md',
        '/data/agents/agent-1/workspace/',
        '/data/agents/agent-1/workspace/%2E%2E/secret.md',
        '/data/agents/agent-1/workspace/folder/%2Fsecret.md',
        '/data/agents/agent-1/workspace/bad%ZZ.md',
    ])('rejects non-workspace or unsafe href %s', href => {
        expect(agentWorkspacePathFromHref(href)).toBeNull()
    })
})

describe('remarkAgentWorkspaceLinks', () => {
    it('rewrites workspace links without touching web links', () => {
        type TestNode = {
            type: string
            url?: string
            data?: { hName?: string; hProperties?: Record<string, unknown>; [key: string]: unknown }
            children?: TestNode[]
        }
        const tree: TestNode = {
            type: 'root',
            children: [
                { type: 'link', url: '/data/agents/a/workspace/report.md', children: [{ type: 'text' }] },
                { type: 'link', url: 'https://example.com/report.md', children: [{ type: 'text' }] },
            ],
        }

        remarkAgentWorkspaceLinks()(tree)

        expect(tree.children![0].data).toEqual({ hName: AGENT_WORKSPACE_FILE_TAG, hProperties: { path: 'report.md' } })
        expect(tree.children![1].data).toBeUndefined()
    })
})

describe('agentImageSrc', () => {
    it('serves a path relative to the workspace from the agent files', () => {
        expect(agentImageSrc('agent-1', 'slides/slide 1.png')).toBe('/api/files/raw?agentId=agent-1&path=slides%2Fslide%201.png')
        expect(agentImageSrc('agent-1', './slides/slide%201.png')).toBe('/api/files/raw?agentId=agent-1&path=slides%2Fslide%201.png')
    })

    it('serves an absolute workspace path from the agent files', () => {
        expect(agentImageSrc('agent-1', '/data/agents/agent-1/workspace/slides/1.png')).toBe('/api/files/raw?agentId=agent-1&path=slides%2F1.png')
    })

    it('serves an absolute shared path from the shared space', () => {
        expect(agentImageSrc('agent-1', '/data/shared/remakes/1.png')).toBe('/api/files/raw?scope=shared&path=remakes%2F1.png')
    })

    it.each(['https://cdn.example.com/1.png', 'data:image/png;base64,AAAA', '//cdn.example.com/1.png', '#top', '/brand/logo.png', '../secret.png', 'slides/../../secret.png', 'slides//1.png', ''])(
        'leaves %s alone',
        src => {
            expect(agentImageSrc('agent-1', src)).toBeNull()
        }
    )
})

describe('remarkAgentWorkspaceLinks on images', () => {
    it('points the agent images at the file proxy, and only with an agent', () => {
        const tree = () => ({ type: 'root', children: [{ type: 'image', url: 'slides/1.png' }, { type: 'image', url: 'https://example.com/1.png' }] })

        const rewritten = tree()
        remarkAgentWorkspaceLinks({ agentId: 'agent-1' })(rewritten)
        expect(rewritten.children.map(node => node.url)).toEqual(['/api/files/raw?agentId=agent-1&path=slides%2F1.png', 'https://example.com/1.png'])

        const untouched = tree()
        remarkAgentWorkspaceLinks()(untouched)
        expect(untouched.children[0].url).toBe('slides/1.png')
    })
})
