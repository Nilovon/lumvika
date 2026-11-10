'use client'

import { useCallback, useState } from 'react'

// A popover portalled to the body from inside a modal dialog sits outside its scroll lock and its
// focus containment: its list does not scroll and its first click counts as an outside interaction.
// The ref goes on any element next to the trigger; the container is the dialog it sits in, or null
// outside a dialog, which leaves the popover on the body.
export function useDialogPortalContainer<T extends HTMLElement>() {
    const [container, setContainer] = useState<HTMLElement | null>(null)
    const ref = useCallback((node: T | null) => setContainer(node?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? null), [])
    return [ref, container] as const
}
