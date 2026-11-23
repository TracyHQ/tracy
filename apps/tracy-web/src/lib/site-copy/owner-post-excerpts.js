// A citation proves the source of an article, not that its new narrative happened (#545).
// Owner post bodies therefore use faithful excerpts; layout pressure must never invent event details.
const arr = (value) => (Array.isArray(value) ? value : [])
const normalize = (value) =>
  String(value).normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/gu, ' ').trim()
const word = (value) => /[\p{L}\p{N}_]/u.test(value ?? '')
const isPost = (fact) => fact?.field === 'posts' && fact.onSite !== false && fact.value?.kind === 'post'

/**
 * The opening of a source post that fits `max` characters, in its own words and order: whole sentences while they fit, else
 * the words that fit, cut between two words. A prefix of the post is a faithful excerpt by construction.
 */
export function openingExcerpt(source, max) {
  const text = normalize(source)
  if (!text) return ''
  const limit = Number.isFinite(max) && max > 0 ? max : text.length
  if (text.length <= limit) return text
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/gu) ?? [text]
  let out = ''
  for (const s of sentences) {
    if ((out + s).trim().length > limit) break
    out += s
  }
  if (out.trim()) return out.trim()
  const cut = text.slice(0, limit + 1)
  const at = cut.search(/\s\S*$/u)
  return (at > 0 ? cut.slice(0, at) : text.slice(0, limit)).trim()
}

export function ownerPostExcerpt({ role, plannedIds, citedIds, items, facts, maxCharacters }) {
  if (role !== 'article.lead') return null
  const byId = new Map(arr(facts).map((f) => [f?.id, f]))
  const planned = [...new Set(arr(plannedIds))].filter((id) => isPost(byId.get(id)))
  const cited = [...new Set(arr(citedIds))]
  const citedPosts = cited.filter((id) => isPost(byId.get(id)))
  const fact = planned.length === 1 ? byId.get(planned[0]) : null
  const source =
    fact?.field === 'posts' &&
    fact.onSite !== false &&
    fact.value?.kind === 'post' &&
    typeof fact.value.text === 'string'
      ? normalize(fact.value.text)
      : ''
  const text = arr(items).map(normalize).join(' ')
  let start = source.indexOf(text)
  let matches = false
  while (text && start >= 0) {
    const end = start + text.length
    if (!(word(text[0]) && word(source[start - 1])) && !(word(text.at(-1)) && word(source[end]))) {
      matches = true
      break
    }
    start = source.indexOf(text, start + 1)
  }
  const valid = Boolean(
    source &&
      matches &&
      cited.every((id) => byId.has(id)) &&
      citedPosts.length === 1 &&
      citedPosts[0] === planned[0]
  )
  return {
    valid,
    // What a faithful body would be when the planned post is known: its opening, within the slot's limit, citing that post.
    // The write step writes it in place of an unfaithful body (dev lat31b, 23/11/2026: one blog body that was no excerpt
    // stopped the whole write, and Arabian Tea House stayed the template).
    ...(!valid && source ? { excerpt: openingExcerpt(source, maxCharacters), postId: planned[0] } : {}),
    detail:
      'article body must be one faithful original post excerpt from its planned owner post; keep its words and order, without new event claims. A verified excerpt may be shorter than the demo; return surplus slots to planner.'
  }
}

export function ownerPostExcerptFor(slot, idx, brief) {
  return ownerPostExcerpt({
    role: idx.kitSlots.get(slot.slot)?.role,
    plannedIds: idx.expected.get(slot.slot)?.factIds,
    citedIds: slot.factIds,
    items: slot.items,
    facts: brief?.facts,
    maxCharacters: idx.kitSlots.get(slot.slot)?.maxCharacters
  })
}
