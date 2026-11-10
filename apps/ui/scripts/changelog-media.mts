// Turns a screen recording into the GIF a changelog entry points at, dropped in a temp file whose
// path the skill posts to the admin app's /api/admin/changelog/image. A still image needs none of this: post it
// straight, the route resizes it.
//
// Run: ../engine/node_modules/.bin/tsx scripts/changelog-media.mts <source> [options]
//
//   <source>       .mov / .mp4 / .webm / .m4v
//   --start <s>    seconds to skip at the head of the recording
//   --duration <s> seconds to keep, default 6
//   --fps <n>      frames per second, default 14
//   --width <px>   output width, default 1600
//   --out <path>   where to write, default a temp file
//
// The route converts the GIF to an animated webp, so weight here only has to stay sane, not tiny.
// What matters more: open on a frame that already says what the change is about, rather than on an
// empty state that fills in later.

import { execFile } from 'node:child_process'
import { basename, extname, join } from 'node:path'
import { stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)

const VIDEO = new Set(['.mov', '.mp4', '.webm', '.m4v'])

const [source, ...rest] = process.argv.slice(2)
if (!source) throw new Error('usage: changelog-media.mts <source.mov> [--start s] [--duration s] [--fps n] [--width px] [--out path]')

function option(flag: string, fallback: string): string {
    const index = rest.indexOf(`--${flag}`)
    return index === -1 ? fallback : (rest[index + 1] ?? fallback)
}

const ext = extname(source).toLowerCase()
if (!VIDEO.has(ext)) throw new Error(`unsupported source: ${ext || source}. A still image goes straight to the upload route.`)

const width = Number(option('width', '1600'))
const fps = Number(option('fps', '14'))
const out = option('out', join(tmpdir(), `${basename(source, ext)}-changelog.gif`))

// One pass, palette computed on the clip itself: a global palette holds the flat surfaces of the
// app far better than the 216 web colours ffmpeg falls back to, and the bayer dither keeps large
// dark areas from crawling between frames.
const filter = `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`

await run('ffmpeg', ['-y', '-ss', option('start', '0'), '-t', option('duration', '6'), '-i', source, '-vf', filter, '-loop', '0', out])

const kb = Math.round((await stat(out)).size / 1024)
console.log(`${out} ${kb} kB`)
console.log(`  upload: curl -sS -X POST "$ADMIN_URL/api/admin/changelog/image" -H "Authorization: Bearer $ADMIN_API_TOKEN" -F "file=@${out}"`)
