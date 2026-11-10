import { describe, expect, it } from 'vitest'
import { detectInAppBrowser } from './in-app-browser'

const IOS_WEBVIEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

describe('detectInAppBrowser', () => {
    it.each([
        ['X on iOS without its own token', IOS_WEBVIEW, 'webview'],
        ['X announcing itself', `${IOS_WEBVIEW} Twitter for iPhone/10.60`, 'x'],
        ['Instagram on iOS', `${IOS_WEBVIEW} Instagram 350.0.0.25.94 (iPhone15,2; iOS 18_0; en_US; en; scale=3.00; 1179x2556)`, 'instagram'],
        ['Facebook on iOS', `${IOS_WEBVIEW} [FBAN/FBIOS;FBAV/480.0.0.40.108;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.0]`, 'facebook'],
        ['LinkedIn on iOS', `${IOS_WEBVIEW} LinkedInApp/9.30.1234`, 'linkedin'],
        ['TikTok on iOS', `${IOS_WEBVIEW} musical_ly_36.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en`, 'tiktok'],
        ['WhatsApp on Android', 'Mozilla/5.0 (Linux; Android 16; SM-A165F Build/BP4A.251205.006) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.8078.47 Mobile Safari/537.36 WA4A/2.26.41.77', 'whatsapp'],
        ['an Android WebView', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36', 'webview'],
    ])('flags %s', (_, userAgent, expected) => {
        expect(detectInAppBrowser(userAgent)).toBe(expected)
    })

    it.each([
        ['Safari on iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
        ['Chrome on iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1'],
        ['Firefox on iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15'],
        ['the Google app on iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.661068946 Mobile/15E148 Safari/604.1'],
        ['Chrome on Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.127 Mobile Safari/537.36'],
        ['Chrome on desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'],
        ['Safari on desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'],
        ['Firefox on desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0'],
    ])('leaves %s alone', (_, userAgent) => {
        expect(detectInAppBrowser(userAgent)).toBeNull()
    })
})
