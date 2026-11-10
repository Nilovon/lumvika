import { rememberAttribution } from '@lumvika/analytics/client'
import { analyticsAllowed, detectConsentStatus } from '@lumvika/contracts'
import { isAnalyticsSurface, startAppAnalytics, startAppSessionReplay } from '@/lib/analytics'

rememberAttribution()

if (isAnalyticsSurface()) {
    if (analyticsAllowed(detectConsentStatus())) startAppAnalytics()
    else startAppSessionReplay()
}
