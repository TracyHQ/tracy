// The names a business gives itself on its own marks: the text of its logo, the display name and the handle of its
// social pages (#1791). Pure: no network, no clock.
//
// Measured on a real business (dev, 27/10/2026): Google and a directory called it by its service, "Padel & Tennis
// Coach" in the fictional retelling, while its logo read "HARBOUR SPORT CLUB EST. 2023" and its Instagram handle was
// harbour.sportclub. The two sources agreed, so the site carried the service as the name. The name decision keeps the
// sources' choice; this module says which other names the business's own marks give, so the name waits for the owner.

import { logoNameSpelling, nameKey } from './business-name.mjs'
import { namesMatch } from './google-link.mjs'
import { logoFactsOf } from './logo-facts.mjs'

/** The sources whose words are the business's own mark: its logo and its social pages. */
export const OWN_MARK_SOURCES = Object.freeze(
  new Set(['logo', 'instagram', 'facebook', 'tiktok', 'youtube', 'x'])
)

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** The logo's text less what is not the name ("EST. 2023", "Family owned"), else ''. */
export function logoNameText(logo) {
  if (logo?.showsName !== true) return ''
  let text = clean(logo.readsAs)
  for (const f of logoFactsOf({ readsAs: text })) text = text.replace(f.text, ' ')
  return clean(trimEdgePunctuation(text))
}

const EDGE_PUNCTUATION = new Set([' ', '-', '|', '·', ',', '.'])

/** `text` less the separators at either end, by index so a long run of them stays linear. */
function trimEdgePunctuation(text) {
  const t = clean(text)
  let start = 0
  let end = t.length
  while (start < end && EDGE_PUNCTUATION.has(t[start])) start += 1
  while (end > start && EDGE_PUNCTUATION.has(t[end - 1])) end -= 1
  return t.slice(start, end)
}

/** Two keys of one name: the same, or one holding the other (a logo that adds the city). */
const sameKey = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)))

/**
 * The names the business's own marks give that are not `chosen`, each with the marks that give it.
 * - A logo's text (less its founding year and the like, `logo-facts.mjs`) and a social page's display name give a name.
 * - A handle never gives a name on its own (`hsc_dxb` is an address, not how the business writes its name); it backs
 *   a name a logo or a display name gives.
 * - A mark that holds the chosen name, or that the chosen name holds, agrees with it.
 * @param {{
 *   chosen: string | null,
 *   claims?: { source: string, name: string, via: 'name' | 'handle' | 'logo', label?: string }[],
 *   logo?: { readsAs?: string | null, showsName?: boolean } | null
 * }} input `claims` as the research records them (`src/business-name.js nameClaimsOf`)
 * @returns {{ name: string, marks: { source: string, via: 'name' | 'handle' | 'logo', text: string, index?: number }[] }[]}
 */
export function ownMarkNamesOf({ chosen, claims = [], logo = null } = {}) {
  const chosenKey = nameKey(clean(chosen))
  if (!chosenKey) return []
  /** @type {Map<string, { name: string | null, marks: any[] }>} */
  const groups = new Map()
  const add = (key, mark, shown) => {
    if (!key) return
    const at = [...groups.keys()].find((k) => sameKey(k, key)) ?? key
    if (!groups.has(at)) groups.set(at, { name: null, marks: [] })
    const g = groups.get(at)
    if (g.name === null && shown) g.name = shown
    if (!g.marks.some((m) => m.source === mark.source && m.via === mark.via)) g.marks.push(mark)
  }
  const list = Array.isArray(claims) ? claims : []
  // The logo as the research read it, else as a name claim recorded it (`via: 'logo'`).
  const read =
    logo?.showsName === true ? logo : { showsName: true, readsAs: list.find((c) => c?.via === 'logo')?.name }
  const logoText = logoNameText(read)
  if (logoText)
    add(
      nameKey(logoText),
      { source: 'logo', via: 'logo', text: clean(read.readsAs) },
      logoNameSpelling(logoText)
    )
  list.forEach((c, index) => {
    if (!OWN_MARK_SOURCES.has(c?.source) || c.source === 'logo') return
    const text = clean(c.name)
    if (!text || (c.via !== 'name' && c.via !== 'handle')) return
    if (c.via === 'name') add(nameKey(text), { source: c.source, via: 'name', text, index }, text)
  })
  // Handles last: they only back a name a logo or a display name gave.
  list.forEach((c, index) => {
    const text = clean(c?.name)
    if (!OWN_MARK_SOURCES.has(c?.source) || c.via !== 'handle' || !text) return
    const key = nameKey(text)
    const at = [...groups.keys()].find((k) => sameKey(k, key))
    if (at) add(at, { source: c.source, via: 'handle', text, index }, null)
  })
  return [...groups.entries()]
    .filter(([key, g]) => g.name !== null && !sameKey(key, chosenKey) && !namesMatch(g.name, chosen))
    .map(([, g]) => ({ name: g.name, marks: g.marks }))
}
