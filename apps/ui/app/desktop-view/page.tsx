'use client'

import { useEffect, useRef, useState } from 'react'

import { DesktopViewer, type DesktopViewerHandle } from '@/components/desktop/DesktopViewer'

type NativeBridge = { postMessage: (message: string) => void }

type DesktopViewBridge = DesktopViewerHandle & {
    // Small JPEG copies of the screen posted to the app as `frame` messages, for its floating
    // thumbnail: a second socket would cost the machine a viewer, and a loader each time it shows.
    mirror: (on: boolean, width?: number) => void
}

declare global {
    interface Window {
        ReactNativeWebView?: NativeBridge
        lumvikaDesktop?: DesktopViewBridge
    }
}

const MIRROR_FRAME_MS = 1000 / 8
const MIRROR_QUALITY = 0.7
const DEFAULT_MIRROR_WIDTH = 400

// A coworker's screen and nothing else, for the iOS app's web view. The socket travels in the
// fragment, which no request carries: the page itself needs no session, the ticket in the socket URL
// is the only key, spent within a minute. The app types through `window.lumvikaDesktop`, hears of a
// dropped connection to ask for a fresh ticket, and can ask for copies of the screen to mirror it.
export default function DesktopView() {
    const viewer = useRef<DesktopViewerHandle>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const [mirrorWidth, setMirrorWidth] = useState<number | null>(null)
    const [target, setTarget] = useState<{ socketUrl: string; viewOnly: boolean } | null>(null)

    useEffect(() => {
        const read = () => {
            const params = new URLSearchParams(window.location.hash.slice(1))
            const socketUrl = params.get('socket')
            setTarget(socketUrl ? { socketUrl, viewOnly: params.get('mode') === 'watch' } : null)
        }
        read()
        window.addEventListener('hashchange', read)
        return () => window.removeEventListener('hashchange', read)
    }, [])

    useEffect(() => {
        window.lumvikaDesktop = {
            paste: text => viewer.current?.paste(text),
            key: (keysym, code) => viewer.current?.key(keysym, code),
            type: text => viewer.current?.type(text),
            mirror: (on, width) => setMirrorWidth(on ? Math.round(width || DEFAULT_MIRROR_WIDTH) : null),
        }
        return () => {
            delete window.lumvikaDesktop
        }
    }, [])

    useEffect(() => {
        if (!mirrorWidth) return
        const copy = document.createElement('canvas')
        const context = copy.getContext('2d')
        if (!context) return
        const timer = setInterval(() => {
            const source = canvasRef.current
            if (!source?.width || !source.height) return
            copy.width = mirrorWidth
            copy.height = Math.round((mirrorWidth * source.height) / source.width)
            context.drawImage(source, 0, 0, copy.width, copy.height)
            window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'frame', uri: copy.toDataURL('image/jpeg', MIRROR_QUALITY) }))
        }, MIRROR_FRAME_MS)
        return () => clearInterval(timer)
    }, [mirrorWidth])

    const tell = (type: 'connected' | 'disconnected') => window.ReactNativeWebView?.postMessage(JSON.stringify({ type }))

    if (!target) return <div className="h-dvh bg-black" />
    return (
        <div className="flex h-dvh flex-col bg-black">
            <DesktopViewer
                ref={viewer}
                socketUrl={target.socketUrl}
                viewOnly={target.viewOnly}
                onDisconnect={() => tell('disconnected')}
                onCanvas={canvas => {
                    canvasRef.current = canvas
                    if (canvas) tell('connected')
                }}
                className="bg-black"
            />
        </div>
    )
}
