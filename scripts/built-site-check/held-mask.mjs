// Held names kept out of the built site check's report (ticket #601). Every string of the report is read the way a
// person reads it before the held names are looked for: character references and percent escapes are read
// (`Odalys&nbsp;Brenwick`, `Odalys%20Brenwick`). The domain's matcher (`held-text-match.mjs`) finds a held name in
// any form it knows; two forms it does not are added here: a digit between the words of a held name
// (`Odalys1Brenwick`), and a one word held name inside a longer token of a path or a slug (`brenwickflowers`).
import { decodeEntities } from '../../packages/wo/website-opportunities/domain/draft-write-entities.mjs'
import { foldHeld, maskHeld } from '../../packages/wo/website-opportunities/domain/held-text-match.mjs'

export const HELD = '[held]'
// A one word held name shorter than this is looked for as a whole word only: `Ana` is not masked in `banana`.
export const IN_TOKEN_MIN = 4

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordsOf = (name) =>
  foldHeld(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Percent escapes read where they decode; a broken one stays as it is written. */
const unescaped = (text) =>
  text.replace(/(?:%[0-9a-fA-F]{2})+/g, (m) => {
    try {
      return decodeURIComponent(m)
    } catch {
      return m
    }
  })

/** A string as a person reads it: references and percent escapes read (twice, for `%26amp%3B`). */
export const readable = (text) => decodeEntities(unescaped(decodeEntities(unescaped(String(text)))))

/** A text folded one character at a time, with the index in the text of every folded character. */
function foldedWithMap(text) {
  let folded = ''
  const at = []
  let i = 0
  for (const ch of text) {
    const f = foldHeld(ch)
    folded += f
    for (let k = 0; k < f.length; k++) at.push(i)
    i += ch.length
  }
  at.push(i)
  return { folded, at }
}

/** A token of a path or a slug: no capital letter, or a slash, a digit or a slug separator in it. */
const slugLike = (token) => token === token.toLowerCase() || /[/\d_.@%-]/.test(token)

/** The spans of the two forms the domain's matcher does not find. */
function extraSpans(text, names) {
  const { folded, at } = foldedWithMap(text)
  const spans = []
  const push = (start, length) => spans.push({ start: at[start], end: at[start + length] })
  for (const name of names) {
    const words = wordsOf(name)
    if (words.length > 1) {
      const re = new RegExp(words.map(escapeRe).join('[^\\p{L}]*'), 'gu')
      for (const m of folded.matchAll(re)) if (m[0]) push(m.index, m[0].length)
    } else if (words.length === 1 && words[0].length >= IN_TOKEN_MIN) {
      for (const t of folded.matchAll(/\S+/gu)) {
        const token = text.slice(at[t.index], at[t.index + t[0].length])
        if (!slugLike(token)) continue
        for (let i = t[0].indexOf(words[0]); i >= 0; i = t[0].indexOf(words[0], i + 1))
          push(t.index + i, words[0].length)
      }
    }
  }
  return spans
}

/** A string with every held name replaced by `[held]`; a string with none stays as it is written. */
export function maskedText(value, held) {
  const text = readable(value)
  const first = maskHeld(text, held, HELD)
  const spans = extraSpans(first, held).sort((a, b) => a.start - b.start)
  let out = ''
  let from = 0
  for (const s of spans) {
    if (s.start < from) continue
    out += `${first.slice(from, s.start)}${HELD}`
    from = s.end
  }
  out += first.slice(from)
  return out === text ? value : out
}

/** Every string of a value with every held name, in any form, replaced by `[held]`. */
export function redacted(value, held) {
  if (!held.length) return value
  if (typeof value === 'string') return maskedText(value, held)
  if (Array.isArray(value)) return value.map((v) => redacted(v, held))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redacted(v, held)]))
  return value
}
