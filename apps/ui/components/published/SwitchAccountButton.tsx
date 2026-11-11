'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth/auth-client'

export function SwitchAccountButton({ returnTo }: { returnTo: string }) {
    const t = useTranslations('published.gate')
    const [loading, setLoading] = useState(false)

    const switchAccount = async () => {
        setLoading(true)
        await authClient.signOut()
        window.location.href = `/auth?next=${encodeURIComponent(returnTo)}`
    }

    return (
        <Button variant="outline" size="lg" onClick={switchAccount} loading={loading}>
            {t('switchAccount')}
        </Button>
    )
}
