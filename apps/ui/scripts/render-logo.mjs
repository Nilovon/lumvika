// Draws the Lumvika logo from one geometry and writes every file that carries it: the SVGs in
// branding/logo, apps/docs and apps/ui/app, the favicons and app icons, the email mark, the
// desktop wallpaper of the engine and the social preview image.
//
// The mark is an open orbit: a thick ring with a gap at the top right, a point of light (Amber)
// sitting in the gap on the ring's own line, and a core in the middle. In code it is one
// single-colour path, MARK_PATH in packages/ui/src/logo/Logo.tsx (and its copy in the mobile
// ProviderLogo); this script refuses to run when either disagrees with the geometry below.
//
// Run from apps/ui: node scripts/render-logo.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const INK = '#10201D'
const PAPER = '#F7F4EC'
const TEAL = '#0B6E63'
const MINT = '#7FDCCB'
const AMBER = '#F5A524'

// ---------------------------------------------------------------------------------------------
// The mark, in a 512 x 512 box.

const C = { x: 256, y: 252 }
const RING = 150 // radius of the ring's centre line
const WIDTH = 60 // thickness of the ring
const LIGHT = { angle: -52, r: 46 } // the point of light, on the ring's line
const CLEARANCE = 18 // air between the light and the ends of the ring
const CORE = 34

const round = (n) => Math.round(n * 10) / 10
const at = (radius, degrees) => {
    const a = (degrees * Math.PI) / 180
    return `${round(C.x + radius * Math.cos(a))} ${round(C.y + radius * Math.sin(a))}`
}
const circle = (x, y, r) => `M${round(x - r)} ${round(y)}A${r} ${r} 0 1 0 ${round(x + r)} ${round(y)}A${r} ${r} 0 1 0 ${round(x - r)} ${round(y)}Z`

const halfGap = ((LIGHT.r + CLEARANCE + WIDTH / 2) / RING) * (180 / Math.PI)
const start = LIGHT.angle + halfGap
const end = LIGHT.angle - halfGap + 360
const outer = RING + WIDTH / 2
const inner = RING - WIDTH / 2
const cap = WIDTH / 2

const RING_PATH = `M${at(outer, start)}A${outer} ${outer} 0 1 1 ${at(outer, end)}A${cap} ${cap} 0 0 1 ${at(inner, end)}A${inner} ${inner} 0 1 0 ${at(inner, start)}A${cap} ${cap} 0 0 1 ${at(outer, start)}Z`
const lightCentre = at(RING, LIGHT.angle).split(' ').map(Number)
const LIGHT_PATH = circle(lightCentre[0], lightCentre[1], LIGHT.r)
const CORE_PATH = circle(C.x, C.y, CORE)

export const MARK_PATH = RING_PATH + LIGHT_PATH + CORE_PATH

function mark({ ring, core, light }) {
    return `<path d="${RING_PATH}" fill="${ring}"/><path d="${CORE_PATH}" fill="${core}"/><path d="${LIGHT_PATH}" fill="${light}"/>`
}

// The mark scaled around the centre of the 512 box.
const scaled = (factor, body) => `<g transform="translate(${256 * (1 - factor)} ${256 * (1 - factor)}) scale(${factor})">${body}</g>`

// ---------------------------------------------------------------------------------------------
// The wordmark: lowercase, monoline, round ends, x-height 56 on a 100 unit line (ascenders from 0,
// baseline at 100). The l ends in a small foot, the a is a full bowl, the i carries the light.

const STROKE = 15
const LETTERS = [
    'M8 0V78A22 22 0 0 0 30 100', // l
    'M52 44V72A28 28 0 0 0 108 72V44M108 72V100', // u
    'M132 100V44M132 70A24 24 0 0 1 180 70V100M180 70A24 24 0 0 1 228 70V100', // m
    'M250 44L276 98L302 44', // v
    'M324 44V100', // i
    'M348 0V100M348 76L392 44M366 63L394 100', // k
    'M416 72A28 28 0 1 0 472 72A28 28 0 1 0 416 72M472 44V100', // a
]
const I_DOT = { x: 324, y: 16, r: 10 }
const LETTERS_WIDTH = 480

function wordmark(ink, { ring, core, light }) {
    // The mark sits on the height of the letters, the letters start right of it.
    const markScale = 0.3
    const letters = `<g fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${LETTERS.map((d) => `<path d="${d}"/>`).join('')}</g><circle cx="${I_DOT.x}" cy="${I_DOT.y}" r="${I_DOT.r}" fill="${light}"/>`
    const width = 150 + LETTERS_WIDTH + 12
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 124"><g transform="translate(-15 -13) scale(${markScale})">${mark({ ring, core, light })}</g><g transform="translate(150 12)">${letters}</g></svg>`
}

// ---------------------------------------------------------------------------------------------

const svg512 = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`

const ON_LIGHT = { ring: TEAL, core: TEAL, light: AMBER }
const ON_DARK = { ring: PAPER, core: MINT, light: AMBER }
const ON_TEAL = { ring: PAPER, core: MINT, light: AMBER }

const MARK_ON_LIGHT = svg512(mark(ON_LIGHT))
const MARK_ON_DARK = svg512(mark(ON_DARK))
const APP_ICON = svg512(`<rect width="512" height="512" rx="112" fill="${TEAL}"/>${scaled(0.78, mark(ON_TEAL))}`)
const FULL_BLEED = (factor) => svg512(`<rect width="512" height="512" fill="${TEAL}"/>${scaled(factor, mark(ON_TEAL))}`)
const WORDMARK_ON_LIGHT = wordmark(INK, ON_LIGHT)
const WORDMARK_ON_DARK = wordmark(PAPER, ON_DARK)

function backdrop(width, height) {
    return `<defs>
  <radialGradient id="glow" cx="${width * 0.78}" cy="${height * 0.18}" r="${width * 0.75}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#17594f"/>
    <stop offset="0.55" stop-color="#123b35"/>
    <stop offset="1" stop-color="#0f1f1c"/>
  </radialGradient>
</defs>
<rect width="${width}" height="${height}" fill="url(#glow)"/>`
}

const WALLPAPER = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${backdrop(1920, 1080)}
<g transform="translate(888 468) scale(0.28)" opacity="0.2"><path fill-rule="evenodd" fill="${PAPER}" d="${MARK_PATH}"/></g></svg>`

const OG_W = 2400
const OG_H = 1260
const OG_WORDMARK_W = 1640
const OG_WORDMARK_H = (OG_WORDMARK_W / 642) * 124
const OG_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">${backdrop(OG_W, OG_H)}
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
