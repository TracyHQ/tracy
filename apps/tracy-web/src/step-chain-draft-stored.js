// The stored pictures of a draft run's write step (#597): which stored bytes every frame and icon of the write order
// shows (`stored(order)`, by frame or icon id), and the bytes behind each (`openStored(id)`). Spec:
// docs/references/draft-write-doors.md.
//
//   own picture      the draft picture the research stored for its address (the approved snapshot's asset manifest,
//                    origin `draft`, `sourceUrl` = the picture's `ref`): `draft:<id>`, opened through
//                    `openDraftPicture(id, {accountId})`, the same reader the pictures step opened it with
//   a dark twin      a frame with `sameAs` and no picture of its own shows the stored picture of the frame it names
//   library icon     the Phosphor glyph the icons step chose, drawn at its frame's size in one colour (the plan's
//                    accent when its paint says `accent`): `icon:<json>`, drawn by `lib/picture-paint/icons/icon-render.js`
//   anything else    no stored bytes: a generated picture (no generator is wired), an icon on a plate, a picture with
//                    no stored draft picture. The write guard then stops the build (`picture_not_stored`), typed.
import { iconPicture } from './lib/picture-paint/icons/icon-render.js'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const HEX = /^#[0-9a-f]{6}$/i
const DRAFT = 'draft:'
const ICON = 'icon:'

/** The colour an icon variant is drawn in: its own, the plan's accent when it says `accent`, else neutral. */
function colourOf(variant, look, theme) {
  const glyph = variant?.paint?.glyph
  if (HEX.test(String(glyph ?? ''))) return glyph
  const accent = theme === 'dark' && HEX.test(String(look?.accentDark ?? '')) ? look.accentDark : look?.accent
  return glyph === 'accent' && HEX.test(String(accent ?? '')) ? accent : '#222222'
}

/** The stored id of a library icon, or null when it cannot be drawn here (a plate, no glyph, no size). */
function iconIdOf(icon, look) {
  if (icon?.source !== 'library' || icon.storage !== 'image-file') return null
  const variants = icon.variants ?? {}
  const variant = variants[icon.theme] ?? variants.light ?? Object.values(variants)[0] ?? icon.icon
  if (variant?.paint?.plate) return null
  const glyph = variant?.icon ?? icon.icon?.name
  const width = Number(variant?.width ?? icon.frame?.width)
  const height = Number(variant?.height ?? icon.frame?.height)
  if (!isText(glyph) || !(width > 0) || !(height > 0)) return null
  const draw = { glyph, weight: variant?.weight ?? icon.icon?.weight ?? 'regular', width, height }
  draw.colour = colourOf(variant, look, variant?.theme ?? icon.theme)
  return `${ICON}${Buffer.from(JSON.stringify(draw)).toString('base64url')}`
}

/**
 * The manifest origins a run opens (#575): the draft's own pictures, and the step chain's content brief's place and
 * account pictures of a research of links, all through the one opener (`lib/research-picture-reader.js`).
 */
export const OPENED = new Set(['draft', 'place', 'opportunity'])

/** What the opener needs of an entry: its origin, and the hash its bytes are checked against. */
export const openOptionsOf = (entry, accountId) => ({
  accountId,
  origin: entry.origin,
  ...(isText(entry.sha256) ? { sha256: entry.sha256 } : {})
})

/**
 * The stored pictures of a run.
 * @param {{manifest?: object[], look?: object | null, accountId?: string | null,
 *   openDraftPicture?: (id: string, opts: {accountId: string | null}) => Promise<{bytes: Uint8Array, mime?: string} | null>}} input
 *   `manifest`: the approved snapshot's asset manifest; `look`: the approved plan's look
 */
export function storedPicturesOf({ manifest, look = null, accountId = null, openDraftPicture }) {
  const opened = list(manifest).filter((m) => OPENED.has(m?.origin) && isText(m.id))
  const byUrl = new Map(opened.filter((m) => isText(m.sourceUrl)).map((m) => [m.sourceUrl, m]))
  const byId = new Map(opened.map((m) => [m.id, m]))
  return {
    /** `{<frame or icon id>: {id, mime?}}` for every one with stored bytes. */
    stored(order) {
      const out = {}
      for (const p of list(order?.pictures)) {
        const entry = p?.source === 'own' && isText(p.ref) ? byUrl.get(p.ref) : null
        if (entry)
          out[p.frame] = { id: `${DRAFT}${entry.id}`, ...(isText(entry.mime) ? { mime: entry.mime } : {}) }
      }
      for (const p of list(order?.pictures))
        if (!out[p?.frame] && isText(p?.sameAs) && out[p.sameAs]) out[p.frame] = { ...out[p.sameAs] }
      for (const icon of list(order?.icons)) {
        const id = iconIdOf(icon, look)
        if (id) out[icon.id] = { id, mime: 'image/png' }
      }
      return out
    },
    /** The bytes behind a stored id: `{bytes, mime}`. */
    async openStored(id) {
      const text = String(id ?? '')
      if (text.startsWith(ICON)) {
        const drawn = await iconPicture(
          JSON.parse(Buffer.from(text.slice(ICON.length), 'base64url').toString())
        )
        return { bytes: drawn.bytes, mime: 'image/png' }
      }
      if (text.startsWith(DRAFT) && typeof openDraftPicture === 'function') {
        const entry = byId.get(text.slice(DRAFT.length))
        const got = entry ? await openDraftPicture(entry.id, openOptionsOf(entry, accountId)) : null
        if (got?.bytes instanceof Uint8Array && got.bytes.length > 0)
          return { bytes: got.bytes, mime: isText(got.mime) ? got.mime : 'image/jpeg' }
      }
      throw Object.assign(new Error(`no stored bytes behind ${text.slice(0, 80)}`), {
        code: 'stored_picture_gone'
      })
    }
  }
}
