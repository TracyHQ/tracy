// Every picture the write places in a created record carries its alt text (ticket #597, gate run 7): an article's
// picture went out with an empty `image_intro_alt`, the alt column the record's base keeps beside it. Joomla pairs each
// picture key of an article's `images` with its alt key (`image_intro` with `image_intro_alt`, `image_fulltext` with
// `image_fulltext_alt`, the article form's own fields), and the mapping names no place for the alt, so the plan writes
// it beside the picture: the alt the pictures step gave that picture, else one written from the record's own title;
// never empty, never a file name. A place the blank site contract declares decorative
// (`editorial.decorative_image`) keeps an empty alt on purpose. A value the mapping already writes at the alt key
// stays. Pure; part of `opsOf`.
import { put } from './draft-write-sink.mjs'

/** The alt key of each picture key of an article's `images`. */
export const ALT_KEYS = Object.freeze({
  image_intro: 'image_intro_alt',
  image_fulltext: 'image_fulltext_alt'
})
const DECORATIVE = 'editorial.decorative_image'
const FILE_NAME = /\.(?:avif|gif|jpe?g|png|svg|webp)\s*$/i

/** The most characters an alt holds (the pictures step's `ALT_LIMIT`). */
const ALT_LIMIT = 125
const textOf = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '')
/** A title cut to the alt limit at a word boundary. */
function cut(text) {
  const chars = [...text]
  if (chars.length <= ALT_LIMIT) return text
  const head = chars.slice(0, ALT_LIMIT).join('')
  const space = head.lastIndexOf(' ')
  return (space > 0 ? head.slice(0, space) : head).replace(/[\s,;:.]+$/u, '')
}

/** The record's title as the plan writes it. */
const titleOf = (record) =>
  textOf([...record.values.values()].find((v) => v.loc.column === 'title' && !v.loc.jsonPath)?.value)

/** The alt a picture of a record takes: its own, else from the record's title; empty when neither is usable. */
export function altOf(picture, record) {
  const own = textOf(picture?.alt)
  if (own && !FILE_NAME.test(own)) return own
  return cut(titleOf(record))
}

/** Write the alt beside every picture of a created record's `images`. */
export function planPictureAlts(state) {
  for (const record of state.sink.records.values()) {
    if (record.kind !== 'created') continue
    // A copy: `put` adds the alt values to the map being walked.
    for (const v of Array.from(record.values.values())) {
      const key = v.loc.column === 'images' && v.loc.jsonPath?.length === 1 ? v.loc.jsonPath[0] : null
      const ref = String(v.value?.ref ?? '')
      if (!Object.hasOwn(ALT_KEYS, key ?? '') || !ref.startsWith('picture:')) continue
      if (state.kit.slots.get(v.loc.slot)?.role === DECORATIVE) continue
      const picture = state.pictures.get(ref.slice('picture:'.length))?.picture
      const alt = altOf(picture, record)
      if (!alt) {
        state.sink.unproven.push({ code: 'picture_alt_missing', record: record.key, picture: ref })
        continue
      }
      const loc = { entity: v.loc.entity, column: 'images', jsonPath: [ALT_KEYS[key]] }
      put(state.sink, record.key, loc, alt, { rule: 'picture_alt' })
    }
  }
}
