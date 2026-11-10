'use client'

import { AttachmentLightbox } from '@/components/chat/AttachmentLightbox'
import { AttachmentTile } from '@/components/chat/AttachmentTile'
import type { ReadChatFile } from '@/components/chat/AttachmentLightbox'
import { MediaAlbum, isMediaAlbum } from '@/components/chat/MediaAlbum'
import { attachmentDisplayName } from '@/lib/chat/attachments-marker'
import { rawUrlResolver, type RawUrlFor } from '@/lib/files/raw-url'
import { cn } from '@/lib/utils'
import { useState } from 'react'

type MessageAttachmentsProps = {
    /** Absent on read-only transcripts rendered outside a Box: tiles then stay inert. */
    agentId?: string
    paths: readonly string[]
    /** Where the bytes come from when they are not a Box's: the steward's bucket, the design lab. */
    rawUrlFor?: RawUrlFor
    readFile?: ReadChatFile
    align?: 'start' | 'end'
    className?: string
}

/** Files the user sent with a message, shown as thumbnails above the bubble and opening in a lightbox. */
export function MessageAttachments({ agentId, paths, rawUrlFor, readFile, align = 'end', className }: MessageAttachmentsProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(null)
    const rawUrl = rawUrlResolver(agentId, rawUrlFor)
    const names = paths.map(attachmentDisplayName)

    return (
        <>
            {rawUrl && isMediaAlbum(names) ? (
                <MediaAlbum items={paths.map((path, index) => ({ path, name: names[index], src: rawUrl(path) }))} captions={false} align={align} onOpen={setOpenIndex} />
            ) : (
                <div className={cn('flex flex-wrap gap-1.5', align === 'end' ? 'justify-end' : 'justify-start', className)}>
                    {paths.map((path, index) => (
                        <AttachmentTile key={`${path}-${index}`} agentId={agentId} path={path} label={names[index]} rawUrlFor={rawUrlFor} onOpen={() => setOpenIndex(index)} />
                    ))}
                </div>
            )}
            {rawUrl && openIndex !== null && (
                <AttachmentLightbox agentId={agentId} paths={paths} index={openIndex} rawUrlFor={rawUrlFor} readFile={readFile} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
            )}
        </>
    )
}
