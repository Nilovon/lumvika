// The frame of the template card captured for a lifecycle email lives in the email package: the
// `<Img>` in the message and the screenshot asked for here have to state the same numbers, and the
// package that draws the message is the one that owns its column width.
export { EMAIL_CARD_BACKGROUND, EMAIL_CARD_HEIGHT, EMAIL_CARD_WIDTH } from '@lumvika/emails/card'

// Captured at 2x for the same reason as the cards above: the board inside the thumbnail is DOM and
// SVG blown up by a CSS scale.
export const EMAIL_CARD_SCALE = 2
