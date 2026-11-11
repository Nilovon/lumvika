'use client'

import { useSession } from '@/lib/auth/session/SessionProvider'

// Who gets the template authoring surface in the builder: an expert account, and only while it is
// inside its sandbox.
export function useIsTemplateAuthor(): boolean {
    const { user, workspace } = useSession()
    return user?.account_role === 'expert' && workspace?.is_sandbox === true
}
