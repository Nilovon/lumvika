'use client'

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { useEffect } from 'react'

import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ThemePreference } from './theme-cookie'

// next-themes garde la préférence en localStorage, qui n'est pas partagé entre rerun.build et
// app.rerun.build. On la recopie dans un cookie de domaine parent : l'autre sous-domaine le reçoit
// comme `defaultTheme` à sa première visite, et le serveur peut poser la classe dès le SSR.
function ThemeCookieSync() {
    const { theme } = useTheme()

    useEffect(() => {
        if (!theme) return
        const parts = [`${THEME_COOKIE}=${theme}`, 'path=/', `max-age=${THEME_COOKIE_MAX_AGE}`, 'SameSite=Lax']
        if (window.location.hostname.endsWith('rerun.build')) parts.push('domain=.rerun.build')
        if (window.location.protocol === 'https:') parts.push('Secure')
        document.cookie = parts.join('; ')
    }, [theme])

    return null
}

// En local on travaille en dark : `system` renverrait au thème de l'OS, souvent light. `@rerun/ui`
// n'embarque pas @types/node ; Next inline le littéral au build de chaque app consommatrice.
declare const process: { env: Record<string, string | undefined> }

const DEFAULT_THEME: ThemePreference = process.env.NODE_ENV === 'development' ? 'dark' : 'system'

export function ThemeProvider({
    defaultTheme = DEFAULT_THEME,
    children,
}: {
    defaultTheme?: ThemePreference
    children: React.ReactNode
}) {
    return (
        <NextThemesProvider attribute="class" defaultTheme={defaultTheme} enableSystem disableTransitionOnChange>
            <ThemeCookieSync />
            {children}
        </NextThemesProvider>
    )
}
