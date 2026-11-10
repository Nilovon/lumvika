import { rememberAttribution } from '@rerun/analytics/client'
import { analyticsAllowed, detectConsentStatus } from '@rerun/contracts'
import { isAnalyticsSurface, startAppAnalytics, startAppSessionReplay } from '@/lib/analytics'

rememberAttribution()

if (isAnalyticsSurface()) {
    if (analyticsAllowed(detectConsentStatus())) startAppAnalytics()
    else startAppSessionReplay()
}
