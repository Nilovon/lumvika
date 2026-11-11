# Lumvika branding

## Name

Lumvika, said `LOOM-vee-kah`. Invented word, a nod to light (lumen).

## Logo

The mark is a stack of three square plates in isometric view, the top one in Lime: a platform with
the light on top. On light backgrounds the plates are Black with grey sides; on dark backgrounds and on
the black app icon they are White with grey sides. The single-colour version (`MARK_PATH`) shows the
sides of each plate as a solid band and lifts the top of the stack off its band by a thin line.

Every logo file below, plus the app icons, the favicons, the email mark, the social preview image and
the engine's desktop wallpaper, is drawn by `apps/ui/scripts/render-logo.mjs` (run it from `apps/ui`
with `node scripts/render-logo.mjs`).

| File | Use |
|---|---|
| `logo/mark-on-light.svg` | Mark on light backgrounds |
| `logo/mark-on-dark.svg` | Mark on dark backgrounds |
| `logo/wordmark-on-light.svg` | Mark and name on light backgrounds |
| `logo/wordmark-on-dark.svg` | Mark and name on dark backgrounds |
| `logo/app-icon.svg` | App icon on the black tile |
| `favicon/favicon.ico` | 16, 32 and 48 px |
| `favicon/favicon-{16,32,180,192,512}.png` | Browser, Apple touch and PWA icons |

The app's own copies live in `apps/ui/app`, `apps/ui/public`, `apps/docs` and `apps/mobile/assets`.
In code, the mark is `MARK_PATH` in `packages/ui/src/logo/Logo.tsx`, one single-colour path. The
copy in `apps/mobile/src/components/ui/ProviderLogo.tsx` must match it; the script refuses to run
when either no longer matches the geometry.

Keep clear space of at least the height of one plate around the mark.

## Colors

| Name | Hex | Use |
|---|---|---|
| Black | `#0A0A0A` | Logo, wordmark, app icon, and the ink on any Lime fill (`--brand-foreground`) |
| White | `#FFFFFF` | Logo and wordmark on dark |
| Lime | `#C6F432` | The brand. The top plate of the mark, the dot of the i, `--brand` and `--brand-text` in the dark theme |
| Lime fill | `#7FAF00` | `--brand` in the light theme: a fill (bubble, dot, bar) that still shows on white |
| Olive | `#4A6600` | `--brand-text` in the light theme: the brand as text or icon on white |
| Ink | `#10201D` | The characters' faces |
| Paper | `#F7F4EC` | The coworkers' window band |

A Lime fill always carries Black ink, never white. On mobile the same roles are `brand.soft`,
`brand.base`, `brand.deep` and `brand.ink` in `apps/mobile/src/theme/tokens.ts`.

## Type

The wordmark is drawn, not set: lowercase monoline letters with square ends, 17 units wide on a 56 unit
x-height, with no font needed to render it. The dot of the i is a Lime square.

The interface uses Instrument Sans, with IBM Plex Mono for code, as loaded in `apps/ui/app/layout.tsx`.
Instrument Sans is narrow and slightly squared, so dense panels and long German strings fit, and its
flat terminals sit next to the square-ended wordmark. IBM Plex Mono has the same square ends.

## Interface

The interface is built from the plates of the mark.

- Corners are tight: `--radius` is `0.375rem` in `packages/ui/src/theme.css`, and every other radius is
  a multiple of it. Round shapes are kept for avatars, the Steward and status dots.
- A filled button is a plate seen from the front: its bottom 2px show the side of the plate (the
  `--relief-*` tokens). No gloss, no glow.
- The floating blocks over the board (`packages/ui/src/chrome/ChromeSurface.tsx`) are plates with the
  one large shadow of the app, because they are the one thing that floats.
- A badge is a small plate with a thin ring in its tone. The ring glows only when a caller asks for it.
- Lime marks one thing per screen: the Steward, or the state that needs the eye. A Lime fill carries
  Black ink.

## Characters

**The Steward** is a drop of light: a round belly that rests on the floor and a soft tip pointing up.
It is filled with a radial gradient from near-white through Lime to a deep olive, and has a thin olive
outline. Its two pill eyes are drawn in Black, straight on the material, with no face plate and no
glow. Code: `packages/ui/src/steward/StewardBall.tsx` (the `glass` material, labelled Lumen, in
`steward-materials.ts`). The mobile port is in `apps/mobile/src/components/orb/StewardOrb.tsx`.

**Coworkers** are small lanterns: a cylinder standing on its tile with a light cap and a pale window
band around the wall.
- The face is drawn on the front of the band in flat Ink: eyes, sometimes a mouth.
- At rest, the cap wears the agent's own colour and the band is Paper.
- When working, broken or waiting, the cap and a pale tint of the band take the state colour: amber,
  red or cyan.
- Code: `packages/ui/src/iso-grid/components/buddy/BuddyArt.tsx` and `BuddyFace.tsx`. The mobile port
  is in `apps/mobile/src/components/buddy/`.

`apps/ui/public/email/board-sample.png` is a render of four lanterns for the email previews.

## Art

The rest of the artwork is flat SVG in the palette above, drawn and rendered by
`apps/ui/scripts/render-brand-art.mjs` (run it from `apps/ui` with `node scripts/render-brand-art.mjs`):

- `apps/ui/public/pricing/{solo,team,scale}.png`: the fallback workspace icons, shown cropped to a circle.
- `apps/ui/public/email/scene/*.jpg`: the band that opens every email about the account. One Lime
  pictogram with a white point of light over a soft olive light on black, faint pictograms around it, fading
  into the email card at the bottom.

File names, sizes and formats stay fixed, because workspace rows and sent emails point at them. Bump
`ART_VERSION` in `packages/emails/assets.ts` after changing a scene.
