type KeyLike = Pick<KeyboardEvent, 'code' | 'repeat' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'>

export type PushToTalkScene = {
    /** Something on the page holds the focus: a field would type the space, a button or a tile would be pressed by it. */
    focusHeld: boolean
    /** A dialog, a menu or a list is open over the board. */
    overlayOpen: boolean
}

/** Whether a key going down is Space held to talk, and not Space meant for anything else. */
export function shouldPushToTalk(event: KeyLike, scene: PushToTalkScene): boolean {
    if (event.code !== 'Space' || event.repeat || event.isComposing) return false
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
    return !scene.focusHeld && !scene.overlayOpen
}
