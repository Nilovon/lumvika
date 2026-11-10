export type MessageStreamAnimation = {
    animation: 'fadeIn' | 'blurIn' | 'slideUp'
    duration: number
    easing: string
    sep: 'word' | 'char'
    stagger: number
}

/**
 * How a streaming answer lands on screen: every new word resolves out of a blur on
 * its own, a CSS keyframe per word.
 * Streamdown rebuilds its rehype plugin whenever this object's identity changes,
 * so it stays a module constant.
 *
 * `stagger` stays at 0 until streamdown is past 2.5.0: its animate plugin tracks what
 * is already on screen with a single char counter handed from block to block, so a
 * re-flow of the markdown (pipe rows becoming a table, a paragraph becoming a list
 * item) replays words that were already readable. Spread over a stagger that replay
 * crawls across the paragraph; at 0 it is one flash, far less visible.
 */
export const MESSAGE_STREAM_ANIMATION: MessageStreamAnimation = {
    animation: 'blurIn',
    duration: 120,
    easing: 'ease-out',
    sep: 'word',
    stagger: 0,
}
