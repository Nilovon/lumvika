import type { AuthMethod } from '@/lib/auth/auth-method'
import type { SignupAbandonTrigger, SignupStep } from '@rerun/analytics'

export type SignupLeaveEvent = 'hidden' | 'pagehide' | 'dismissed'

const CODE_PENDING: ReadonlySet<SignupStep> = new Set(['phone_code', 'email_code'])

// Going to the background is how a visitor reads the code we just sent them, so it only counts as
// giving up while no code is out. Leaving the page or closing the dialog counts at every step.
export function abandonTrigger(event: SignupLeaveEvent, step: SignupStep): SignupAbandonTrigger | null {
    if (event === 'dismissed') return 'dismissed'
    if (event === 'pagehide') return 'page_left'
    return CODE_PENDING.has(step) ? null : 'tab_hidden'
}

export function signupStep(method: AuthMethod, codeSent = false): SignupStep {
    return codeSent ? `${method}_code` : method
}

// A page going away fires `beforeunload`, then `visibilitychange` to hidden, then `pagehide`. The
// hidden step alone cannot tell that departure from a tab switch, and is the one that must send at
// once (a backgrounded tab may be killed before `pagehide` ever fires), so `beforeunload` is kept
// as the flag that turns it into a page leave. The flag is spent on the first hidden and dropped
// when the page shows again, in case another handler cancelled the unload.
export function createLeaveWatcher(leave: (event: SignupLeaveEvent) => void) {
    let unloading = false
    return {
        beforeUnload: () => {
            unloading = true
        },
        hidden: () => {
            const event: SignupLeaveEvent = unloading ? 'pagehide' : 'hidden'
            unloading = false
            leave(event)
        },
        visible: () => {
            unloading = false
        },
        pageHide: () => leave('pagehide'),
    }
}
