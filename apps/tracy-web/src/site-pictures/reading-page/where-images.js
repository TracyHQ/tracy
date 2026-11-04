// The "where on the template" pictures of the reading page (#341): a crop of the template shot around a frame's box,
// the box outlined, and the same crop with the finished picture pasted into the box the way the site fits it (cover;
// contain for icons and logos), with the template's own overlay drawn over it when the template paints one (ADR 0043
// section 3e), so the owner sees what the site will show. Small JPEGs written beside the page; the full shot is only
// linked.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export const OUTLINE = '#ff2bd6'
const MAX_WIDTH = 900

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/** The crop around a box on a shot: the box plus a margin, inside the shot. */
export function cropAround(box, shot) {
  const margin = clamp(Math.round(Math.max(box.width, box.height) * 0.35), 60, 320)
  const left = clamp(Math.floor(box.left - margin), 0, shot.width - 1)
  const top = clamp(Math.floor(box.top - margin), 0, shot.height - 1)
  const right = clamp(Math.ceil(box.left + box.width + margin), left + 1, shot.width)
  const bottom = clamp(Math.ceil(box.top + box.height + margin), top + 1, shot.height)
  return { left, top, width: right - left, height: bottom - top }
}

// The box inside the crop, rounded and clipped to it.
function boxIn(box, crop) {
  const left = clamp(Math.round(box.left - crop.left), 0, crop.width - 1)
  const top = clamp(Math.round(box.top - crop.top), 0, crop.height - 1)
  return {
    left,
    top,
    width: clamp(Math.round(box.width), 1, crop.width - left),
    height: clamp(Math.round(box.height), 1, crop.height - top)
  }
}

const outlineSvg = (b, size, scale) => {
  const w = Math.max(3, Math.round(3 / scale))
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect x="${b.left + w / 2}" y="${b.top + w / 2}" width="${Math.max(1, b.width - w)}" height="${Math.max(1, b.height - w)}" fill="none" stroke="${OUTLINE}" stroke-width="${w}"/></svg>`
  )
}

// The mean colour of a thin strip just outside the box (above it, else below), standing in for the block's ground.
async function groundColour(shotFile, box, crop) {
  const strip =
    box.top >= 4
      ? { left: box.left, top: box.top - 4, width: box.width, height: 3 }
      : box.top + box.height + 4 <= crop.height
        ? { left: box.left, top: box.top + box.height + 1, width: box.width, height: 3 }
        : null
  if (!strip) return { r: 128, g: 128, b: 128 }
  const { channels } = await sharp(shotFile)
    .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
    .extract(strip)
    .removeAlpha()
    .stats()
  return { r: Math.round(channels[0].mean), g: Math.round(channels[1].mean), b: Math.round(channels[2].mean) }
}

// An rgba() overlay as an SVG rectangle over the box; null for any other paint (a gradient is not drawn).
function overlaySvg(b, size, overlay) {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(String(overlay?.colour ?? '').replace(/\s+/g, ''))
  if (!m) return null
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" fill="rgb(${m[1]},${m[2]},${m[3]})" fill-opacity="${Number(overlay.strength)}"/></svg>`
  )
}

/**
 * Writes "<name>-before.jpg" and, given a finished picture, "<name>-after.jpg" into outDir.
 * @param {{ shotFile: string, shotSize: { width: number, height: number }, box: object, pictureFile?: string | null,
 *   fit?: 'cover' | 'contain', overlay?: { colour: string, strength: number } | null, outDir: string, name: string }} options
 *   `overlay` the template's own overlay over the picture, drawn over the pasted picture
 * @returns {Promise<{ before: object, after: object | null, crop: object }>} files with their pixel sizes
 */
export async function drawWhere({
  shotFile,
  shotSize,
  box,
  pictureFile = null,
  fit = 'cover',
  overlay = null,
  outDir,
  name
}) {
  await mkdir(outDir, { recursive: true })
  const crop = cropAround(box, shotSize)
  const b = boxIn(box, crop)
  const scale = Math.min(1, MAX_WIDTH / crop.width)
  const size = { width: Math.round(crop.width * scale), height: Math.round(crop.height * scale) }
  const base = () => sharp(shotFile).extract(crop)
  const write = async (buffer, suffix) => {
    const file = path.join(outDir, `${name}-${suffix}.jpg`)
    await sharp(buffer).resize(size.width, size.height).jpeg({ quality: 80 }).toFile(file)
    return { file, ...size }
  }
  const before = await write(
    await base()
      .composite([{ input: outlineSvg(b, crop, scale), left: 0, top: 0 }])
      .png()
      .toBuffer(),
    'before'
  )
  if (!pictureFile) return { before, after: null, crop }
  const ground = await groundColour(shotFile, b, crop)
  const veil = overlay ? overlaySvg(b, crop, overlay) : null
  const placed = await sharp(pictureFile)
    .resize(b.width, b.height, { fit, position: 'centre', background: { ...ground, alpha: 0 } })
    .png()
    .toBuffer()
  const after = await write(
    await base()
      .composite([
        // The demo picture is covered first, so a transparent or contained picture shows the ground, not the demo.
        {
          input: { create: { width: b.width, height: b.height, channels: 3, background: ground } },
          left: b.left,
          top: b.top
        },
        { input: placed, left: b.left, top: b.top },
        ...(veil ? [{ input: veil, left: 0, top: 0 }] : []),
        { input: outlineSvg(b, crop, scale), left: 0, top: 0 }
      ])
      .png()
      .toBuffer(),
    'after'
  )
  return { before, after, crop, overlayDrawn: Boolean(veil) }
}
