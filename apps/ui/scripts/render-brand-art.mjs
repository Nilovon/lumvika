// Draws Lumvika's own flat artwork and writes it into public/:
//
//   public/pricing/{solo,team,scale}.png   the fallback workspace icons (shown cropped to a circle)
//   public/email/scene/<scene>.jpg         the band that opens every email about the account
//
// Everything is plain SVG in the brand palette (branding/README.md), rendered by sharp. No text is
// drawn, so the result does not depend on the fonts installed on the machine that runs it.
// File names, sizes and formats are fixed: workspace rows and sent emails already point at them.
// Bump ART_VERSION in packages/emails/assets.ts after changing a scene.
//
// Run from apps/ui: node scripts/render-brand-art.mjs

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BLACK = '#0A0A0A'
const WHITE = '#FFFFFF'
const LIME = '#C6F432'
const OLIVE = '#4A6600'
// The email card the scene sits on (packages/emails/theme.ts): the band fades into it.
const CARD = '#171717'

// ---------------------------------------------------------------------------------------------
// Glyphs, each drawn in a 100 x 100 box. `line` is the stroke colour, `accent` the point of light.

const stroke = (line, width = 6) => `fill="none" stroke="${line}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`

function sparklePath(cx, cy, r) {
    const k = r * 0.18
    return `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z`
}

const GLYPHS = {
    person: (line) => `<circle cx="50" cy="31" r="17" ${stroke(line)}/><path d="M17 88 C17 66 31 55 50 55 C69 55 83 66 83 88 Z" ${stroke(line)}/>`,
    personPlus: (line, accent) =>
        `<circle cx="40" cy="31" r="16" ${stroke(line)}/><path d="M10 86 C10 65 23 55 40 55 C57 55 70 65 70 86 Z" ${stroke(line)}/>` +
        `<path d="M82 30 V58 M68 44 H96" ${stroke(accent, 7)}/>`,
    envelope: (line, accent) =>
        `<rect x="10" y="24" width="80" height="56" rx="9" ${stroke(line)}/><path d="M13 29 L50 56 L87 29" ${stroke(line)}/>` +
        `<circle cx="86" cy="22" r="8" fill="${accent}"/>`,
    loop: (line, accent) =>
        `<path d="M80 48 A30 30 0 1 1 68 25" ${stroke(line)}/><path d="M66 10 L70 26 L54 30" ${stroke(line)}/>` +
        `<circle cx="50" cy="50" r="7" fill="${accent}"/>`,
    moon: (line, accent) =>
        `<path d="M58 18 A33 33 0 1 0 84 64 A27 27 0 1 1 58 18 Z" ${stroke(line)}/>` +
        `<path d="M70 12 H84 L70 26 H84" ${stroke(accent, 4.5)}/>`,
    flag: (line, accent) =>
        `<path d="M26 90 V12" ${stroke(line)}/><path d="M26 15 H76 L64 32 L76 49 H26" ${stroke(line)}/>` +
        `<circle cx="26" cy="90" r="6" fill="${accent}"/>`,
    sparkles: (line, accent) =>
        `<path d="${sparklePath(42, 54, 34)}" ${stroke(line)}/><path d="${sparklePath(78, 22, 13)}" fill="${accent}"/>` +
        `<path d="${sparklePath(80, 76, 8)}" ${stroke(line, 4)}/>`,
    megaphone: (line, accent) =>
        `<path d="M14 40 H30 L70 18 V82 L30 60 H14 Z" ${stroke(line)}/><path d="M30 60 L36 84 H46 L42 62" ${stroke(line)}/>` +
        `<path d="M82 38 Q90 50 82 62" ${stroke(accent, 6)}/>`,
    sunrise: (line, accent) =>
        `<path d="M26 70 A24 24 0 0 1 74 70 Z" fill="${accent}"/><path d="M8 70 H92 M24 84 H76" ${stroke(line)}/>` +
        `<path d="M50 18 V30 M20 32 L28 41 M80 32 L72 41 M8 52 H18 M82 52 H92" ${stroke(line)}/>`,
    hourglassHalf: (line, accent) =>
        `<path d="M39 34 H61 L50 47 Z M34 84 C40 74 60 74 66 84 Z" fill="${accent}"/>` +
        `<path d="M24 12 H76 M24 88 H76 M32 12 C32 36 48 42 48 50 C48 58 32 64 32 88 M68 12 C68 36 52 42 52 50 C52 58 68 64 68 88" ${stroke(line)}/>`,
    hourglassEmpty: (line, accent) =>
        `<path d="M34 86 C34 70 66 70 66 86 Z" fill="${accent}"/>` +
        `<path d="M24 12 H76 M24 88 H76 M32 12 C32 36 48 42 48 50 C48 58 32 64 32 88 M68 12 C68 36 52 42 52 50 C52 58 68 64 68 88" ${stroke(line)}/>`,
    calendar: (line, accent) =>
        `<rect x="12" y="20" width="76" height="68" rx="9" ${stroke(line)}/><path d="M12 40 H88 M32 10 V28 M68 10 V28" ${stroke(line)}/>` +
        [30, 50, 70].flatMap((x) => [56, 74].map((y) => (x === 70 && y === 74 ? `<circle cx="${x}" cy="${y}" r="7" fill="${accent}"/>` : `<circle cx="${x}" cy="${y}" r="4" fill="${line}"/>`))).join(''),
    gauge: (line, accent) =>
        `<path d="M12 72 A38 38 0 0 1 88 72" ${stroke(line)}/><path d="M50 72 L22 62" ${stroke(line)}/>` +
        `<path d="M24 40 L28 44 M50 30 V36 M76 40 L72 44" ${stroke(line, 5)}/><circle cx="50" cy="72" r="8" fill="${accent}"/>`,
    clock: (line) => `<circle cx="50" cy="50" r="36" ${stroke(line)}/><path d="M50 28 V50 L64 60" ${stroke(line)}/>`,
    check: (line) => `<path d="M22 52 L42 72 L78 30" ${stroke(line, 7)}/>`,
    star: (line) => `<path d="M50 12 L61 37 L88 39 L67 57 L74 84 L50 69 L26 84 L33 57 L12 39 L39 37 Z" ${stroke(line)}/>`,
    link: (line) => `<rect x="10" y="38" width="46" height="24" rx="12" ${stroke(line)}/><rect x="44" y="38" width="46" height="24" rx="12" ${stroke(line)}/>`,
    // The two characters, flat and seen from the front.
    lantern: (line) =>
        `<path d="M24 30 V76 A26 9 0 0 0 76 76 V30" ${stroke(line)}/><ellipse cx="50" cy="30" rx="26" ry="9" ${stroke(line)}/>` +
        `<path d="M24 46 Q50 56 76 46 M24 66 Q50 76 76 66" ${stroke(line, 4)}/>` +
        `<rect x="40" y="54" width="5" height="9" rx="2.5" fill="${line}"/><rect x="55" y="54" width="5" height="9" rx="2.5" fill="${line}"/>`,
    drop: (line) =>
        `<path d="M50 10 C58 26 80 44 80 62 A30 30 0 0 1 20 62 C20 44 42 26 50 10 Z" ${stroke(line)}/>` +
        `<rect x="38" y="56" width="6" height="12" rx="3" fill="${line}"/><rect x="56" y="56" width="6" height="12" rx="3" fill="${line}"/>`,
}

// ---------------------------------------------------------------------------------------------
// Email scenes: one hero glyph in Lime over a soft olive light, a few faint glyphs around it, and a
// bottom edge that melts into the card.

const SCENE_W = 1040
const SCENE_H = 480
const HERO_SIZE = 200
const HERO_AT = { x: SCENE_W / 2, y: 206 }

// Satellite slots: [x, y, size, rotation]. The same constellation on every scene keeps them a family.
const SLOTS = [
    [150, 120, 96, -14],
    [262, 330, 70, 10],
    [880, 112, 84, 12],
    [790, 318, 64, -8],
]

const SCENES = {
    'automate-agent': { hero: 'loop', around: ['lantern', 'clock', 'check', 'lantern'] },
    'agent-idle': { hero: 'moon', around: ['lantern', 'clock', 'lantern', 'calendar'] },
    'onboarding-resume': { hero: 'flag', around: ['check', 'drop', 'star', 'lantern'] },
    'agent-recommendations': { hero: 'sparkles', around: ['lantern', 'drop', 'lantern', 'check'] },
    'creator-pitch': { hero: 'megaphone', around: ['star', 'person', 'lantern', 'star'] },
    'team-invite': { hero: 'personPlus', around: ['envelope', 'link', 'person', 'lantern'] },
    'workspace-invite': { hero: 'envelope', around: ['person', 'link', 'lantern', 'person'] },
    'trial-started': { hero: 'sunrise', around: ['lantern', 'drop', 'sparkles', 'lantern'] },
    'trial-ending': { hero: 'hourglassHalf', around: ['calendar', 'clock', 'lantern', 'clock'] },
    'trial-ended': { hero: 'hourglassEmpty', around: ['calendar', 'lantern', 'clock', 'lantern'] },
    'subscription-ending': { hero: 'calendar', around: ['clock', 'lantern', 'hourglassHalf', 'clock'] },
    'budget-exhausted': { hero: 'gauge', around: ['lantern', 'clock', 'lantern', 'calendar'] },
}

function placed(glyph, x, y, size, rotation, line, accent) {
    const scale = size / 100
    return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale}) translate(-50 -50)">${GLYPHS[glyph](line, accent)}</g>`
}

function sceneSvg({ hero, around }) {
    const dots = []
    for (let y = 18; y < SCENE_H; y += 32) for (let x = 18 + ((y / 32) % 2) * 16; x < SCENE_W; x += 32) dots.push(`<circle cx="${x}" cy="${y}" r="1.6"/>`)
    const satellites = around.map((glyph, i) => {
        const [x, y, size, rotation] = SLOTS[i]
        return placed(glyph, x, y, size, rotation, LIME, LIME)
    })
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SCENE_W}" height="${SCENE_H}" viewBox="0 0 ${SCENE_W} ${SCENE_H}">
<defs>
  <radialGradient id="light" cx="${HERO_AT.x}" cy="${HERO_AT.y}" r="460" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${OLIVE}" stop-opacity="0.7"/>
    <stop offset="0.45" stop-color="${OLIVE}" stop-opacity="0.24"/>
    <stop offset="1" stop-color="${OLIVE}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="halo" cx="${HERO_AT.x}" cy="${HERO_AT.y}" r="170" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${LIME}" stop-opacity="0.16"/>
    <stop offset="1" stop-color="${LIME}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="dotFade" cx="${HERO_AT.x}" cy="${HERO_AT.y}" r="560" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity="1"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <mask id="dotMask"><rect width="${SCENE_W}" height="${SCENE_H}" fill="url(#dotFade)"/></mask>
  <linearGradient id="fade" x1="0" y1="${SCENE_H - 170}" x2="0" y2="${SCENE_H}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${CARD}" stop-opacity="0"/>
    <stop offset="1" stop-color="${CARD}" stop-opacity="1"/>
  </linearGradient>
</defs>
<rect width="${SCENE_W}" height="${SCENE_H}" fill="#0b0c08"/>
<rect width="${SCENE_W}" height="${SCENE_H}" fill="url(#light)"/>
<g fill="${WHITE}" fill-opacity="0.07" mask="url(#dotMask)">${dots.join('')}</g>
<g opacity="0.26">${satellites.join('')}</g>
<circle cx="${HERO_AT.x}" cy="${HERO_AT.y}" r="170" fill="url(#halo)"/>
<g opacity="0.8" filter="url(#glow)">${placed(hero, HERO_AT.x, HERO_AT.y, HERO_SIZE, 0, LIME, WHITE)}</g>
${placed(hero, HERO_AT.x, HERO_AT.y, HERO_SIZE, 0, LIME, WHITE)}
<rect width="${SCENE_W}" height="${SCENE_H}" fill="url(#fade)"/>
</svg>`
}

// ---------------------------------------------------------------------------------------------
// Workspace icons: a full square, cropped to a circle where it is shown at 20 to 24 px, so each one
// is a single bold silhouette.

const ICON = 320

function iconSvg(background, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 100 100">
<defs>
  <radialGradient id="bg" cx="38" cy="30" r="80" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${background[0]}"/>
    <stop offset="1" stop-color="${background[1]}"/>
  </radialGradient>
</defs>
<rect width="100" height="100" fill="url(#bg)"/>
${body}
</svg>`
}

const ICONS = {
    // One point of light.
    solo: iconSvg(['#262626', BLACK], `<circle cx="50" cy="52" r="22" fill="${LIME}"/><circle cx="72" cy="28" r="8" fill="${WHITE}"/>`),
    // A few of them together.
    team: iconSvg(['#e4fb8f', '#a8d21c'], `<circle cx="50" cy="32" r="14" fill="${BLACK}"/><circle cx="31" cy="64" r="14" fill="${BLACK}"/><circle cx="69" cy="64" r="14" fill="${OLIVE}"/>`),
    // Rising steps.
    scale: iconSvg(['#2a2a2a', BLACK], `<rect x="22" y="58" width="14" height="22" rx="4" fill="${LIME}"/><rect x="43" y="44" width="14" height="36" rx="4" fill="${LIME}"/><rect x="64" y="30" width="14" height="50" rx="4" fill="${LIME}"/><circle cx="71" cy="19" r="6.5" fill="${WHITE}"/>`),
}

// ---------------------------------------------------------------------------------------------

async function render(svg, path, format) {
    const image = sharp(Buffer.from(svg), { density: 72 })
    const out = format === 'jpg' ? await image.flatten({ background: CARD }).jpeg({ quality: 88, mozjpeg: true }).toBuffer() : await image.png({ compressionLevel: 9 }).toBuffer()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, out)
    console.log(`${path.slice(PUBLIC.length + 1)}  ${Math.round(out.length / 1024)} KB`)
}

for (const [name, svg] of Object.entries(ICONS)) await render(svg, join(PUBLIC, 'pricing', `${name}.png`), 'png')
for (const [name, scene] of Object.entries(SCENES)) await render(sceneSvg(scene), join(PUBLIC, 'email', 'scene', `${name}.jpg`), 'jpg')
