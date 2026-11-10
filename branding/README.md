# Lumvika branding

## Name

Lumvika, said `LOOM-vee-kah`. Invented word, a nod to light (lumen).

## Logo

The mark is an upright L with a point of light beside it.

| File | Use |
|---|---|
| `logo/mark-on-light.svg` | Mark on light backgrounds |
| `logo/mark-on-dark.svg` | Mark on dark backgrounds |
| `logo/wordmark-on-light.svg` | Mark and name on light backgrounds |
| `logo/wordmark-on-dark.svg` | Mark and name on dark backgrounds |
| `logo/app-icon.svg` | App icon on the teal tile |
| `favicon/favicon.ico` | 16, 32 and 48 px |
| `favicon/favicon-{16,32,180,192,512}.png` | Browser, Apple touch and PWA icons |

The app's own copies live in `apps/ui/app`, `apps/ui/public`, `apps/docs` and `apps/mobile/assets`.
In code, the mark is `MARK_PATH` in `packages/ui/src/logo/Logo.tsx`.

Keep clear space of at least the diameter of the point around the mark.

## Colors

| Name | Hex | Use |
|---|---|---|
| Ink | `#10201D` | Text and mark on light |
| Paper | `#F7F4EC` | Text and mark on dark |
| Teal | `#0B6E63` | Brand color, `--brand` in the app |
| Mint | `#7FDCCB` | Brand color as text on dark, `--brand-text` |
| Amber | `#F5A524` | The point of light, sparing accents |

## Type

The wordmark is drawn, not set: monoline geometric letters with round ends, 13 units wide on a 60 unit
x-height, with no font needed to render it.

The interface uses Inter and Geist, with Geist Mono for code, as loaded in `apps/ui/app/layout.tsx`.
