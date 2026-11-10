import type { ComposerMention } from '@/lib/chat/composer-links'

// On the user's sent bubble (`data-ink`), brand lime in both themes, a token keeps its hue in the
// deep 800 shade, the pale dark-theme ones would vanish on the lime.
export const MENTION_TOKEN_CLASSES: Record<ComposerMention['kind'], string> = {
    agent: 'text-violet-700 dark:text-violet-300 in-data-ink:text-violet-800!',
    skill: 'text-amber-700 dark:text-amber-300 in-data-ink:text-amber-800!',
}

export const LINK_TOKEN_CLASS = 'text-cyan-700 dark:text-cyan-300 in-data-ink:text-cyan-800!'
