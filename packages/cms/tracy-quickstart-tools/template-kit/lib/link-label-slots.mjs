// Every link whose shown words a slot prints names that slot as its label (`labelId`), so a planner who rewrites the
// slot knows the link's words change with it, and the other way round. The slot is found in this order: the text slot
// of the link's own address group (a button's label and address are one row of the content map), a slot the block
// declares, a slot of the block's own entities, and last the one content map slot with those words (an item's title
// on a listing that links to the item). Words two unrelated slots share are a coincidence and pick nothing; words
// no slot prints (a CMS string such as "Read more") are the template's and need no label slot. Words without a letter
// (a phone number) pick only a slot of the link's own address group or block: a number alone proves nothing wider.
// A link a rich text slot prints itself (an `<a>` in its HTML, `((a …))` in a Joomla ACM field) is no coincidence: a
// slot of the link's own block whose HTML holds a link with those words comes before the one slot elsewhere with
// those words whole; links repeating the same words (one list per card) take each its own twin slot, word by word.
// A link wrapping a whole card of the block (a member's name and role in one `<a>`) shows the card's text slots one
// after another: it names the card's label slot (the name). Words several items share (two articles of one title, a
// category and a tag both "Animals") name the slot of the item the link opens. A listing that prints each item's count
// after its title ("Events 9") or a block string after the words ("Melbourne, Australia Open in Google Maps") shows the
// slot's words with the CMS's own: the slot is found from what is left (beside a block string, only the block's own);
// a sign before the words (the `$` of a command chip) is dropped. A link wrapping a whole card of an item (tag, title,
// a cut excerpt, date) names the title of the item it opens, when that title shows whole among its words.
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'
import { declaredIn } from './page-coverage.mjs'

const LABEL_ROLE = /(_label|\.title|\.name)$/
const hasLetters = (s) => /\p{L}/u.test(s)
const hasDigits = (s) => /\p{N}/u.test(s)
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The words `w` stand whole in `n`: no letter or digit right before or after them. */
const wholeIn = (n, w) =>
  !!w && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped(w)}(?:$|[^\\p{L}\\p{N}])`, 'u').test(n)

/** A resolver: (block, link, declared ids of the block, ids its links already name) -> the label slot id, or null. */
function labelResolver(map) {
  const text = (map.slots ?? []).filter((s) => s.type === 'text')
  const byWords = new Map()
  for (const s of text) {
    const n = normText(s.sample ?? '')
    if (n) byWords.set(n, [...(byWords.get(n) ?? []), s])
  }
  const inLinks = new Map()
  for (const s of text)
    for (const m of String(s.sample ?? '').matchAll(
      /(?:<a\b[^>]*>|\(\(a\b(?:(?!\)\)).)*\)\))(.*?)(?:<\/a>|\(\(\/a\)\))/gis
    )) {
      const n = normText(m[1].replace(/<[^>]*>|\(\([^)]*\)\)/g, ' '))
      if (n && !(inLinks.get(n) ?? []).includes(s)) inLinks.set(n, [...(inLinks.get(n) ?? []), s])
    }
  const entityOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s.entity]))
  const cards = new Map()
  for (const s of text) if (s.group?.id) cards.set(s.group.id, [...(cards.get(s.group.id) ?? []), s])
  const urlGroup = new Map(
    (map.slots ?? [])
      .filter((s) => s.type === 'url' && s.group?.id)
      .map((s) => [neutralKey(s.key), s.group.id])
  )
  // Label roles first, then the order given; a slot another link of the block already names is taken last, so
  // links repeating the same words (a "Select plan" button on each tab) take each its own twin slot.
  const first = (list, used) => {
    const order = [...list.filter((s) => LABEL_ROLE.test(s.role ?? '')), ...list]
    return order.find((s) => !used.has(neutralKey(s.key))) ?? order[0] ?? null
  }
  const opened = openedBy(map)
  // A link wrapping a whole card of an item (its tag, title, a cut excerpt, author and date in one `<a>`) shows that
  // item's title whole among other words: the title, name or heading slot of the item the link opens, the longest.
  // A sign glued to the title (the `#` of a tag) is a word boundary too.
  const titleIn = (n, entities) => {
    for (const e of entities) {
      const hit = text
        .filter((s) => s.entity === e && /(_label|\.title|\.name|\.heading)$/.test(s.role ?? ''))
        .filter((s) => hasLetters(normText(s.sample ?? '')) && wholeIn(n, normText(s.sample)))
        .sort((x, y) => normText(y.sample).length - normText(x.sample).length)[0]
      if (hit) return neutralKey(hit.key)
    }
    return null
  }
  const resolveWords = (b, l, n, declared, used, nearOnly = false) => {
    const letters = hasLetters(n)
    if (!n || (!letters && !hasDigits(n))) return null
    const same = byWords.get(n) ?? []
    // The block's declared slots, then those of its own entities, then those of the entities its declared slots
    // belong to (a header block with no source entity of its own, printing a module's phone slot beside its other
    // slots): one list, so a twin of any kind is free.
    const owners = new Set([...declared].map((k) => entityOf.get(k)).filter(Boolean))
    const nearOf = (list) => [
      ...list.filter((s) => declared.has(neutralKey(s.key))),
      ...list.filter((s) => s.entity === b.source?.entity || (b.source?.contains ?? []).includes(s.entity)),
      ...list.filter((s) => owners.has(s.entity))
    ]
    const rich = letters ? nearOf(inLinks.get(n) ?? []) : []
    const printedBy = rich.find((s) => !used.has(`${neutralKey(s.key)}|${n}`)) ?? rich[0] ?? null
    const card =
      letters && !same.length && !printedBy ? cardOf(n, nearOf, cards, first, opened(l.target)) : null
    if (!same.length && !printedBy && !card) return null
    const group = urlGroup.get(l.id)
    const near = nearOf(same)
    if (nearOnly) return near.length ? neutralKey(first(near, used).key) : card ? neutralKey(card.key) : null
    const pick =
      (group ? same.find((s) => s.group?.id === group) : null) ??
      openedOf(same, opened(l.target), used, first) ??
      first(near, used) ??
      printedBy ??
      card ??
      (letters && same.length === 1 ? same[0] : null)
    return pick ? neutralKey(pick.key) : null
  }
  const textByKey = new Map(text.map((s) => [neutralKey(s.key), s]))
  // A card link of the block's own slots printed one after another (a help card's title and line, a post's
  // category and title), with the block's strings between them: the title or name slot, else the first one shown.
  const ownCard = (b, n, declared) => {
    const parts = [...(declared ?? [])]
      .map((k) => textByKey.get(k))
      .filter((s) => s && hasLetters(normText(s.sample ?? '')) && wholeIn(n, normText(s.sample)))
      .sort((x, y) => normText(y.sample).length - normText(x.sample).length)
    let rest = n
    const shown = []
    for (const s of parts) {
      const w = normText(s.sample)
      if (!rest.includes(w)) continue
      rest = rest.split(w).join(' ')
      shown.push(s)
    }
    for (const t of b.fixedText ?? []) {
      const f = normText(t.text ?? '')
      if (f) rest = rest.split(f).join(' ')
    }
    if (shown.length < 2 || /[\p{L}\p{N}]/u.test(rest)) return null
    const at = (s) => n.indexOf(normText(s.sample))
    const titled = shown.filter((s) => /(\.title|\.name|\.heading)$/.test(s.role ?? ''))
    const pick = titled[0] ?? [...shown].sort((x, y) => at(x) - at(y))[0]
    return neutralKey(pick.key)
  }
  // A link that shows its own e-mail or phone address, written inside a text slot of the block's own item (a body
  // that prints `<a href="mailto:...">` in its text): that text slot, when it is the only one.
  const addressIn = (b, l, n) => {
    const to = String(l.target ?? '')
    if (!n || !/^(?:mailto|tel):/i.test(to)) return null
    const address = decodeURIComponent(to.replace(/^[a-z]+:/i, '').split('?')[0])
    const digits = (x) => x.replace(/\D/g, '')
    const same = /^tel:/i.test(to) ? digits(address) === digits(n) : normText(address) === n
    if (!same) return null
    const own = new Set([b.source?.entity, ...(b.source?.contains ?? [])].filter(Boolean))
    const hits = text.filter((s) => own.has(s.entity) && wholeIn(normText(s.sample ?? ''), n))
    return hits.length === 1 ? neutralKey(hits[0].key) : null
  }
  const shownWords = (b, l, declared, used) => {
    const n = normText(l.label ?? '')
    const found = resolveWords(b, l, n, declared, used)
    if (found || !n) return found
    const counted = n.replace(/\s\p{N}+$/u, '')
    if (counted !== n && byWords.has(counted)) return resolveWords(b, l, counted, declared, used)
    // A sign the template prints before the words (the `$` of a command chip) is no part of them.
    const signed = n.replace(/^[^\p{L}\p{N}]+/u, '')
    if (signed !== n && byWords.has(signed)) return resolveWords(b, l, signed, declared, used)
    const fixed = (b.fixedText ?? [])
      .map((t) => normText(t.text ?? ''))
      .filter(Boolean)
      .sort((x, y) => y.length - x.length)
    let rest = n
    for (const f of fixed) rest = rest.split(f).join(' ').replace(/\s+/g, ' ').trim()
    // What is left beside the block's string names only a slot of the block or its entities, and only when it is no
    // piece of a fixed text itself: a step link ("Previous article: X" then X) is the template's words.
    if (rest === n) return titleIn(n, opened(l.target))
    if (!rest || !hasLetters(rest) || fixed.some((f) => f.includes(rest))) return null
    return resolveWords(b, l, rest, declared, used, true) ?? titleIn(n, opened(l.target))
  }
  return (b, l, declared, used = new Set()) => {
    const n = normText(l.label ?? '')
    const found = shownWords(b, l, declared, used) ?? (n ? ownCard(b, n, declared) : null)
    if (found) return found
    // A picture link whose words are a badge and a rating, named by its own aria-label or title (the item's title).
    const name = l.icon?.title
    if (name && normText(name) !== n) {
      const named = shownWords(b, { ...l, label: name }, declared, used)
      if (named) return named
    }
    return addressIn(b, l, n)
  }
}

/**
 * The entities a link address opens, the most specific first: the item its map page shows (`view=category&id=10`),
 * the item whose alias is the last segment (a Joomla address with no menu item of its own, `component/tags/tag/animals`
 * names a tag), the item page at it, and the map page itself.
 */
function openedBy(map) {
  const clean = (p) =>
    String(p ?? '')
      .replace(/^[a-z]+:\/\/[^/]+/i, '')
      .replace(/[?#].*$/, '')
      .replace(/^\/?(?:index\.php\/?)?/, '')
      .replace(/\/$/, '')
  const pages = new Map()
  for (const p of map.pages ?? []) {
    const q = new URLSearchParams(String(p.link ?? '').split('?')[1] ?? '')
    const view = q.get('view') === 'author' ? 'user' : q.get('view')
    const item =
      /^(category|article|tag|contact|user)$/.test(view ?? '') && (q.get('id') ?? q.get('id[0]'))
        ? `${view}-${q.get('id') ?? q.get('id[0]')}`
        : null
    pages.set(clean(p.route), [item, p.entity].filter(Boolean))
  }
  const items = new Map(Object.entries(map.itemPages ?? {}).map(([e, ip]) => [clean(ip.path), e]))
  const byAlias = new Map()
  // An article names its alias (a WordPress post its slug); a tag or a category its path, whose last segment is its alias; an author (a user) its
  // username.
  for (const e of map.entities ?? []) {
    const alias =
      e.identity?.alias ??
      e.identity?.slug ??
      e.identity?.username ??
      String(e.identity?.path ?? '')
        .split('/')
        .pop()
    if (alias) byAlias.set(alias, [...(byAlias.get(alias) ?? []), e])
  }
  return (target) => {
    const r = clean(target)
    if (!r) return []
    const seg = r.split('/')
    const view = seg.at(-2)
    const kind = view === 'author' ? 'user' : view
    // An alias may start with a number (`48-hours-in-porto`): the whole segment first, then without an id prefix.
    const last = seg.at(-1)
    const named = (byAlias.get(last) ?? byAlias.get(last.replace(/^\d+-/, '')) ?? []).filter(
      (e) => !/^(tag|category|article|contact|user)$/.test(kind) || e.kind === kind
    )
    const page = pages.get(r) ?? []
    return [...page.slice(0, -1), ...named.map((e) => e.key), items.get(r), ...page.slice(-1)].filter(Boolean)
  }
}

// The slot of the first entity the link opens among slots sharing its words, or null.
function openedOf(same, entities, used, first) {
  for (const e of entities) {
    const own = same.filter((s) => s.entity === e)
    if (own.length) return first(own, used)
  }
  return null
}

// The label slot of the card of the block's own whose text slots, in map order, are the link's words, or null.
function cardOf(n, nearOf, cards, first, opens = []) {
  // The groups of the entities the link opens come first: a person's card on an author list, not a team member's
  // card elsewhere of the same words.
  const rank = (parts) => {
    const i = opens.findIndex((e) => parts.some((s) => s.entity === e))
    return i < 0 ? opens.length : i
  }
  for (const parts of [...cards.values()].sort((a, b) => rank(a) - rank(b))) {
    const shown = parts.filter((s) => {
      const w = normText(s.sample ?? '')
      return w && n.includes(w)
    })
    if (shown.length < 2 || shown.map((s) => normText(s.sample)).join(' ') !== n) continue
    if (nearOf(shown).length) return first(shown, new Set())
  }
  return null
}

/** Sets `labelId` on every link of the kit that shows a slot's words and names none. Returns how many were set. */
export function linkLabelSlots(kit, map) {
  const resolve = labelResolver(map)
  const declared = declaredIn(kit)
  let set = 0
  for (const b of kit.blocks) {
    const used = new Set((b.links ?? []).map((l) => l.labelId).filter(Boolean))
    for (const l of b.links ?? []) {
      if (l.labelId) continue
      const id = resolve(b, l, declared.get(b.id), used)
      if (id) {
        l.labelId = id
        used.add(id).add(`${id}|${normText(l.label ?? '')}`)
        set++
      }
    }
  }
  return set
}

/**
 * Gate part: links that show a slot's words but name no label slot. Each one is a failure, named by block, link and
 * the slot it should name.
 * @param {{kit: object, map: object, fail: Function}} o
 * @returns {number}
 */
export function linksWithoutLabelSlot({ kit, map, fail }) {
  const resolve = labelResolver(map)
  const declared = declaredIn(kit)
  let missing = 0
  for (const b of kit.blocks)
    for (const l of b.links ?? []) {
      if (l.labelId) continue
      const id = resolve(b, l, declared.get(b.id))
      if (!id) continue
      missing++
      fail(
        'linksWithoutLabelSlot',
        `blocks[${b.id}].links[${l.id}] ${id}`,
        `the link "${String(l.label).slice(0, 50)}" shows the words of ${id} but names no label slot`
      )
    }
  return missing
}
