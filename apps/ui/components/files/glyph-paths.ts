// Coordinates are raw pixels: `clip-path: path()` does not scale, so every glyph draws inside a
// fixed 64x64 box and the SVG stroke overlay reuses the very same strings.
export const GLYPH_SIZE = 64

// Proportions traced from the macOS folder: body 56 wide for 45 tall, an 8%-tall tab spanning
// the first 38% of the width, and a 2px lip of the back panel showing above the front.
export const FOLDER_BACK =
    'M4 13C4 11.34 5.34 10 7 10h14c.86 0 1.68.45 2.25 1.2l1.55 2.6c.57.75 1.39 1.2 2.25 1.2H55c2.76 0 5 2.24 5 5v30c0 2.76-2.24 5-5 5H9c-2.76 0-5-2.24-5-5V13Z'
// The front panel keeps square-ish top corners so the back reads as a crease line along the top
// edge, the way the macOS folder does, and not as a second card stacked on the first.
export const FOLDER_FRONT = 'M4 19c0-.83.67-1.5 1.5-1.5h53c.83 0 1.5.67 1.5 1.5v31c0 2.76-2.24 5-5 5H9c-2.76 0-5-2.24-5-5V19Z'

export const SHEET_BODY = 'M16 10c0-1.66 1.34-3 3-3h19l11 11v35c0 1.66-1.34 3-3 3H19c-1.66 0-3-1.34-3-3V10Z'
export const SHEET_FOLD = 'M38 7l11 11h-8c-1.66 0-3-1.34-3-3V7Z'
export const SHEET_FOLD_EDGE = 'M38 7v8c0 1.66 1.34 3 3 3h8'
