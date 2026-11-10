import 'server-only'

import { workspaceActor, type Actor } from '@/app/api/_auth/access'
import { createBoxes, deleteBox, renameBox } from '@/app/api/_services/box.service'
import { asStringArray, requireConfirmation, requireString } from '@/lib/mcp/args'

// No MCP tool covers the Boxes, but the app's own server actions do: the engine steward's Box tools
// are dispatched onto them here (app/api/_services/steward-hub.service.ts).
export async function dispatchBoxTool(ctx: { workspaceId: number; userId: string; actor?: Actor }, name: string, args: Record<string, unknown>): Promise<unknown> {
    const actor = ctx.actor ?? workspaceActor(ctx.workspaceId)
    switch (name) {
        case 'create_boxes': {
            const names = asStringArray(args.names)
            if (!names.length) throw new Error('create_boxes needs at least one name: one per division of the organisation you are laying out.')

            const results = await createBoxes({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor, names })
            // A Box that failed is reported beside the ones that landed rather than thrown: half an
            // organisation on the board is a sentence the steward has to say, not a turn that dies.
            const failed = results.flatMap((result, index) => (result.ok ? [] : [{ name: names[index], error: result.error }]))
            if (!results.some(result => result.ok)) throw new Error(failed[0]?.error ?? 'No Box could be created.')

            // The far corners travel with them: the agents of this team are placed inside those
            // bounds in the same turn, before any board map has been drawn again.
            const boxes = results.flatMap(result => (result.ok ? [{ boxId: result.spaceId, name: result.name, col: result.colStart, row: result.rowStart, colEnd: result.colEnd, rowEnd: result.rowEnd }] : []))
            return failed.length ? { boxes, failed } : { boxes }
        }
        case 'rename_box': {
            await renameBox(actor, requireString(args.boxId, 'boxId'), requireString(args.name, 'name'))
            return { ok: true }
        }
        case 'delete_box': {
            requireConfirmation(args, 'a Box')
            await deleteBox(actor, requireString(args.boxId, 'boxId'))
            return { ok: true }
        }
        default:
            throw new Error(`Unknown tool: ${name}`)
    }
}
