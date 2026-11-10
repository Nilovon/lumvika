import { NOTE_ICONS, type NoteIcon } from '@rerun/emails'
import { buildIconSvg, ICON_SIZE } from './note-icon-art'

export const runtime = 'nodejs'

function isNoteIcon(value: string | null): value is NoteIcon {
    return !!value && (NOTE_ICONS as readonly string[]).includes(value)
}

export async function GET(req: Request) {
    const name = new URL(req.url).searchParams.get('name')

    // A closed enumeration, no free text, for the same reason as the banner route: this is the
    // handful of glyphs the issues ask for, not an image generator sitting on our domain.
    if (!isNoteIcon(name)) return new Response('Unknown icon', { status: 400 })

    const { default: sharp } = await import('sharp')
    const png = await sharp(Buffer.from(buildIconSvg(name)), { density: 288 })
        .resize(ICON_SIZE * 2, ICON_SIZE * 2)
        .png()
        .toBuffer()

    return new Response(new Uint8Array(png), {
        headers: {
            'Content-Type': 'image/png',
            // The URL carries a version, so a rendered glyph never has to be revalidated.
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    })
}
