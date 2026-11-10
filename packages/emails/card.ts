import { theme } from "./theme";

// The frame of the template card captured for a lifecycle email. The width is the usable column of
// a message: the container is 520 wide and holds 32px of padding on each side.
//
// The height is pinned rather than derived, because a screenshot is a viewport and a viewport is a
// number. It is the height the card measures at that width (320.89: the board at 1200/630, the two
// lines under it and the byline), rounded up so the last line is never clipped. What is left over
// is a fraction of a pixel of the background below, which is the surface of the email itself. The
// card holds that height whatever its title does: both lines are cut at one, never wrapped.
export const EMAIL_CARD_WIDTH = 456;
export const EMAIL_CARD_HEIGHT = 321;

// The capture is taken on the surface of the email card itself: the words of the card have no box
// of their own, so they sit on the message exactly as they sit on the library.
export const EMAIL_CARD_BACKGROUND = theme.surface.card;
