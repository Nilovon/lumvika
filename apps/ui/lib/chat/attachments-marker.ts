import { uniqueAttachmentName as uniqueName } from '@lumvika/contracts'
import { nanoid } from 'nanoid'

export { appendAttachmentsRef, attachmentDisplayName, buildAttachmentsRef, CHAT_ATTACHMENTS_DIR, parseAttachments, stripAttachmentsRef } from '@lumvika/contracts'

export function uniqueAttachmentName(file: File): string {
    return uniqueName(file.name, nanoid(6))
}
