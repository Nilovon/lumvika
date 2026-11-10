import { environment } from '@/config/environment'

// The hub's bare viewer page. The socket goes in the fragment, which no request carries.
export function viewerUrl(socketUrl: string, mode: 'watch' | 'drive'): string {
    return `${environment.apiUrl}/desktop-view#socket=${encodeURIComponent(socketUrl)}&mode=${mode}`
}

// X11 keysyms and their DOM codes, for the keys a phone keyboard cannot send to a canvas.
export const DESKTOP_KEYS = {
    tab: { keysym: 0xff09, code: 'Tab', labelKey: 'tab' },
    backspace: { keysym: 0xff08, code: 'Backspace', labelKey: 'delete' },
    enter: { keysym: 0xff0d, code: 'Enter', labelKey: 'return' },
} as const

export const typeScript = (text: string) => `window.lumvikaDesktop && window.lumvikaDesktop.type(${JSON.stringify(text)}); true;`

export const keyScript = (keysym: number, code: string) => `window.lumvikaDesktop && window.lumvikaDesktop.key(${keysym}, ${JSON.stringify(code)}); true;`

// Asks the viewer page for small JPEG copies of the screen, `width` pixels wide, or stops them.
export const mirrorScript = (width: number | null) => `window.lumvikaDesktop && window.lumvikaDesktop.mirror && window.lumvikaDesktop.mirror(${width !== null}, ${width ?? 0}); true;`
