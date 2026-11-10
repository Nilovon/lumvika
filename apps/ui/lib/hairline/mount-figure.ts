import { HL } from './kernel'

export type HairlineFigureDefinition = {
    name: string
    means: string
    // The figure's own number at intensity 0, 0.5 and 1; the middle one is the default.
    range: number[]
    tour: (number[] | null)[] | null
    mount: (host: { stage: HTMLElement; svg: SVGSVGElement; read: { textContent: string | null } }, value: number) => { set: (value: number) => void; destroy: () => void }
}

// What the package's own components do for its figures, for one drawn here: the svg, the caption
// nobody reads, and the unseen pointer that walks the figure's tour until a real one arrives.
export function mountFigure(stage: HTMLElement, figure: HairlineFigureDefinition, { play }: { play: boolean }): () => void {
    HL.inject(stage.ownerDocument)
    stage.setAttribute('data-hairline', figure.name)
    const svg = HL.mk('svg', { viewBox: '0 0 400 320', 'aria-hidden': 'true' }, stage) as SVGSVGElement
    const handle = figure.mount({ stage, svg, read: { textContent: null } }, figure.range[1])
    const playing = play ? HL.tour(stage, figure.tour ?? HL.LAP, undefined) : null
    return () => {
        playing?.stop()
        handle.destroy()
        svg.remove()
        stage.removeAttribute('data-hairline')
    }
}
