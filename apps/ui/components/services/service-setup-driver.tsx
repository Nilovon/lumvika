'use client'

import { getServiceDetailsAction, installServiceAction, markServiceAuthorizedAction, resetServiceConnectionAction } from '@/app/api/_actions/services.actions'
import { createContext, useContext } from 'react'

export type ServiceSetupDriver = {
    details: typeof getServiceDetailsAction
    install: typeof installServiceAction
    markAuthorized: typeof markServiceAuthorizedAction
    reset: typeof resetServiceConnectionAction
}

const SERVER_DRIVER: ServiceSetupDriver = {
    details: getServiceDetailsAction,
    install: installServiceAction,
    markAuthorized: markServiceAuthorizedAction,
    reset: resetServiceConnectionAction,
}

const ServiceSetupDriverContext = createContext<ServiceSetupDriver>(SERVER_DRIVER)

// Only the labs provide one, to walk the setup card end to end without an engine behind it.
export const ServiceSetupDriverProvider = ServiceSetupDriverContext.Provider

export function useServiceSetupDriver(): ServiceSetupDriver {
    return useContext(ServiceSetupDriverContext)
}
