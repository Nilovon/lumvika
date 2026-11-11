'use client'

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { Streamdown } from 'streamdown'

const streamdownPlugins = { cjk, code, math, mermaid }

export default function NotificationMarkdown({ message }: { message: string }) {
    return <Streamdown plugins={streamdownPlugins}>{message}</Streamdown>
}
