'use client'

import { isSubscriptionEntitled } from '@lumvika/cloud/billing'
import { useBillingStore } from '@/stores/billing.store'
import { useBoardStore } from '@/stores/board.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { track } from '@lumvika/analytics/client'
import type { LibraryTemplate } from '@/lib/templates/library'

// Using a template, from the library as from a shared link. It never installs anything itself: it
// clears the way (right view, plan checked) then hands over to the board, where the user places
// each captured agent by hand. The install fires on the last drop, in board.store.
export function useTemplateImportFlow({ onDone }: { onDone: () => void }) {
    const { workspace } = useSession()
    const openBilling = useBillingStore(s => s.openBilling)
    const beginTemplatePlacement = useBoardStore(s => s.beginTemplatePlacement)
    const spaces = useBoardStore(s => s.spaces)

    function run(template: LibraryTemplate, { again = false }: { again?: boolean } = {}) {
        if (!workspace) return

        // Bought from another tab, or paid for again after it lapsed: what is already on the board
        // opens rather than a second copy beside it, unless the user asked for that second copy.
        const installed = again ? undefined : useBoardStore.getState().agents.find(agent => agent.templateId === template.id)
        if (installed) {
            useBoardStore.getState().openAgentChat(installed.id)
            onDone()
            return
        }

        // A workspace that already has a space pays before it places. Without one, the drop on the
        // onboarding placeholder is itself what triggers signup and the paywall, so the gates would
        // only get in the way of the moment we are after.
        const hasSpace = spaces.length > 0
        if (hasSpace) {
            if (!isSubscriptionEntitled(workspace.subscription_status)) {
                openBilling(undefined, 'template_link')
                return
            }
            // Pas de gate sur le nombre d'agents : le lot s'installe en entier, et ce qui dépasse le
            // plan atterrit éteint (reportInstall le dit). Le paywall se mérite au clic sur un agent
            // verrouillé, pas avant d'avoir vu ce que la template pose.
        } else {
            track('first_agent_created', { template: template.slug })
        }

        track('template_link_opened', { slug: template.slug, has_space: hasSpace })
        beginTemplatePlacement({ slug: template.slug, title: template.title, agentNames: template.archiveAgentNames, again })
        onDone()
    }

    return { run }
}
