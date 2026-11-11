import { expoClient } from '@better-auth/expo/client'
import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { deviceKeychain } from '@/auth/secure-storage'
import { environment } from '@/config/environment'

export const APP_SCHEME = 'lumvika'

export const authClient = createAuthClient({
    baseURL: environment.apiUrl,
    plugins: [
        expoClient({
            scheme: APP_SCHEME,
            storagePrefix: 'lumvika',
            // The hub names its cookies `lumvika.*`: under any other prefix the client would never store them.
            cookiePrefix: 'lumvika',
            storage: deviceKeychain,
            // Nothing of the provider's sign-in stays in Safari: the next person on this phone is asked again.
            webBrowserOptions: { preferEphemeralSession: true },
        }),
        emailOTPClient(),
    ],
})
