// The found logo of a brand run (brand step trial bench, #321). A brief names it only by media id (`brand.logo`), and
// the brand tools (open_image, measure_logo, cut_mark) read it from the run folder as `media/<id>.<ext>`, the place the
// approved lab kept it (`<case dir>/<id>.<ext>`) and the locked prompt tells the agent about ("the media id of the
// logo"). This file puts the bytes there before the first model call, from one of two sources:
//   a file on the server (`--logo-file`)   staged at the start, before the run is queued (stageLogoFile)
//   the brief's media id                   loaded when the worker claims the run (ensureLogo), from the table the research
//                                          keeps it in: a researched place's logo is a `wo_place_media` row (the brief's
//                                          media names it with `origin: 'place'`), an opportunity's own a `wo_media` row
// A logo that cannot be had stops the run with a reason; nothing is ever guessed or drawn instead.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { UUID } from '../lib/bench-sql.js'

const EXT_OF = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' }
/** The extensions the tools look for (tools/common.js). */
const EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif']
/** Largest logo read from storage: a logo is a small picture. */
const MAX_BYTES = 25 * 1024 * 1024

/** The brief's logo media id, or null. */
export const logoIdOf = (brief) => {
  const id = brief?.brand?.logo
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

/** Whether the run folder already holds the logo (a resumed run, or one staged at the start). */
export const logoStaged = (files, id) => EXTS.some((ext) => files.has(`media/${id}.${ext}`))

/** The bytes as an image the tools can open, with the extension to store them under; null when not an image. */
export async function logoImage(bytes) {
  let format
  try {
    format = (await sharp(bytes).metadata()).format
  } catch {
    return null
  }
  if (EXT_OF[format]) return { bytes, ext: EXT_OF[format] }
  try {
    return { bytes: await sharp(bytes).png().toBuffer(), ext: 'png' }
  } catch {
    return null
  }
}

/** Writes the logo into the run folder under `media/<id>.<ext>`; the path, or null when the bytes are no image. */
export async function stageLogo(files, id, bytes) {
  const image = await logoImage(bytes)
  return image ? files.write(`media/${id}.${image.ext}`, image.bytes) : null
}

const fail = (reason) => ({ ok: false, reason })

/**
 * Where the brief says its logo is kept: the place's table when its media entry says `origin: 'place'`, else `wo_media`; null
 * when the brief's media does not list it, and then both tables are asked, the account's own first.
 */
export const logoOriginOf = (brief, mediaId) => {
  const entry = (Array.isArray(brief?.media) ? brief.media : []).find((m) => m?.id === mediaId)
  if (!entry) return null
  return entry.origin === 'place' ? 'place' : 'opportunity'
}

const LOGO_ROW = {
  // A place picture is read only while it is not revoked, like every other reader of a place's pictures (brief-picture-bytes.js).
  place: `select sha256, object_key, status, revoked_at from wo_place_media where id = $1`,
  opportunity: 'select sha256, object_key, status, null as revoked_at from wo_media where id = $1'
}

/** The stored bytes of the logo's row (`wo_place_media` for a place's logo, `wo_media` otherwise), checked against its sha256. */
export async function mediaLogoBytes({ pool, objects, mediaId, origin = 'opportunity' }) {
  if (!UUID.test(mediaId)) return fail(`brand.logo ${mediaId} is not a media id`)
  const { rows } = await pool.query(LOGO_ROW[origin] ?? LOGO_ROW.opportunity, [mediaId])
  const row = rows[0]
  if (!row) return fail(`logo media ${mediaId} does not exist`)
  if (row.revoked_at) return fail(`logo media ${mediaId} was revoked`)
  if (row.status !== 'stored' || !row.object_key)
    return fail(`logo media ${mediaId} has no stored bytes (status ${row.status})`)
  if (!objects) return fail(`logo media ${mediaId} cannot be read: this server has no object store`)
  const res = await objects.get(row.object_key).catch(() => null)
  if (!res?.ok) return fail(`logo media ${mediaId} cannot be read from the object store`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_BYTES) return fail(`logo media ${mediaId} is too large`)
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256)
    return fail(`logo media ${mediaId} does not match its stored hash`)
  return { ok: true, bytes }
}

/**
 * Claim time: make sure the run folder holds the brief's logo. `source` is what to record on the run (a media id), null
 * when nothing was loaded (no logo in the brief, or the folder already holds it).
 * @returns {Promise<{ ok: true, source: object | null } | { ok: false, reason: string }>}
 */
export async function ensureLogo({ pool, files, brief, objects }) {
  const mediaId = logoIdOf(brief)
  if (!mediaId || logoStaged(files, mediaId)) return { ok: true, source: null }
  const named = logoOriginOf(brief, mediaId)
  let origin = named ?? 'opportunity'
  let got = await mediaLogoBytes({ pool, objects, mediaId, origin })
  // Not in the account's table and not named by the brief: the place's table may hold it (its reason wins once it has a row).
  if (!got.ok && !named && /does not exist/.test(got.reason)) {
    const place = await mediaLogoBytes({ pool, objects, mediaId, origin: 'place' })
    if (place.ok || !/does not exist/.test(place.reason)) {
      origin = 'place'
      got = place
    }
  }
  if (!got.ok) return got
  if (!(await stageLogo(files, mediaId, got.bytes))) return fail(`logo media ${mediaId} is not an image`)
  return { ok: true, source: { kind: origin === 'place' ? 'place-media' : 'media', mediaId } }
}
