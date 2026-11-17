// The site icon written at the path the kit declares (#597, gate run 7; op `look.favicon`,
// `draft-write-plan-favicon.mjs`). The brand file's own icon when the draft keeps one (#575), else made from the logo's stored bytes, contained in a transparent square with a small
// margin and never cut; or, with no logo, the business initials drawn on the accent (`initialsAvatar`, the lettermark
// the pictures step draws). An `.ico` holds 16, 32 and 48 pixel PNG entries (`pngsToIco`, the brand step's own); a
// `.png` one 32 pixel square. Uploaded through the media door and read back by its bytes; a door that refuses the
// path (`bad_params`) is flagged `favicon_door_refused` and the write goes on. A logo sharp cannot read falls back to the initials,
// flagged `favicon_logo_unread`.
import sharp from 'sharp'
import { pngsToIco } from './brand-step/tools/ico.js'
import { initialsAvatar } from './lib/initials-avatar.js'
import { readUpload } from './step-chain-draft-write-check.js'

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }
/** The margin around the logo in its square, as a share of the side (the brand step's transparent tab icon). */
const MARGIN = 0.04

/** One square PNG of side `n`: the picture contained, centred, on a transparent ground. */
async function squareOf(bytes, n) {
  const inner = Math.max(1, Math.round(n * (1 - MARGIN * 2)))
  const mark = await sharp(bytes).resize(inner, inner, { fit: 'contain', background: CLEAR }).png().toBuffer()
  return sharp({ create: { width: n, height: n, channels: 4, background: CLEAR } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer()
}

/** The source picture: the logo's bytes, else the initials drawn at the largest size. */
async function sourceOf(op, ctx) {
  if (op.from === 'logo') {
    const stored = await ctx.openStored(op.stored.id)
    try {
      await sharp(stored.bytes).metadata()
      return stored.bytes
    } catch {
      ctx.report.unproven.push({ code: 'favicon_logo_unread', op: op.key })
    }
  }
  const side = Math.max(...op.sizes) * 4
  const initials = op.draw?.initials ?? ''
  return (await initialsAvatar({ width: side, height: side, initials, colours: op.draw?.colours ?? [] }))
    .bytes
}

/** The square sizes of an ICO's entries, read from its directory (0 is 256). */
const icoSizes = (bytes) =>
  bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1
    ? Array.from({ length: bytes.readUInt16LE(4) }, (_, i) => bytes[6 + 16 * i] || 256)
    : []

/**
 * The brand file's own icon (#575, P3 of the brand audit) as it is, once it passes the write's checks: an `.ico` holding
 * every size the path's format takes, or a `.png` of the one 32 pixel square that also passes the tab check the bench
 * ran (`brand-step/favicon-check.js`: fills its square, stands out on a light and a dark tab). Null when it fails one.
 */
async function brandIconOf(op, ctx) {
  let stored
  try {
    stored = await ctx.openStored(op.stored.id)
  } catch {
    return null
  }
  const bytes = Buffer.from(stored.bytes)
  if (op.format === 'ico') {
    const sizes = icoSizes(bytes)
    return op.sizes.every((n) => sizes.includes(n)) ? { bytes, mime: 'image/x-icon' } : null
  }
  try {
    const meta = await sharp(bytes).metadata()
    if (meta.width !== op.sizes[0] || meta.height !== op.sizes[0]) return null
    const { checkFavicon } = await import('./brand-step/favicon-check.js')
    return (await checkFavicon(bytes)).pass ? { bytes, mime: 'image/png' } : null
  } catch {
    return null
  }
}

/** The favicon file's bytes in the format its path names. */
export async function faviconBytesOf(op, ctx) {
  if (op.from === 'brand') {
    const icon = await brandIconOf(op, ctx)
    if (icon) return icon
    ctx.report.unproven.push({ code: 'favicon_brand_icon_unfit', op: op.key })
    return faviconBytesOf({ ...op, ...op.fallback }, ctx)
  }
  const source = await sourceOf(op, ctx)
  const pngs = []
  for (const n of op.sizes) pngs.push(await squareOf(source, n))
  return op.format === 'ico'
    ? { bytes: pngsToIco(pngs), mime: 'image/x-icon' }
    : { bytes: pngs[0], mime: 'image/png' }
}

/** Run a `look.favicon` op: make the file, upload it at the declared path, read it back. */
export async function runFavicon(op, ctx) {
  const { bytes, mime } = await faviconBytesOf(op, ctx)
  let answer
  try {
    answer = await ctx.doors.upload({ applyId: ctx.applyId(op, 'upload'), path: op.path, bytes, mime })
  } catch (error) {
    // A door that refuses the path (`bad_params`: the media door measures `images/` paths only) leaves the template's
    // icon: the icon is no place of the plan, so the write goes on and the report says so. Any other failure is
    // retried as every door call is.
    if (error?.fatal || error?.code !== 'bad_params') throw error
    ctx.report.unproven.push({ code: 'favicon_door_refused', op: op.key, path: op.path, cause: error.code })
    return
  }
  await readUpload(op, answer?.path ?? op.path, bytes, ctx)
}
