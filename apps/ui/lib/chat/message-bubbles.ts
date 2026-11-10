import { bubblesOfBlocks, type MessageBubble } from '@lumvika/contracts'
import { parseMarkdownIntoBlocks } from 'streamdown'

export type { BubbleFrame, MessageBubble } from '@lumvika/contracts'

export function splitIntoBubbles(markdown: string): MessageBubble[] {
    return bubblesOfBlocks(parseMarkdownIntoBlocks(markdown))
}
