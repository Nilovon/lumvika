'use client'

import { isAdminEmail } from '@/lib/auth/admin-emails'
import { useSession } from '@/lib/auth/session/SessionProvider'

export function useIsAdmin(): boolean {
    const { session } = useSession()
    return isAdminEmail(session?.user?.email)
}
