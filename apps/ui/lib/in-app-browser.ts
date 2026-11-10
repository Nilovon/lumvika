export type InAppBrowser = 'x' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'whatsapp' | 'webview'

const NAMED_IN_APP_BROWSERS: [RegExp, InAppBrowser][] = [
    [/Twitter/i, 'x'],
    [/Instagram/i, 'instagram'],
    [/FBAN|FBAV|FB_IAB/, 'facebook'],
    [/LinkedInApp/i, 'linkedin'],
    [/musical_ly|Bytedance|TikTok/i, 'tiktok'],
    // WhatsApp's Android browser drops the `; wv)` marker and keeps `Safari/`, so only its own token gives it away.
    [/WA4A|WhatsApp/i, 'whatsapp'],
]

// Google refuses OAuth inside embedded web views (403 disallowed_useragent). X on iOS does not
// always announce itself, so the catch-all is structural: every real Apple browser (Safari, Chrome,
// Firefox and Edge for iOS, the Google app, SFSafariViewController) carries a `Safari/` token that a
// bare WKWebView lacks, and Android marks its WebView with `; wv)`.
export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
    for (const [pattern, browser] of NAMED_IN_APP_BROWSERS) {
        if (pattern.test(userAgent)) return browser
    }
    if (/; wv\)/.test(userAgent)) return 'webview'
    if (/AppleWebKit/.test(userAgent) && !/Safari\//.test(userAgent)) return 'webview'
    return null
}

export type MobileOs = 'ios' | 'android'

export function detectMobileOs(userAgent: string): MobileOs | null {
    if (/Android/i.test(userAgent)) return 'android'
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
    return null
}
