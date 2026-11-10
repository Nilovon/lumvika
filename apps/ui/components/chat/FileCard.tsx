'use client'

import { readWorkspaceFileAction } from '@/app/api/_actions/workspace-file.actions'
import { AttachmentLightbox, type ReadChatFile } from '@/components/chat/AttachmentLightbox'
import { AttachmentTile } from '@/components/chat/AttachmentTile'
import { MediaAlbum, isMediaAlbum, type MediaAlbumItem } from '@/components/chat/MediaAlbum'
import { rawUrlResolver, sharedFileRawUrl, type RawUrlFor } from '@/lib/files/raw-url'
import type { FileCard as FileCardData, FileCardEntry } from '@lumvika/contracts'
import { useState } from 'react'

type FileCardProps = {
    /** Absent on read-only transcripts rendered outside a Box: the tiles stay inert. */
    agentId?: string
    card: FileCardData
    /** Where the bytes come from when they are not a Box's: the steward's bucket, the design lab. */
    rawUrlFor?: RawUrlFor
    readFile?: ReadChatFile
    /** Where the shared space is read from when `rawUrlFor` stands for one agent's files only: the steward on its engine. */
    sharedFiles?: FileAccess
}

export type FileAccess = { rawUrlFor?: RawUrlFor; readFile?: ReadChatFile }

/**
 * Files the agent chose to show, as the same tiles a user attachment gets, opening the same
 * lightbox. Images and videos read as an album, so the user can compare the candidates of a choice. The
 * names come from the engine: `attachmentDisplayName` would eat the head of a legitimate file name
 * that happens to look like the composer's uniqueness prefix.
 */
export function FileCard({ agentId, card, rawUrlFor, readFile, sharedFiles }: FileCardProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(null)
    const { files } = card
    const accessOf = (file: FileCardEntry): FileAccess =>
        file.scope === 'shared' ? (sharedFiles ?? { rawUrlFor: rawUrlFor ?? (agentId ? sharedFileRawUrl : undefined), readFile: readFile ?? readWorkspaceFileAction }) : { rawUrlFor, readFile }
    const reachable = (file: FileCardEntry) => rawUrlResolver(agentId, accessOf(file).rawUrlFor) !== null
    const albumItems = isMediaAlbum(files.map(file => file.name))
        ? files.flatMap((file): MediaAlbumItem[] => {
              const rawUrl = rawUrlResolver(agentId, accessOf(file).rawUrlFor)
              return rawUrl ? [{ path: file.path, name: file.name, src: rawUrl(file.path) }] : []
          })
        : []
    const opened = openIndex === null ? null : files[openIndex]

    return (
        <>
            {albumItems.length === files.length ? (
                <MediaAlbum items={albumItems} captions onOpen={setOpenIndex} />
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {files.map((file, index) => (
                        <AttachmentTile
                            key={`${index}:${file.path}`}
                            agentId={agentId}
                            path={file.path}
                            label={file.name}
                            rawUrlFor={accessOf(file).rawUrlFor}
                            onOpen={() => setOpenIndex(index)}
                            standalone={files.length === 1}
                        />
                    ))}
                </div>
            )}
            {opened && openIndex !== null && reachable(opened) && (
                <AttachmentLightbox
                    agentId={agentId}
                    paths={files.map(file => file.path)}
                    names={files.map(file => file.name)}
                    index={openIndex}
                    {...accessOf(opened)}
                    onIndexChange={setOpenIndex}
                    onClose={() => setOpenIndex(null)}
                />
            )}
        </>
    )
}
