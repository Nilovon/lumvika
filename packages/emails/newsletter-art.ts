// The header of an issue, described rather than drawn: a generator (not part of this repository)
// turns one of these into the band served at /email/newsletter/<slug>.jpg. It should match the
// re-engagement scenes drawn by apps/ui/scripts/render-brand-art.mjs, so an issue header and a
// lifecycle banner read as the same family: only the hero pictogram, its satellites and the tilt
// change from one to the next.
//
// The hero has to be horizontal. The square-ish render is cut down to a wide band, and a portrait
// glyph comes out of it without its head and without its feet.
export interface NewsletterArt {
  /** How the hero is referred to in the rest of the prompt, so the sentences stay grammatical. */
  noun: string;
  hero: string;
  /** Five secondary pictograms from the same world, never abstract shapes. */
  satellites: string;
  tilt: string;
  /** The two uneven clusters the satellites fall into, so they never form a ring. */
  dense: string;
  sparse: string;
}

/** Keyed by issue slug: every issue in NEWSLETTERS declares its header here. */
export const NEWSLETTER_ART: Record<string, NewsletterArt> = {};
