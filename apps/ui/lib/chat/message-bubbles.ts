import { bubblesOfBlocks, type MessageBubble } from '@rerun/contracts'
import { parseMarkdownIntoBlocks } from 'streamdown'

export type { BubbleFrame, MessageBubble } from '@rerun/contracts'

export function splitIntoBubbles(markdown: string): MessageBubble[] {
    return bubblesOfBlocks(parseMarkdownIntoBlocks(markdown))
}
