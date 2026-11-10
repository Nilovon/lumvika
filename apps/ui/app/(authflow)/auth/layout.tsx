import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/AuthShell'
import { getTranslations } from 'next-intl/server'
import { SOURCE_REPO_URL } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('auth.page')
    return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function AuthFlowLayout({ children }: { children: React.ReactNode }) {
    const t = await getTranslations('auth.page')
    const about = await getTranslations('common.about')
    return (
        <div className="relative h-dvh w-full">
            <AuthShell title={t('title')} subtitle={t('subtitle')}>
                {children}
            </AuthShell>
            <a
                href={SOURCE_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-xs text-muted-foreground/70 underline-offset-4 hover:underline"
            >
                {about('source')}
            </a>
        </div>
    )
}
