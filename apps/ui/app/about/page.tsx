import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SOURCE_REPO_URL } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('common.about')
    return { title: t('title') }
}

export default async function AboutPage() {
    const t = await getTranslations('common.about')
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 text-sm text-muted-foreground">
            <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
            <p>{t('license')}</p>
            <p>{t('upstream')}</p>
            <p>{t('warranty')}</p>
            <p className="flex gap-4">
                <a className="underline underline-offset-4" href={SOURCE_REPO_URL} target="_blank" rel="noopener noreferrer">
                    {t('source')}
                </a>
                <a className="underline underline-offset-4" href={`${SOURCE_REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
                    {t('licenseText')}
                </a>
            </p>
        </main>
    )
}
