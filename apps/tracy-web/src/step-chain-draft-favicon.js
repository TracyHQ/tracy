// The site icon written at the path the kit declares (#597, gate run 7; op `look.favicon`,
// `draft-write-plan-favicon.mjs`). Made from the logo's stored bytes, contained in a transparent square with a small
// margin and never cut; or, with no logo, the business initials drawn on the accent (`initialsAvatar`, the lettermark
// the pictures step draws). An `.ico` holds 16, 32 and 48 pixel PNG entries (`pngsToIco`, the brand step's own); a
// `.png` one 32 pixel square. Uploaded through the media door and read back by its bytes. A logo sharp cannot read
// falls back to the initials, flagged `favicon_logo_unread`.
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

/** The favicon file's bytes in the format its path names. */
export async function faviconBytesOf(op, ctx) {
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
  const answer = await ctx.doors.upload({ applyId: ctx.applyId(op, 'upload'), path: op.path, bytes, mime })
  await readUpload(op, answer?.path ?? op.path, bytes, ctx)
}
