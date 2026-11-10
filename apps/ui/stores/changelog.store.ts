import { create } from 'zustand'

import { markChangelogSeenAction, type ChangelogEntryView, type ChangelogFeed } from '@/app/api/_actions/changelog.actions'

// Au-delà, ce n'est plus une nouvelle, c'est un rattrapage. Le reste attend dans le menu.
const MAX_AUTO = 3

type ChangelogState = {
    entries: ChangelogEntryView[]
    seenAt: string | null
    // Figé à l'ouverture : une entrée publiée pendant la lecture ne doit pas réordonner le pas à pas.
    shown: ChangelogEntryView[]
    open: boolean
    setFeed: (feed: ChangelogFeed) => void
    openUnread: () => void
    openAll: () => void
    close: () => void
}

export const useChangelogStore = create<ChangelogState>((set, get) => ({
    entries: [],
    seenAt: null,
    shown: [],
    open: false,
    setFeed: feed => set({ entries: feed.entries, seenAt: feed.seenAt }),
    openUnread: () => {
        // Chronologique à l'écran : on a raté trois semaines, on les relit dans l'ordre où elles
        // sont arrivées, pas à l'envers.
        const unread = get().entries.filter(entry => entry.unread).slice(0, MAX_AUTO).reverse()
        if (unread.length) set({ shown: unread, open: true })
    },
    openAll: () => {
        const all = get().entries
        if (all.length) set({ shown: all, open: true })
    },
    close: () => {
        const { shown, seenAt } = get()
        // La fermeture est immédiate, jamais suspendue à un aller-retour réseau.
        set({ open: false })
        // Le menu montre la plus récente d'abord, la popup la montre en dernier.
        const newest = shown.reduce<ChangelogEntryView | undefined>(
            (latest, entry) => (!latest || Date.parse(entry.publishedAt) > Date.parse(latest.publishedAt) ? entry : latest),
            undefined,
        )
        if (!newest) return
        if (seenAt && Date.parse(newest.publishedAt) <= Date.parse(seenAt)) return

        // Tout ce qui a été montré compte comme lu, pas seulement l'étape atteinte : revenir à la
        // session suivante pour qui ferme à la première se ressent comme du harcèlement, et
        // l'historique reste à un clic dans le menu.
        set(state => ({
            seenAt: newest.publishedAt,
            entries: state.entries.map(entry => (Date.parse(entry.publishedAt) <= Date.parse(newest.publishedAt) ? { ...entry, unread: false } : entry)),
        }))
        void markChangelogSeenAction(newest.publishedAt).catch(() => undefined)
    },
}))

export const selectUnreadCount = (state: ChangelogState) => state.entries.filter(entry => entry.unread).length
export const selectHasEntries = (state: ChangelogState) => state.entries.length > 0
