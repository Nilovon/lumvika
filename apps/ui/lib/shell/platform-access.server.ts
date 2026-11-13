import 'server-only'

import { platformFlag } from '@/flags'
import { getAuthUser } from '@/lib/auth/session/getServerSession'
import { platformShellOpen } from '@/lib/shell/platform-access'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// The layout and the page of the same request share one read of the session.
export const readSignedInAccount = cache(async (): Promise<boolean> => {
    const user = await getAuthUser()
    return !!user && !user.isAnonymous
})

export async function readPlatformShellOpen(): Promise<boolean> {
    const [platform, signedIn] = await Promise.all([platformFlag(), readSignedInAccount()])
    return platformShellOpen({ platform, signedIn })
}

/** Called first by every area page: whoever the shell is not open to lands on the board. */
export async function requirePlatformAccess(): Promise<void> {
    if (!(await readPlatformShellOpen())) redirect('/')
}
