import 'server-only'

import type { TemplateConnector } from '@lumvika/contracts'
import type { BoardAgent } from '@lumvika/ui/iso-grid'
import { CARD_HEIGHT, CARD_MAX_ZOOM, CARD_WIDTH } from '@lumvika/ui/iso-grid/card-capture'

import type { DbScope } from '@/lib/db'
import { loadServiceCatalog } from '@/lib/templates/catalog'

import { boardAgentsOfScene, type BoardImageRequest } from './board-image'

export type StagedBoardScene = { agents: BoardAgent[]; connectors: TemplateConnector[]; highlightedConnectorSlugs: string[] }

// A scene names its apps by slug only. A slug the catalog does not know is dropped rather than
// drawn as a blank tile: the picture goes out in a message, where nobody can hover it for a name.
export async function stageBoardScene(scope: DbScope, scene: BoardImageRequest['scene']): Promise<StagedBoardScene> {
    const slugs = [...new Set(scene.agents.flatMap(agent => agent.connectors ?? []))]
    const catalog = slugs.length > 0 ? await loadServiceCatalog(scope, slugs) : new Map()

    return {
        agents: boardAgentsOfScene(scene, new Set(catalog.keys())),
        connectors: slugs.flatMap(slug => {
            const entry = catalog.get(slug)
            return entry ? [{ slug, name: entry.name, icon: entry.icon }] : []
        }),
        highlightedConnectorSlugs: scene.highlight ?? [],
    }
}

// The card zoom is tuned for the card frame: scaled with the frame, a board keeps the same share of
// the picture whatever size is asked for.
export function boardImageMaxZoom({ width, height, zoom }: Pick<BoardImageRequest, 'width' | 'height' | 'zoom'>): number {
    return zoom ?? CARD_MAX_ZOOM * Math.min(width / CARD_WIDTH, height / CARD_HEIGHT)
}
