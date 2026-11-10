import { create } from 'zustand'
import type { AgentSharePreview } from '@lumvika/contracts'

// La fiche d'un agent reçu par lien (`?share=<token>`). Même rôle que template-flow.store : elle
// vit dans un store parce que le board doit savoir qu'un parcours d'installation tient l'écran,
// sinon il ouvre sa library ou son wizard de recrutement par-dessus.
//
// Non persisté : ce qui doit survivre à un aller-retour Google ou Stripe est parké dans
// onboarding.store, pas ici.
type AgentShareFlowState = {
    // Posé dès la lecture du param, avant même le fetch : sans ça l'auto-ouverture de la library
    // s'engouffre dans le temps de la requête.
    token: string | null
    preview: AgentSharePreview | null
    openLink: (token: string) => void
    resolveLink: (preview: AgentSharePreview) => void
    closeLink: () => void
}

export const useAgentShareStore = create<AgentShareFlowState>()(set => ({
    token: null,
    preview: null,
    openLink: token => set(state => ({ token, preview: state.token === token ? state.preview : null })),
    resolveLink: preview => set({ preview }),
    closeLink: () => set({ token: null, preview: null }),
}))

export function isAgentShareFlowBusy(state: Pick<AgentShareFlowState, 'token'>): boolean {
    return !!state.token
}
