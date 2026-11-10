'use client'

import * as React from 'react'
import type { TemplateBrief } from '@/lib/templates/describe'
import type { TemplateImageFolder } from '@/lib/templates/images'
import type { AltTextResult, ContentPrefillResult, FaqPrefillResult, MetaPrefillResult, UploadResult } from '@/lib/templates/authoring'

// The same seam as CaptureActions: the editorial sections are mounted twice, once in the admin
// editor and once in the author panel, and the only difference is which server actions they call.
// Injecting them keeps a single set of components instead of one per surface.
export type TemplateAuthoringActions = {
    uploadImage: (formData: FormData, folder: TemplateImageFolder) => Promise<UploadResult>
    prefillContent: (brief: TemplateBrief) => Promise<ContentPrefillResult>
    prefillMeta: (brief: TemplateBrief) => Promise<MetaPrefillResult>
    prefillFaq: (input: { brief: TemplateBrief; longDescription: string }) => Promise<FaqPrefillResult>
    prefillAltText: (input: { brief: TemplateBrief; imageUrl: string; isCover: boolean }) => Promise<AltTextResult>
}

// An author owns the copy of their template, we own its URL and its social card. Rather than
// splitting two cards in two, the sections hide those two fields on the author surface.
export type TemplateAuthoringScope = 'admin' | 'author'

// Whether the author's Stripe account can receive payouts. Carried here rather than drilled four
// levels down, so the pricing section can warn without every section in between knowing about it.
// Always true on the admin surface: the admin is not the one being paid.
type TemplateAuthoringContext = { scope: TemplateAuthoringScope; actions: TemplateAuthoringActions; payoutsReady: boolean }

const Context = React.createContext<TemplateAuthoringContext | null>(null)

type ProviderProps = Omit<TemplateAuthoringContext, 'payoutsReady'> & { payoutsReady?: boolean; children: React.ReactNode }

export function TemplateAuthoringProvider({ scope, actions, payoutsReady = true, children }: ProviderProps) {
    const value = React.useMemo(() => ({ scope, actions, payoutsReady }), [scope, actions, payoutsReady])
    return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useTemplateAuthoring(): TemplateAuthoringContext {
    const context = React.useContext(Context)
    if (!context) throw new Error('Template authoring sections must be mounted inside a TemplateAuthoringProvider')
    return context
}
