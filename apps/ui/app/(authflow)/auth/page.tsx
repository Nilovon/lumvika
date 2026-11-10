import { detectInAppBrowser, detectMobileOs } from '@/lib/in-app-browser'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { AuthPageMethods } from './AuthPageMethods'

// Where the number sits is picked here, from the request, so a phone never paints the computer's
// layout first, nor an in-app browser the Google button it cannot use. Apple is drawn everywhere.
export default async function AuthPage() {
    const userAgent = (await headers()).get('user-agent') ?? ''
    const phoneLeadsAlone = detectMobileOs(userAgent) !== null
    const showGoogle = !detectInAppBrowser(userAgent)
    return (
        <Suspense fallback={null}>
            <AuthPageMethods phoneLeadsAlone={phoneLeadsAlone} showGoogle={showGoogle} />
        </Suspense>
    )
}
