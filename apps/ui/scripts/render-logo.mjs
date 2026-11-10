// Draws the Lumvika logo from one geometry and writes every file that carries it: the SVGs in
// branding/logo, apps/docs and apps/ui/app, the favicons and app icons, the email mark, the
// desktop wallpaper of the engine and the social preview image.
//
// The mark is a stack of three square plates seen in isometric view, the top one in Lime: the
// platform, and the light on top of it. In colour every plate shows its top and two sides. In
// code it is one single-colour path, MARK_PATH in packages/ui/src/logo/Logo.tsx (and its copy in
// the mobile ProviderLogo): there the sides of each plate are a solid band, the gaps between the
// plates are left open and the top of the stack is lifted off its band by a thin line. This
// script refuses to run when either copy disagrees with the geometry below.
//
// Run from apps/ui: node scripts/render-logo.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const BLACK = '#0A0A0A'
const WHITE = '#FFFFFF'
const LIME = '#C6F432'

// Faces of a plate: top, left side, right side.
const ON_LIGHT = { top: '#4A4A4A', left: BLACK, right: '#262626' }
const ON_DARK = { top: WHITE, left: '#D4D4D4', right: '#8A8A8A' }
const LIGHT = { top: LIME, left: '#9DC41F', right: '#7A9A12' }

// ---------------------------------------------------------------------------------------------
// The mark, in a 512 x 512 box. Plates span -1.6..1.6 on both floor axes.

const HALF = 1.6
const THICK = 0.62
const LEVELS = [0, 1.25, 2.5]
const SCALE = 4.46
const round = (n) => Math.round(n * 10) / 10
// Isometric projection, centred on the box.
const P = (x, y, z) => [round(256 + (x - y) * 13.5 * SCALE), round(256 + ((x + y) * 7.8 - z * 15.6 + 24.32) * SCALE)]
const poly = (points) => `M${points.map((p) => p.join(' ')).join('L')}Z`

const top = (z) => [P(-HALF, -HALF, z), P(HALF, -HALF, z), P(HALF, HALF, z), P(-HALF, HALF, z)]
const leftFace = (z) => [P(-HALF, HALF, z), P(HALF, HALF, z), P(HALF, HALF, z + THICK), P(-HALF, HALF, z + THICK)]
const rightFace = (z) => [P(HALF, -HALF, z), P(HALF, HALF, z), P(HALF, HALF, z + THICK), P(HALF, -HALF, z + THICK)]
// Both sides of a plate as one band.
const band = (z) => [P(-HALF, HALF, z + THICK), P(-HALF, HALF, z), P(HALF, HALF, z), P(HALF, -HALF, z), P(HALF, -HALF, z + THICK), P(HALF, HALF, z + THICK)]

// Single colour: three bands, and the top of the stack lifted off its band by a thin line.
const LIFT = 0.16
export const MARK_PATH = LEVELS.map((z) => poly(band(z))).join('') + poly(top(LEVELS[2] + THICK + LIFT))

function plate(z, faces) {
    return `<path d="${poly(leftFace(z))}" fill="${faces.left}"/><path d="${poly(rightFace(z))}" fill="${faces.right}"/><path d="${poly(top(z + THICK))}" fill="${faces.top}"/>`
}

function mark(faces) {
    return LEVELS.map((z, i) => plate(z, i === LEVELS.length - 1 ? LIGHT : faces)).join('')
}

// The mark scaled around the centre of the 512 box.
const scaled = (factor, body) => `<g transform="translate(${256 * (1 - factor)} ${256 * (1 - factor)}) scale(${factor})">${body}</g>`

// ---------------------------------------------------------------------------------------------
// The wordmark: lowercase, monoline, square ends, x-height 56 on a 100 unit line (ascenders from 0,
// baseline at 100). The dot of the i is a Lime square.

const STROKE = 17
const LETTERS = [
    'M8 0V100', // l
    'M40 44V72A28 28 0 0 0 96 72V44M96 44V100', // u
    'M122 100V44M122 70A24 24 0 0 1 170 70V100M170 70A24 24 0 0 1 218 70V100', // m
    'M238 44L264 100L290 44', // v
    'M314 44V100', // i
    'M342 0V100M342 78L386 44M362 64L392 100', // k
    'M416 72A28 28 0 1 0 472 72A28 28 0 1 0 416 72M472 44V100', // a
]
const I_DOT = { x: 314 - STROKE / 2, y: 6, size: STROKE }
const WORD_W = 640
const WORD_H = 120

function wordmark(ink, faces) {
    const letters = `<g fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="miter">${LETTERS.map((d) => `<path d="${d}"/>`).join('')}</g><rect x="${I_DOT.x}" y="${I_DOT.y}" width="${I_DOT.size}" height="${I_DOT.size}" fill="${LIME}"/>`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORD_W} ${WORD_H}"><g transform="translate(-4 2) scale(0.226)">${mark(faces)}</g><g transform="translate(150 12)">${letters}</g></svg>`
}

// ---------------------------------------------------------------------------------------------

const svg512 = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`

const MARK_ON_LIGHT = svg512(mark(ON_LIGHT))
const MARK_ON_DARK = svg512(mark(ON_DARK))
const APP_ICON = svg512(`<rect width="512" height="512" rx="112" fill="${BLACK}"/>${scaled(0.72, mark(ON_DARK))}`)
const FULL_BLEED = (factor) => svg512(`<rect width="512" height="512" fill="${BLACK}"/>${scaled(factor, mark(ON_DARK))}`)
const WORDMARK_ON_LIGHT = wordmark(BLACK, ON_LIGHT)
const WORDMARK_ON_DARK = wordmark(WHITE, ON_DARK)

// Black with a faint grid, fading out from the middle.
function backdrop(width, height, cell) {
    return `<defs>
  <pattern id="grid" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse"><path d="M${cell} 0H0V${cell}" fill="none" stroke="${WHITE}" stroke-width="1.5"/></pattern>
  <radialGradient id="fade" cx="${width / 2}" cy="${height / 2}" r="${width * 0.6}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${WHITE}"/><stop offset="1" stop-color="${WHITE}" stop-opacity="0"/></radialGradient>
  <mask id="fadeMask"><rect width="${width}" height="${height}" fill="url(#fade)"/></mask>
</defs>
<rect width="${width}" height="${height}" fill="${BLACK}"/>
<rect width="${width}" height="${height}" fill="url(#grid)" mask="url(#fadeMask)" opacity="0.07"/>`
}

const WALLPAPER = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${backdrop(1920, 1080, 64)}
<g transform="translate(888 468) scale(0.28)" opacity="0.22"><path fill="${WHITE}" d="${MARK_PATH}"/></g></svg>`

const OG_W = 2400
const OG_H = 1260
const OG_WORDMARK_W = 1600
const OG_WORDMARK_H = (OG_WORDMARK_W / WORD_W) * WORD_H
const OG_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">${backdrop(OG_W, OG_H, 80)}
<svg x="${(OG_W - OG_WORDMARK_W) / 2}" y="${(OG_H - OG_WORDMARK_H) / 2}" width="${OG_WORDMARK_W}" height="${OG_WORDMARK_H}" ${WORDMARK_ON_DARK.slice(5)}</svg>`

// ---------------------------------------------------------------------------------------------

const path = (p) => join(ROOT, p)

async function text(p, content) {
    await mkdir(dirname(path(p)), { recursive: true })
    await writeFile(path(p), content + '\n')
    console.log(p)
}

async function png(p, svg, size) {
    const [w, h] = Array.isArray(size) ? size : [size, size]
    const out = await sharp(Buffer.from(svg), { density: 300 }).resize(w, h).png({ compressionLevel: 9 }).toBuffer()
    await mkdir(dirname(path(p)), { recursive: true })
    await writeFile(path(p), out)
    console.log(`${p}  ${w}x${h}`)
    return out
}

// An .ico is a small directory of PNG images.
async function ico(p, svg, sizes) {
    const images = await Promise.all(sizes.map((s) => sharp(Buffer.from(svg), { density: 300 }).resize(s, s).png().toBuffer()))
    const header = Buffer.alloc(6 + 16 * images.length)
    header.writeUInt16LE(0, 0)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(images.length, 4)
    let offset = header.length
    images.forEach((image, i) => {
        const entry = 6 + 16 * i
        header.writeUInt8(sizes[i] % 256, entry)
        header.writeUInt8(sizes[i] % 256, entry + 1)
        header.writeUInt16LE(1, entry + 4)
        header.writeUInt16LE(32, entry + 6)
        header.writeUInt32LE(image.length, entry + 8)
        header.writeUInt32LE(offset, entry + 12)
        offset += image.length
    })
    await writeFile(path(p), Buffer.concat([header, ...images]))
    console.log(`${p}  ${sizes.join(', ')}`)
}

for (const file of ['packages/ui/src/logo/Logo.tsx', 'apps/mobile/src/components/ui/ProviderLogo.tsx']) {
    if (!(await readFile(path(file), 'utf8')).includes(`'${MARK_PATH}'`)) {
        console.error(`MARK_PATH in ${file} is out of date. It should be:\n'${MARK_PATH}'`)
        process.exit(1)
    }
}

await text('branding/logo/mark-on-light.svg', MARK_ON_LIGHT)
await text('branding/logo/mark-on-dark.svg', MARK_ON_DARK)
await text('branding/logo/app-icon.svg', APP_ICON)
await text('branding/logo/wordmark-on-light.svg', WORDMARK_ON_LIGHT)
await text('branding/logo/wordmark-on-dark.svg', WORDMARK_ON_DARK)
await text('apps/docs/favicon.svg', APP_ICON)
await text('apps/docs/logo/light.svg', WORDMARK_ON_LIGHT)
await text('apps/docs/logo/dark.svg', WORDMARK_ON_DARK)
await text('apps/ui/app/icon.svg', APP_ICON)

for (const size of [16, 32, 180, 192, 512]) await png(`branding/favicon/favicon-${size}.png`, APP_ICON, size)
await ico('branding/favicon/favicon.ico', APP_ICON, [16, 32, 48])
await ico('apps/ui/app/favicon.ico', APP_ICON, [16, 32, 48])
await png('apps/ui/app/apple-icon.png', APP_ICON, 180)
await png('apps/ui/public/icon-192.png', APP_ICON, 192)
await png('apps/ui/public/icon-512.png', APP_ICON, 512)
// Android crops a maskable icon to a circle of 80%, so the mark stays inside it.
await png('apps/ui/public/icon-maskable-512.png', FULL_BLEED(0.62), 512)
// iOS and Android round the corners themselves.
await png('apps/mobile/assets/images/icon.png', FULL_BLEED(0.74), 1024)
// The mark old emails point at: light on the dark card, no tile.
await png('apps/ui/public/email/logo.png', MARK_ON_DARK, 512)
await png('apps/engine/assets/desktop/wallpaper.png', WALLPAPER, [1920, 1080])
await png('apps/ui/public/og-image.png', OG_IMAGE, [OG_W, OG_H])
