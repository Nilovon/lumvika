import { ART_HEIGHT, ART_VARIANTS, ART_WIDTH, buildArtSvg, type ArtVariant } from './banner-art'

export const runtime = 'nodejs'

function isVariant(value: string | null): value is ArtVariant {
    return !!value && (ART_VARIANTS as readonly string[]).includes(value)
}

export async function GET(req: Request) {
    const variant = new URL(req.url).searchParams.get('variant')

    // A closed enumeration, no free text: this route can only ever produce the handful of banners
    // the templates ask for, so it is not an open image generator sitting on our domain.
    if (!isVariant(variant)) return new Response('Unknown variant', { status: 400 })

    const { default: sharp } = await import('sharp')
    const png = await sharp(Buffer.from(buildArtSvg(variant)), { density: 96 })
        .resize(ART_WIDTH, ART_HEIGHT)
        .png()
        .toBuffer()

    return new Response(new Uint8Array(png), {
        headers: {
            'Content-Type': 'image/png',
            // The URL carries a version, so a rendered banner never has to be revalidated.
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    })
}
