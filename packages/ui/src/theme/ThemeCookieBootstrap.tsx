import { THEME_COOKIE, THEME_STORAGE_KEY } from './theme-cookie'

// Amorce le localStorage de next-themes depuis le cookie partagé, pour qu'une première visite sur
// l'autre sous-domaine hérite du thème déjà choisi. Doit être rendu AVANT <ThemeProvider> : les deux
// scripts sont inline et s'exécutent dans l'ordre du document, celui de next-themes lit le
// localStorage juste après. Cette variante n'appelle pas `cookies()`, donc les pages restent
// statiques (la landing en dépend pour son SEO).
const SCRIPT = `try{var k=${JSON.stringify(THEME_STORAGE_KEY)};if(!localStorage.getItem(k)){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);if(m)localStorage.setItem(k,decodeURIComponent(m[1]))}}catch(e){}`

export function ThemeCookieBootstrap() {
    return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
