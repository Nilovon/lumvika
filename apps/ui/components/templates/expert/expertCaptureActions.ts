import { captureMyAgentsAction, listMyCaptureSourcesAction, planMyCaptureAction } from '@/app/api/_actions/expert-capture.actions'
import type { CaptureActions } from '@/components/templates/capture/types'

// An expert addresses their template by id and only ever sources agents from their own sandbox: the
// slug and the workspace scope are both resolved server-side from the caller.
export function expertCaptureActions(templateId: string): CaptureActions {
    return {
        listSources: listMyCaptureSourcesAction,
        plan: input => planMyCaptureAction({ templateId, ...input }),
        capture: input => captureMyAgentsAction({ templateId, ...input }),
    }
}
