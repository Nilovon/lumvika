'use client'

import { Button } from '@rerun/ui/primitives'

// `animated: false` n'est pas cosmétique : OgReadyMarker attend que toute animation soit terminée
// ou figée avant de laisser rerun-shot déclencher la capture.
export function OgCta({ label }: { label: string }) {
    return (
        <Button size="lg" highlight={{ animated: false }} className="h-auto rounded-xl px-7 py-3.5 text-xl">
            {label}
        </Button>
    )
}
