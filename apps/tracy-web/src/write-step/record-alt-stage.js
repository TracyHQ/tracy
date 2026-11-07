// The alts step 8 wrote that no contract slot carries (ADR 0043 section 3f): a picture whose record keeps its alt beside it.
// Two kinds of picture slot have one, read from the kit's content map:
// - an article's intro or full picture (column `images`, `image_intro` / `image_fulltext`): its alt is `<field>_alt` in the
//   same column;
// - a picture printed in a record's HTML (an `xpath` ending in `img/@src`, as in an article's text or a custom module): its
//   alt is that img's `alt`, found by the file the contract wrote into its src.
// After the contract call, each record is read whole and written back with `content.update`, one write per record column, so
// Site changes can take it back. Only a picture the contract wrote is touched; a record that already holds the alt is not
// written again. Every other picture slot (template config pictures, extra fields, avatars) keeps no alt a door can reach.
import { createHash } from 'node:crypto'
import { doorCall } from './settings-door.js'

const IMAGE_FIELDS = new Set(['image_intro', 'image_fulltext'])
const KINDS = { article: 'article', module: 'module' }
const IMG_SRC = /img\/@src$/
const IMG_TAG = /<img\b[^>]*>/gi

const escapeAttr = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fileOf = (value) =>
  String(value ?? '')
    .split('#')[0]
    .replace(/^\/+/, '')

/** Where a picture slot keeps its alt, or null: { kind, id, column, field? (images JSON), xpath? (HTML) }. */
export function recordAltPlace(slot) {
  const [type, id] = String(slot?.entity ?? '').split('-')
  const kind = KINDS[type]
  if (slot?.type !== 'image' || !kind || !/^\d+$/.test(id ?? '')) return null
  const field = Array.isArray(slot.jsonPath) && slot.jsonPath.length === 1 ? slot.jsonPath[0] : null
  if (kind === 'article' && slot.column === 'images' && IMAGE_FIELDS.has(field))
    return { kind, id: Number(id), column: 'images', field }
  if (typeof slot.xpath === 'string' && IMG_SRC.test(slot.xpath) && typeof slot.column === 'string')
    return { kind, id: Number(id), column: slot.column, html: true }
  return null
}

/** The HTML with `alt` set on every img whose src names `file`; the count of imgs changed. */
function withImgAlt(html, file, alt) {
  let found = 0
  const out = String(html ?? '').replace(IMG_TAG, (tag) => {
    const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]
    if (!src || fileOf(src) !== file) return tag
    found++
    const attr = `alt="${escapeAttr(alt)}"`
    return /\balt\s*=\s*(["']).*?\1/i.test(tag)
      ? tag.replace(/\balt\s*=\s*(["']).*?\1/i, attr)
      : tag.replace(/^<img\b/i, `<img ${attr}`)
  })
  return { html: out, found }
}

const jsonOf = (value) => {
  if (value && typeof value === 'object') return { ...value }
  try {
    const parsed = JSON.parse(String(value ?? ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, contentMap?: { slots?: object[] } | null,
 *   alts: Record<string, string>, pictures: Record<string, string>, written: Iterable<string> }} input
 *   `alts` step 8's alts by frame, left over by the gallery slots; `pictures` the package's content map key to file
 * @returns {Promise<Map<string, { status: string, reason?: string, ordered?: string }>>} results by frame
 */
export async function writeRecordAlts({ door, siteKey, contentMap, alts, pictures, written }) {
  const results = new Map()
  const slots = new Map((Array.isArray(contentMap?.slots) ? contentMap.slots : []).map((s) => [s?.key, s]))
  const wrote = new Set(written)
  const groups = new Map()
  for (const [frame, alt] of Object.entries(alts ?? {})) {
    const key = frame.replace(/^block-/, 'module-')
    const place = wrote.has(key) && pictures?.[key] ? recordAltPlace(slots.get(key)) : null
    if (!place) continue
    const name = `${place.kind} ${place.id} ${place.column}`
    if (!groups.has(name)) groups.set(name, { ...place, items: [] })
    groups.get(name).items.push({ frame, alt, place, file: fileOf(pictures[key]) })
  }
  const call = doorCall(door, siteKey)
  for (const group of groups.values()) {
    const fail = (reason) => {
      for (const i of group.items) results.set(i.frame, { status: 'failed', reason, ordered: i.alt })
    }
    try {
      const row = (await call('content.get', { kind: group.kind, id: group.id }))?.item ?? {}
      let value
      if (group.html) {
        value = String(row[group.column] ?? '')
        for (const i of group.items) {
          const next = withImgAlt(value, i.file, i.alt)
          if (!next.found)
            results.set(i.frame, {
              status: 'failed',
              reason: 'the record prints no img of this picture',
              ordered: i.alt
            })
          value = next.html
        }
      } else {
        const images = jsonOf(row.images)
        if (!images) {
          fail('the article images field cannot be read')
          continue
        }
        for (const i of group.items) images[`${i.place.field}_alt`] = i.alt
        value = JSON.stringify(images)
      }
      const todo = group.items.filter((i) => !results.has(i.frame))
      if (!todo.length) continue
      if (value !== (group.html ? String(row[group.column] ?? '') : JSON.stringify(jsonOf(row.images)))) {
        const hash = createHash('sha256')
          .update(`${group.kind} ${group.id} ${group.column} ${value}`)
          .digest('hex')
          .slice(0, 32)
        await call('content.update', {
          apply_id: `picture-alt-${hash}`,
          kind: group.kind,
          id: group.id,
          fields: { [group.column]: value }
        })
      }
      for (const i of todo) results.set(i.frame, { status: 'written', ordered: i.alt })
    } catch (error) {
      fail(String(error?.message ?? error))
    }
  }
  return results
}
