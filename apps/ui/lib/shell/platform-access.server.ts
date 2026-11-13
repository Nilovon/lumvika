import 'server-only'

import { platformFlag } from '@/flags'
import { platformShellOpen } from '@/lib/shell/platform-access'
import { createClient } from '@/supabase/server'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// Read from the token the proxy already refreshed: the layout and the page of the same request share it.
export const readSignedInAccount = cache(async (): Promise<boolean> => {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    return Boolean(data?.claims.sub) && data?.claims.is_anonymous !== true
})

export async function readPlatformShellOpen(): Promise<boolean> {
    const [platform, signedIn] = await Promise.all([platformFlag(), readSignedInAccount()])
    return platformShellOpen({ platform, signedIn })
}

/** Called first by every area page: whoever the shell is not open to lands on the board. */
export async function requirePlatformAccess(): Promise<void> {
    if (!(await readPlatformShellOpen())) redirect('/')
}
