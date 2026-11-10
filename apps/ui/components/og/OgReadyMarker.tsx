'use client'

import { useEffect } from 'react'

function settled(image: HTMLImageElement): Promise<void> {
    if (image.complete) return Promise.resolve()
    return new Promise(resolve => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
    })
}

// A lazy image inside a hidden subtree never enters a viewport, so the browser never starts it and
// its load event never comes. Waiting on it would hang forever, and it cannot reach the capture
// anyway: a template thumbnail carries its dark and its light twin, and only one of them is shown.
const neverLoads = (image: HTMLImageElement) => image.loading === 'lazy' && image.getClientRects().length === 0

// Re-scanned after each round: a tile that only paints its icon once the grid has measured itself
// adds an <img> that was not in the document when the first round started.
async function imagesSettled() {
    for (let round = 0; round < 5; round++) {
        const images = Array.from(document.images).filter(image => !neverLoads(image))
        if (images.every(image => image.complete)) return
        await Promise.all(images.map(settled))
    }
}

// Any SMIL <animate> on the page, which neither prefers-reduced-motion nor animation-play-state
// reaches, and which document.getAnimations() does not even list. The isogrid no longer has any.
function freezeSvgAnimations() {
    for (const svg of document.querySelectorAll('svg')) {
        if (!(svg instanceof SVGSVGElement)) continue
        svg.setCurrentTime(0)
        svg.pauseAnimations()
    }
}

// Pausing through the cascade rather than through `animation.pause()`: a scripted pause on a CSS
// animation is undone by the next style recalculation, and a spinner that resumed between the marker
// and the shutter is what made two captures of the same card differ.
function pauseCssAnimations() {
    const style = document.createElement('style')
    style.textContent = '*, *::before, *::after { animation-play-state: paused !important }'
    document.head.appendChild(style)
}

const isEndless = (animation: Animation) => animation.effect?.getComputedTiming().iterations === Infinity

// Two captures of the same card have to be byte-identical, so an endless animation is rewound to the
// frame it starts on rather than left wherever it happened to be, and a finite one is waited out.
// The rewind is repeated after a frame because a spinner deep in the tree starts animating after this
// runs, and would otherwise freeze at whatever millisecond the pause rule happened to reach it.
async function animationsSettled() {
    await Promise.all(
        document
            .getAnimations()
            .filter(animation => !isEndless(animation))
            .map(animation => animation.finished.catch(() => {})),
    )

    pauseCssAnimations()

    for (let round = 0; round < 3; round++) {
        await nextFrame()
        for (const animation of document.getAnimations()) {
            if (isEndless(animation)) animation.currentTime = 0
        }
    }
}

function nextFrame(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

// The screenshot service waits for this attribute instead of a fixed delay: the board mounts on the
// client and pulls its connector icons from the `service-icons` bucket, so "load" fires far too early.
export function OgReadyMarker() {
    useEffect(() => {
        let cancelled = false

        void (async () => {
            await document.fonts.ready
            await imagesSettled()
            freezeSvgAnimations()
            await animationsSettled()
            await nextFrame()
            if (!cancelled) document.documentElement.dataset.ogReady = 'true'
        })()

        return () => {
            cancelled = true
            delete document.documentElement.dataset.ogReady
        }
    }, [])

    return null
}
