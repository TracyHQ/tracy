/**
 * `media.scan` on an EmDash site: the pictures of its media library, and one of them where the agent
 * can look at it.
 *
 * WHY (v6 EmDash L2-01, L4-01). `media.scan` walks the webroot, and EmDash keeps its files in its own
 * storage, so it answered "platform unknown, scanned 0": the agent could not see a logo, wrote
 * `alt="Client logo placeholder"` to the live entry and the media row (the logo read `ЭЛЕКТРА`), and once
 * asked the customer instead. The library is one MCP read away (`media_list`, core `mcp/server.ts`),
 * and the file is on the site's own loopback route, so both are answered here.
 *
 * 🔒 THE FENCE IS UNCHANGED. The rows come through `tracy_emdash`'s own road (`runEmdashTool`: the
 * site is the conversation's, the token never leaves the container), the file is copied by the
 * container's own node into `docs/agents/look/`, the folder `page.look` already writes and
 * `read_image` already opens, and nothing else on the disk is named. The storage key and the file
 * name are checked here and again by the script.
 */

/** The file route of EmDash's local storage; the same path on every EmDash site. */
export const EMDASH_MEDIA_FILE = '/_emdash/api/media/file/'

const KEY = /^[0-9A-Za-z][0-9A-Za-z._-]{0,119}$/
const ID = /^[0-9A-Za-z][0-9A-Za-z_-]{0,63}$/
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

/** @param {unknown} v */
const rec = (v) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? /** @type {any} */ (v) : {})

/**
 * The pictures a `content_update` puts into fields that held a picture already: the ids that differ from
 * the stored ones. A field counts as a picture when its stored value is an object with an `id` and a
 * `provider` (what the library writes); a reference to another entry has no provider and is never checked.
 *
 * WHY (v7 cp3, 30/09/2026): a 26-character media id copied with one character lost was accepted, the
 * entry read `live`, and the home page had no picture; the agent told the customer it was done.
 * @param {Record<string, unknown>} data - the fields the write sends
 * @param {Record<string, unknown>} stored - the entry's fields as read before the write
 * @returns {Array<{ field: string, id: string }>}
 */
export function writtenPictureIds(data, stored) {
  /** @type {Array<{ field: string, id: string }>} */
  const out = []
  for (const [field, value] of Object.entries(data)) {
    const was = rec(stored[field])
    if (typeof was.id !== 'string' || typeof was.provider !== 'string') continue
    const next = rec(value)
    if (typeof next.id === 'string' && next.id !== was.id) out.push({ field, id: next.id })
  }
  return out
}

/**
 * One library row, as the agent needs it.
 * @param {any} item
 */
export function pictureRow(item) {
  const r = rec(item)
  const key =
    typeof r.storageKey === 'string'
      ? r.storageKey
      : typeof r.meta?.storageKey === 'string'
        ? r.meta.storageKey
        : null
  return {
    id: typeof r.id === 'string' ? r.id : null,
    filename: typeof r.filename === 'string' ? r.filename : null,
    mimeType: typeof r.mimeType === 'string' ? r.mimeType : null,
    alt: typeof r.alt === 'string' ? r.alt : '',
    width: typeof r.width === 'number' ? r.width : null,
    height: typeof r.height === 'number' ? r.height : null,
    url: key !== null && KEY.test(key) ? `${EMDASH_MEDIA_FILE}${key}` : null,
    storageKey: key !== null && KEY.test(key) ? key : null
  }
}

/**
 * The parameters of a scan: a limit of 1 to 100, or one `id` to look at.
 * @param {Record<string, unknown>} params
 * @returns {{ ok: true, limit: number, id: string | null } | { ok: false, error: string }}
 */
export function planScan(params) {
  const p = rec(params)
  const limit =
    typeof p.limit === 'number' && Number.isFinite(p.limit)
      ? Math.max(1, Math.min(100, Math.floor(p.limit)))
      : 20
  if (p.id === undefined || p.id === null || p.id === '') return { ok: true, limit, id: null }
  if (typeof p.id !== 'string' || !ID.test(p.id.trim()))
    return { ok: false, error: 'id is a media id from media.scan or media_list' }
  return { ok: true, limit, id: p.id.trim() }
}

const LOOK_NEXT =
  'media.scan {id} copies one picture where you can look at it, so an alt is written from the picture, not guessed; an alt goes on the entry field and on the library row (media_update {id, alt}).'

/**
 * @param {object} input
 * @param {Record<string, unknown>} input.params
 * @param {string} input.label
 * @param {(tool: string, args: Record<string, unknown>) => Promise<any>} input.call - `tracy_emdash`'s
 *   own road: the answer of `runEmdashTool`.
 * @param {(input: { storageKey: string, name: string }) => Promise<{ ok: true, file: string, bytes: number, mediaType: string } | { ok: false, error: string }>} input.copy
 * @param {(shot: { file: string, url: string, mediaType: string }) => Promise<Record<string, unknown>>} input.seen
 * @param {() => number} [input.now]
 */
export async function emdashMediaScan({ params, label, call, copy, seen, now = Date.now }) {
  const plan = planScan(params)
  if (!plan.ok) return { ok: false, code: 'BAD_CALL', error: plan.error }
  if (plan.id === null) {
    const listed = await call('media_list', { mimeType: 'image/', limit: plan.limit })
    if (listed?.ok !== true) return listed
    const items = Array.isArray(listed.result?.items) ? listed.result.items : []
    // The storage key stays here (an `undefined` property is not lossless JSON): the agent gets the
    // id, and the id is what copies a file.
    const media = items.map((item) => {
      const { id, filename, mimeType, alt, width, height, url } = pictureRow(item)
      return { id, filename, mimeType, alt, width, height, url }
    })
    return {
      ok: true,
      platform: 'emdash',
      scanned: media.length,
      media,
      ...(typeof listed.result?.nextCursor === 'string' ? { more: true } : {}),
      next: LOOK_NEXT
    }
  }
  const got = await call('media_get', { id: plan.id })
  if (got?.ok !== true) return got
  const row = pictureRow(got.result?.item ?? got.result)
  if (row.storageKey === null || row.mimeType === null || !row.mimeType.startsWith('image/'))
    return {
      ok: false,
      code: 'NOT_A_PICTURE',
      id: plan.id,
      error: `${row.filename ?? plan.id} is not a picture this tool can open.`,
      next: 'media.scan {} lists the pictures with their ids.'
    }
  const ext = EXT[/** @type {keyof typeof EXT} */ (row.mimeType)] ?? 'png'
  const name = `media-${plan.id}-${now()}.${ext}`
  const copied = await copy({ storageKey: row.storageKey, name })
  if (!copied.ok)
    return {
      ok: false,
      code: 'MEDIA_COPY_FAILED',
      id: plan.id,
      detail: copied.error,
      next: 'Say that the picture could not be opened and ask the customer what it shows; do not write an alt you have not seen.'
    }
  return {
    ok: true,
    platform: 'emdash',
    id: plan.id,
    filename: row.filename,
    alt: row.alt,
    width: row.width,
    height: row.height,
    file: copied.file,
    url: row.url,
    ...(await seen({ file: copied.file, url: row.url ?? label, mediaType: copied.mediaType }))
  }
}

/**
 * One part of a path into an entry's data: a key, or a position in a list.
 * @param {unknown} value @param {string} path - `hero_image`, or `gallery.2.image` for a picture inside a list.
 */
function valueAt(value, path) {
  let here = value
  for (const step of path.split('.')) {
    if (Array.isArray(here)) here = /^\d+$/.test(step) ? here[Number(step)] : undefined
    else here = rec(here)[step]
    if (here === undefined || here === null) return undefined
  }
  return here
}

/**
 * The stored size of the picture an entry field holds — the shape a new picture for that field is cut
 * to (`media.draw {replaces}`), read by the door so the model never types a ratio.
 *
 * WHY (v7, 29/09/2026). `media.draw` on EmDash asked for `aspect`, and three picks gave one that was
 * not the picture's: `16/10` before the entry was read, `5/4` for 1000×880, `4/3` from the CSS frame
 * `page.look` measures (a `cover` crop of the picture, not the picture). The entry's own value carries
 * the truth — `{id, width, height, …}` in `content_get`'s `data` — and a bare id is one `media_get` away.
 *
 * Every refusal says which step failed and the one way on (`aspect`, for a shape the agent chooses).
 * @param {object} input
 * @param {{ collection: string, id: string, field: string, locale?: string }} input.replaces
 * @param {(tool: string, args: Record<string, unknown>) => Promise<any>} input.call - `tracy_emdash`'s
 *   own road: the answer of `runEmdashTool`.
 * @returns {Promise<{ ok: true, width: number, height: number, id: string | null } | { ok: false, code: string, error: string, next: string }>}
 */
export async function measureReplaced({ replaces, call: road }) {
  const { collection, id, field, locale } = replaces
  const where = `${collection}/${id}`
  const ASPECT = 'aspect:"<w>:<h>" draws to a shape you choose'
  // A road that throws answers no entry: the draw refuses with its way on, never with an exception.
  /** @param {string} tool @param {Record<string, unknown>} args */
  const call = async (tool, args) => {
    try {
      return await road(tool, args)
    } catch {
      return null
    }
  }
  const got = await call('content_get', { collection, id, ...(locale ? { locale } : {}) })
  const entry = got?.ok === true ? rec(got.result?.item ?? got.result) : null
  if (entry === null || entry.data === undefined)
    return {
      ok: false,
      code: 'REPLACES_NOT_FOUND',
      error: `content_get read no entry ${where}`,
      next: `Copy collection and id from the pick's emdash: mark, or from content_get; ${ASPECT}.`
    }
  const value = valueAt(entry.data, field)
  const item = rec(value)
  /** @param {string} why */
  const nopicture = (why) => ({
    ok: /** @type {const} */ (false),
    code: 'REPLACES_NO_PICTURE',
    error: `${field} of ${where} ${why}`,
    next: `The field named must hold a picture: ${ASPECT}.`
  })
  if (value === undefined) return nopicture('holds nothing')
  if (typeof item.width === 'number' && typeof item.height === 'number' && item.width > 0 && item.height > 0)
    return {
      ok: true,
      width: item.width,
      height: item.height,
      id: typeof item.id === 'string' ? item.id : null
    }
  // A bare media id, or an item cached without its size: the library row has it.
  const mediaId = typeof value === 'string' ? value : typeof item.id === 'string' ? item.id : ''
  if (!ID.test(mediaId)) return nopicture('is not a picture')
  const media = await call('media_get', { id: mediaId })
  const row = media?.ok === true ? pictureRow(media.result?.item ?? media.result) : null
  if (row === null)
    return {
      ok: false,
      code: 'REPLACES_NO_PICTURE',
      error: `media ${mediaId}, the picture in ${field}, is not in the library`,
      next: `media.scan lists the pictures with their sizes; ${ASPECT}.`
    }
  if (row.width === null || row.height === null || row.width <= 0 || row.height <= 0)
    return nopicture(`holds media ${mediaId}, whose size the library does not know`)
  return { ok: true, width: row.width, height: row.height, id: mediaId }
}
