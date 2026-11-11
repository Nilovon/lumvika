'use client'

import { lazy, Suspense } from 'react'

const NotificationMarkdown = lazy(() => import('./NotificationMarkdown'))

// The markdown renderer and its plugins weigh far more than the rest of the home screen's
// notification code, so they load with the first notification and the raw text shows meanwhile.
export function LazyNotificationMarkdown({ message }: { message: string }) {
    return (
        <Suspense fallback={<p className="whitespace-pre-wrap">{message}</p>}>
            <NotificationMarkdown message={message} />
        </Suspense>
    )
}
