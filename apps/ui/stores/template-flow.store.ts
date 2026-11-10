import { create } from 'zustand'
import type { LibraryTemplate } from '@/lib/templates/library'

// Les deux parcours d'installation qui prennent l'écran : la fiche d'un lien partagé
// (`?template=<slug>`) et le retour d'un checkout de template (`?purchase=success`). Ils vivent
// dans un store plutôt que dans HomeContent parce que le board doit savoir qu'un d'eux tient
// l'écran : sinon il ouvre sa library par-dessus.
//
// Non persisté : ce qui doit survivre à un aller-retour Google ou Stripe est parké dans
// onboarding.store, pas ici.
type TemplateFlowState = {
    // Posé dès la lecture du param, avant même le fetch de la template : sans ça l'auto-ouverture
    // de la library s'engouffre dans le temps de la requête.
    linkSlug: string | null
    linkTemplate: LibraryTemplate | null
    purchase: { slug: string; sessionId: string | null } | null
    openLink: (slug: string) => void
    resolveLink: (template: LibraryTemplate) => void
    closeLink: () => void
    openPurchase: (purchase: { slug: string; sessionId: string | null }) => void
    closePurchase: () => void
}

export const useTemplateFlowStore = create<TemplateFlowState>()(set => ({
    linkSlug: null,
    linkTemplate: null,
    purchase: null,
    // Une template déjà résolue pour ce slug est gardée : le parcours d'onboarding la précharge
    // pendant la survey, et la jeter ici rendrait la fiche à son skeleton.
    openLink: slug => set(state => ({ linkSlug: slug, linkTemplate: state.linkTemplate?.slug === slug ? state.linkTemplate : null })),
    resolveLink: template => set({ linkTemplate: template }),
    closeLink: () => set({ linkSlug: null, linkTemplate: null }),
    openPurchase: purchase => set({ purchase }),
    closePurchase: () => set({ purchase: null }),
}))

// Un parcours d'installation est à l'écran, ou en route : rien d'autre ne doit s'ouvrir, et ce qui
// l'est déjà se referme. La fiche gagne toujours, c'est la seule à porter une intention explicite.
export function isTemplateFlowBusy(state: Pick<TemplateFlowState, 'linkSlug' | 'purchase'>): boolean {
    return !!state.linkSlug || !!state.purchase
}
