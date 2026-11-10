import posthog from 'posthog-js'
import type { BeforeSendFn } from 'posthog-js'
import { SIGNUP_INTENT_COOKIE, sharedCookieDomain as sharedCookieDomainFor, type AnalyticsEventMap, type Attribution, type EventName } from './index'

// Nothing in here is allowed to touch the browser storage before `startAnalytics` has been called,
// which the apps do on load for everyone who has not refused: the consent model is opt-out, so
// only an explicit refusal keeps this closed, and `stopAnalytics` is what a refusal calls. The
// guard lives here rather than on the call sites: the `rr_*` cookies exist only to feed PostHog,
// so gating the writer gates all of them at once.
//
// PostHog itself is never `init`ed before then. `opt_out_capturing_by_default` would not be
// enough: it leaves the persistence on, and `init` loads the remote config over the network no
// matter what. `capture` / `identify` / `register` / `reset` on an uninitialised instance are
// silent no-ops, so the existing call sites need no guard of their own.
//
// A refusal leaves exactly one thing on, `startSessionReplay`: PostHog boots with its persistence
// in memory and a `before_send` that lets nothing but the replay out. The session is watchable
// without a byte written to the device, without an identity on it and without a single analytics
// event. `storageAllowed` stays false there, which is what keeps `track` and `identifyPerson`
// closed even though the instance is live.
type AnalyticsMode = 'off' | 'replay' | 'full'

let storageAllowed = false
let mode: AnalyticsMode = 'off'

const ATTRIBUTION_COOKIE = 'rr_attribution'

// Every cookie this module writes, cleared when consent is withdrawn.
const FUNNEL_COOKIES = [
    ATTRIBUTION_COOKIE,
    SIGNUP_INTENT_COOKIE,
    'rr_verif_sent_at',
    'rr_signup_at',
    'rr_ab_person',
]

const HYDRATION_MISMATCH = /Minified React error #(418|423|425)\b/

// Chrome and Edge wrap every translated string in a <font>, and Google Translate marks <html> on top.
// We never render a <font> ourselves.
function isPageTranslated(): boolean {
    if (typeof document === 'undefined') return false
    const root = document.documentElement.classList
    return root.contains('translated-ltr') || root.contains('translated-rtl') || document.querySelector('font') !== null
}

// A translator rewrites the server HTML before React hydrates it, so a translated page fails
// hydration for a reason that is not ours. React recovers by rendering on the client; the report is
// noise that buries the real mismatches, which still go through on an untranslated page.
export const dropHydrationNoiseOnTranslatedPage: BeforeSendFn = event => {
    if (event?.event !== '$exception') return event
    const exceptions = (event.properties?.$exception_list ?? []) as { value?: string }[]
    const isHydrationMismatch = exceptions.some(exception => HYDRATION_MISMATCH.test(exception.value ?? ''))
    return isHydrationMismatch && isPageTranslated() ? null : event
}

const POSTHOG_BASE_CONFIG = {
    api_host: '/ingest',
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-01-30',
    capture_exceptions: true,
    cross_subdomain_cookie: true,
    persistence: 'localStorage+cookie',
    before_send: dropHydrationNoiseOnTranslatedPage,
} as const

// PostHog builds the properties of a `$snapshot` from the replay payload and a distinct id alone,
// never from the super properties, so a recording whose distinct id stays the in-memory anonymous
// one carries nothing that points back at a person. Everything that would carry more is dropped on
// the way out; the capture flags below only spare the browser the work of producing events this
// function is going to refuse anyway.
const replaySnapshotsOnly: BeforeSendFn = event => (event?.event === '$snapshot' ? event : null)

const POSTHOG_REPLAY_ONLY_CONFIG = {
    ...POSTHOG_BASE_CONFIG,
    persistence: 'memory',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    capture_performance: false,
    capture_heatmaps: false,
    disable_surveys: true,
    before_send: replaySnapshotsOnly,
} as const

// An event sent as the page goes away can die in the batch queue: PostHog has already flushed it on
// its own `pagehide`, and a hidden tab may be frozen or killed before the next flush. `leavingPage`
// sends it on its own, as a beacon. `set` and `setOnce` land on the person, for the cohorts.
export function track<E extends EventName>(
    event: E,
    properties: AnalyticsEventMap[E],
    options?: { leavingPage?: boolean; set?: Record<string, unknown>; setOnce?: Record<string, unknown> },
) {
    if (!storageAllowed) return
    if (process.env.NODE_ENV === 'development') console.info(`[track] ${event}`, properties)
    posthog.capture(event, properties, {
        ...(options?.leavingPage && { transport: 'sendBeacon', send_instantly: true }),
        ...(options?.set && { $set: options.set }),
        ...(options?.setOnce && { $set_once: options.setOnce }),
    })
}

function sharedCookieDomain(): string | undefined {
    if (typeof window === 'undefined') return undefined
    return sharedCookieDomainFor(window.location.hostname)
}

function writeCookie(name: string, value: string, maxAgeDays: number) {
    if (typeof document === 'undefined') return
    const domain = sharedCookieDomain()
    const parts = [
        `${name}=${encodeURIComponent(value)}`,
        'path=/',
        `max-age=${maxAgeDays * 24 * 60 * 60}`,
        'SameSite=Lax',
    ]
    if (domain) parts.push(`domain=${domain}`)
    if (window.location.protocol === 'https:') parts.push('Secure')
    document.cookie = parts.join('; ')
}

export function setSharedCookie(name: string, value: string, maxAgeDays = 90) {
    if (!storageAllowed) return
    writeCookie(name, value, maxAgeDays)
}

// Deleting is always allowed: withdrawing consent has to be able to clean up after itself.
export function deleteSharedCookie(name: string) {
    writeCookie(name, '', 0)
}

export function getCookie(name: string): string | undefined {
    if (typeof document === 'undefined') return undefined
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : undefined
}

function referrerDomain(): string | undefined {
    if (typeof document === 'undefined' || !document.referrer) return undefined
    try {
        const host = new URL(document.referrer).hostname
        if (host.endsWith('lumvika.com')) return undefined
        return host || undefined
    } catch {
        return undefined
    }
}

let pendingAttribution: Attribution | undefined

// Read on arrival, kept in memory only. Without this a visitor landing with `?utm_source=x` who
// navigates client-side before accepting would lose their UTMs: by then the URL no longer carries
// them and the cookie was never allowed to be written.
export function rememberAttribution() {
    if (typeof window === 'undefined' || pendingAttribution) return

    const params = new URLSearchParams(window.location.search)
    const attribution: Attribution = {
        utm_source: params.get('utm_source') ?? undefined,
        utm_campaign: params.get('utm_campaign') ?? undefined,
        referrer_domain: referrerDomain(),
    }

    const hasSignal = attribution.utm_source || attribution.utm_campaign || attribution.referrer_domain
    if (!hasSignal) return

    pendingAttribution = attribution
}

export function persistAttribution() {
    if (!pendingAttribution) return
    if (getCookie(ATTRIBUTION_COOKIE)) return
    setSharedCookie(ATTRIBUTION_COOKIE, JSON.stringify(pendingAttribution))
}

// `lateExtensions` is for a page that has to paint fast on a modest phone: the recorder, the
// heatmaps and the dead clicks script they pull in (~70 KB and two long tasks) wait for the
// visitor's first gesture, or a few seconds after `load`, and surveys are not loaded at all. The
// replay then starts from that moment, not from the first millisecond.
type PosthogRuntime = { token?: string; debug?: boolean; lateExtensions?: boolean }

const LATE_EXTENSIONS_CONFIG = {
    disable_session_recording: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    disable_surveys: true,
} as const

const LATE_EXTENSIONS_FALLBACK_MS = 6000
const FIRST_GESTURES = ['pointerdown', 'mousemove', 'keydown', 'scroll', 'touchstart'] as const

function onFirstGestureOrLater(start: () => void) {
    let started = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = () => {
        if (started) return
        started = true
        clearTimeout(timer)
        for (const gesture of FIRST_GESTURES) window.removeEventListener(gesture, run)
        start()
    }

    for (const gesture of FIRST_GESTURES) window.addEventListener(gesture, run, { once: true, passive: true })

    const armFallback = () => {
        timer = setTimeout(run, LATE_EXTENSIONS_FALLBACK_MS)
    }
    if (document.readyState === 'complete') armFallback()
    else window.addEventListener('load', armFallback, { once: true })
}

export function startAnalytics({
    token,
    debug = false,
    captureAttribution = false,
    lateExtensions = false,
}: PosthogRuntime & { captureAttribution?: boolean }) {
    storageAllowed = true
    if (captureAttribution) persistAttribution()

    // A deployment without a token has analytics deliberately off (staging, local dev). The `rr_*`
    // cookies still work there, which is what makes the funnel testable without a PostHog project.
    if (!token || mode === 'full') return

    // An instance already running for the replay alone cannot be widened in place: its persistence,
    // its autocapture and its `before_send` are all read at `init`. So the visitor who accepts
    // after having refused gets a reload, which comes back through here with the consent cookie
    // already written and `mode` back to `off`.
    if (mode === 'replay') {
        location.reload()
        return
    }

    mode = 'full'
    if (!lateExtensions) {
        posthog.init(token, { ...POSTHOG_BASE_CONFIG, debug })
        return
    }

    posthog.init(token, { ...POSTHOG_BASE_CONFIG, ...LATE_EXTENSIONS_CONFIG, debug })
    // Heatmaps and dead clicks go back to the project settings. `set_config` skips `undefined`, so
    // the client-side `false` is cleared on the config itself; the `set_config` inside
    // `startSessionRecording` then has every extension read it again.
    onFirstGestureOrLater(() => {
        posthog.config.capture_heatmaps = undefined
        posthog.config.capture_dead_clicks = undefined
        posthog.startSessionRecording()
    })
}

// The one measurement a refusal does not switch off. Only ever called for a visitor who refused,
// so it must stay storage-free and anonymous: see `POSTHOG_REPLAY_ONLY_CONFIG`.
export function startSessionReplay({ token, debug = false, lateExtensions = false }: PosthogRuntime) {
    if (!token || mode !== 'off') return
    mode = 'replay'
    if (!lateExtensions) {
        posthog.init(token, { ...POSTHOG_REPLAY_ONLY_CONFIG, debug })
        return
    }

    // `before_send` refuses heatmaps and dead clicks here anyway, so they are never loaded.
    posthog.init(token, { ...POSTHOG_REPLAY_ONLY_CONFIG, ...LATE_EXTENSIONS_CONFIG, debug })
    onFirstGestureOrLater(() => posthog.startSessionRecording())
}

// Gated like the cookies rather than like `capture`: an `identify` writes the email into the
// distinct id of the instance, which is the one property a `$snapshot` carries, so letting it
// through in replay-only mode would put a name on a recording a visitor refused to be measured by.
export function identifyPerson(
    distinctId: string,
    properties?: Record<string, unknown>,
    propertiesSetOnce?: Record<string, unknown>,
) {
    if (!storageAllowed) return
    posthog.identify(distinctId, properties, propertiesSetOnce)
}

function deleteEverywhere(name: string) {
    const base = [`${name}=`, 'path=/', 'max-age=0']
    document.cookie = base.join('; ')
    const domain = sharedCookieDomain()
    if (domain) document.cookie = [...base, `domain=${domain}`].join('; ')
}

function clearPosthogStorage() {
    for (const cookie of document.cookie.split('; ')) {
        const name = cookie.split('=')[0]
        if (name.startsWith('ph_')) deleteEverywhere(name)
    }
    try {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('ph_') || key.startsWith('__ph_opt_in_out_')) localStorage.removeItem(key)
        }
    } catch {
        // localStorage can be denied outright, and the cookies are already gone
    }
}

// PostHog cannot be un-initialised: autocapture, pageleave and the exception handlers stay wired
// whatever we call. So the storage is wiped, persistence is turned off to stop it being written
// again, and the page is reloaded to drop the listeners. `opt_out_capturing()` is deliberately not
// called, it would write an orphan `__ph_opt_in_out_*` key of its own.
export function stopAnalytics(replay?: PosthogRuntime) {
    if (typeof window === 'undefined') return
    storageAllowed = false
    for (const name of FUNNEL_COOKIES) deleteEverywhere(name)
    clearPosthogStorage()

    // The reload is what hands the replay over: the page comes back with the refusal in the cookie,
    // and the app starts PostHog again in replay-only mode. Nothing to hand over when it was never
    // running, so that case starts the replay on the spot.
    if (mode === 'full') {
        posthog.set_config({ disable_persistence: true })
        location.reload()
        return
    }
    if (replay) startSessionReplay(replay)
}

export function readAttribution(): Attribution {
    const raw = getCookie(ATTRIBUTION_COOKIE)
    if (raw) {
        try {
            return JSON.parse(raw) as Attribution
        } catch {
            // fall through to posthog-native props
        }
    }
    return {
        utm_source: (posthog.get_property('$initial_utm_source') as string | undefined) ?? undefined,
        utm_campaign: (posthog.get_property('$initial_utm_campaign') as string | undefined) ?? undefined,
        referrer_domain:
            (posthog.get_property('$initial_referring_domain') as string | undefined) ?? undefined,
    }
}
