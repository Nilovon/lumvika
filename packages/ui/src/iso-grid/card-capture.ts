// The template card thumbnail: the isogrid board alone, at the frame every template card already
// uses. These captures are stored on the template row rather than served on demand, so changing
// anything here leaves every existing thumbnail wrong until « Régénérer toutes les vignettes » is
// pressed in /admin/template-cards. The live board a card swaps in under the cursor is laid out at
// these exact numbers too, which is why they live beside it rather than in the capturing app.
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

// The board gets the whole frame here, with no column of text beside it, so it is pushed well past
// the ceiling TemplateBoardPreview uses by default. Most templates ship a single agent and two or
// three connectors: at 1.8 those few tiles float in an empty grid. An isometric board is twice as
// wide as it is tall, so the fit is width-bound in this frame and the ceiling scales with the width.
export const CARD_MAX_ZOOM = 4.8
