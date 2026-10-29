// The fact lists of an item card in a brief build (spec TracyHQ/tracy#189, COO rule of 29/10/2026): the rows of a label and a
// value under a card ("SCHEDULE / Mon + Wed", "DURATION / 45 min") that a template prints for each offering. The brief rarely
// holds the template's own row kinds (a timetable, a duration), but it often holds sourced facts that read well in such a row:
// who the offering is for, where the business serves, how to book, opening hours, a price, a rating. Pure and deterministic.
//
// 🔒 A ROW SHOWS A SOURCED FACT UNDER A LABEL THAT NAMES IT. The row's label is template words, so it is rewritten to name
// the fact ("LEVEL / All ages and levels", "WHERE / Locations across Dubai"). Never a timetable, a duration, a price or a
// person the brief does not hold; never a team member the brief keeps off the site.
// 🔒 ONE LABEL SET PER LIST. The cards of one collection take the same kinds in the same order; a fact of one offering (its
// own price, its own audience) goes to that card only, in the place of its kind.
// 🔒 NEVER MORE ROWS THAN THE TEMPLATE'S. A card keeps at most its own row count; a row with no fact left is emptied, and the
// empty-frame net of the build (`empty-frames.js`) hides an empty row and a box whose rows are all empty.
// 🔒 RULES BY SLOT ROLE AND PATH SHAPE, never by template, business or trade: a row is an item of a JSON list (an object of
// fields, or the index of parallel arrays) or an indexed element of an HTML field, inside one card.
//
// The facts come from the brief's readers: the contact facts (`contact-reading.mjs`, handed in by the site plan), the sourced
// numbers (`stat-box-plan.mjs`), the reading's offerings and audience, and the brief's own channel facts.
import { neutralText } from './neutral-copy.mjs'
import { statFactsOf } from './stat-box-plan.mjs'

/** Roles of a card's fact row: a fact about the offering the template states as a label and a value. */
export const FACT_ROW_ROLES = new Set([
  'offering.schedule',
  'offering.duration_or_unit',
  'offering.price',
  'offering.price_note',
  'offering.variant_meta'
])

/** Kinds of one offering's own facts, then kinds of the business, in the order a list shows them. */
const ITEM_KINDS = ['price', 'duration']
const BUSINESS_KINDS = ['audience', 'area', 'hours', 'booking', 'promise', 'rating']
/** Words of an audience that speak of a level or an age: its row reads "Level", else "Who it's for". */
const LEVEL_WORDS = /\b(?:levels?|ages?|beginners?|abilit(?:y|ies)|advanced|intermediate|experienced)\b/i
/** A channel the business invites messages on, by its fact kind: the name a row says it by. */
const CHANNEL_NAMES = Object.freeze({
  'instagram-dm': 'Instagram',
  'facebook-dm': 'Facebook',
  'tiktok-dm': 'TikTok',
  'x-dm': 'X'
})

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : '')
const capital = (s) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s)
const folded = (value) =>
  ` ${String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `
/** The most characters a slot holds: its own bound and its measured box, the smaller. */
const room = (slot) =>
  Math.min(
    Number.isInteger(slot?.maxCharacters) ? slot.maxCharacters : Infinity,
    Number.isInteger(slot?.fit?.maxCharacters) ? slot.fit.maxCharacters : Infinity
  )
const fits = (slot, value) => [...value].length <= room(slot)
/** The words as the slot's demo prints them: an upper-case demo label stays upper case. */
const cased = (slot, value) => (slot?.fit?.casing === 'upper' ? value.toLocaleUpperCase() : value)

/** Whether a reading item shows on the site: its own flag and the fact behind it. */
function shownItem(brief, item) {
  if (item?.onSite === false || item?.reviewsOnly === true) return false
  if (!item?.factId) return true
  return (brief?.facts ?? []).find((f) => f?.id === item.factId)?.onSite !== false
}

/**
 * Where a slot stands in a list of rows: the list, the row and the field, or null for a slot that is no row.
 *   ["info", "info0", "label"]       an object of fields in an object (or array) of rows
 *   ["rows", "rows[label]", 2]       the index of parallel arrays
 *   /html/body/ul/li[2]/strong/text()  an indexed element of an HTML field
 */
export function rowPlaceOf(slot) {
  const base = `${slot.entity}|${slot.column ?? ''}|${slot.nestedJson ?? ''}`
  const path = Array.isArray(slot.jsonPath) ? slot.jsonPath : null
  if (path && path.length >= 3 && !slot.xpath) {
    const last = path.at(-1)
    if (Number.isInteger(last)) {
      const list = `${base}|${JSON.stringify(path.slice(0, -2))}`
      return { list, row: `${list}#${last}`, order: last, field: String(path.at(-2)) }
    }
    const list = `${base}|${JSON.stringify(path.slice(0, -2))}`
    const key = path.at(-2)
    const order = Number(String(key).match(/(\d+)$/)?.[1] ?? Number.NaN)
    return {
      list,
      row: `${list}#${String(key)}`,
      order: Number.isFinite(order) ? order : null,
      field: String(last)
    }
  }
  const xpath = typeof slot.xpath === 'string' ? slot.xpath : ''
  const m = /^(.*\/[A-Za-z][\w-]*)\[(\d+)\](\/.*)?$/.exec(xpath.replace(/\/text\(\)(?:\[\d+\])?$/, ''))
  if (m) {
    const list = `${base}|${JSON.stringify(path ?? [])}|${m[1]}`
    return { list, row: `${list}#${m[2]}`, order: Number(m[2]), field: m[3] ?? '' }
  }
  return null
}

/**
 * The fact lists of one card: its rows of fact-row roles that stand in a list, each row's label and value slots in map
 * order (one slot: the row holds both, as "Label: value").
 * @param {{slots: any[]}} group
 * @returns {Array<{list: string, rows: Array<{label: any | null, value: any, rest: any[]}>}>}
 */
export function factListsOf(group) {
  const lists = new Map()
  // A place the card's other words share is the card itself (an item of a list of cards), never a row inside it.
  const own = new Set(
    (group.slots ?? [])
      .filter((slot) => !FACT_ROW_ROLES.has(slot.role))
      .map((slot) => rowPlaceOf(slot)?.row)
      .filter(Boolean)
  )
  for (const slot of group.slots ?? []) {
    if (!FACT_ROW_ROLES.has(slot.role) || slot.type !== 'text') continue
    const place = rowPlaceOf(slot)
    if (!place || own.has(place.row)) continue
    const list = lists.get(place.list) ?? new Map()
    const row = list.get(place.row) ?? { order: place.order, slots: [] }
    row.slots.push(slot)
    list.set(place.row, row)
    lists.set(place.list, list)
  }
  return [...lists.entries()].map(([list, rows]) => ({
    list,
    rows: [...rows.values()]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(({ slots }) =>
        slots.length === 1
          ? { label: null, value: slots[0], rest: [] }
          : { label: slots[0], value: slots[1], rest: slots.slice(2) }
      )
  }))
}

/**
 * 🔒 A FACT ROW IS SHOWN WHOLE OR EMPTIED WHOLE (COO decision, #189 items 14 and 15): the other cells of every fact row one
 * of `keys` belongs to. A write that empties one cell (a refused value, a demo line swept after the write) empties the
 * row's label and its other cells with it, so a visitor never reads a label over nothing, and the empty-frame net takes
 * the row's frame off. Rows are read per card (`group.id`, else the entity), as `factListsOf` reads them.
 * @param {any[]} slots - the content map's slots
 * @param {Iterable<string>} keys - the keys being emptied
 * @returns {any[]} the slots to empty beside them, each once
 */
export function wholeFactRowsOf(slots, keys) {
  const emptied = new Set(keys)
  const cards = new Map()
  for (const slot of slots ?? []) {
    if (!slot?.key) continue
    const card = slot.group?.id ?? slot.entity
    cards.set(card, [...(cards.get(card) ?? []), slot])
  }
  const out = new Map()
  for (const card of cards.values())
    for (const { rows } of factListsOf({ slots: card }))
      for (const row of rows) {
        const cells = [row.label, row.value, ...row.rest].filter(Boolean)
        if (!cells.some((cell) => emptied.has(cell.key))) continue
        for (const cell of cells) if (!emptied.has(cell.key)) out.set(cell.key, cell)
      }
  return [...out.values()]
}

/** The distinctive words of an offering's name: those no other offering of the brief shares, of four letters or more. */
function ownWords(offering, offerings) {
  const others = offerings
    .filter((o) => o.id !== offering.id)
    .flatMap((o) => folded(o.label).trim().split(' '))
  return folded(offering.label)
    .trim()
    .split(' ')
    .filter((w) => [...w].length >= 4 && !others.includes(w))
}

/** The one offering an audience line names (its whole name, or a word only its name has), else null. */
function offeringNamedBy(line, offerings) {
  const said = folded(line)
  const hits = offerings.filter(
    (o) => said.includes(folded(o.label)) || ownWords(o, offerings).some((w) => said.includes(` ${w} `))
  )
  return hits.length === 1 ? hits[0] : null
}

/** The prices and the duration a service fact of the brief states for an offering, by its name. */
function ownNumbers(brief, offering) {
  const fact = (brief?.facts ?? []).find(
    (f) =>
      f?.field === 'services' &&
      f?.onSite !== false &&
      folded(f?.value?.name ?? f?.value?.label) === folded(offering.label)
  )
  const variants = Array.isArray(fact?.value?.variants) ? fact.value.variants : []
  const prices = variants.map((v) => text(v?.price?.raw)).filter(Boolean)
  const timed = variants.find(
    (v) => v?.duration && Number.isFinite(Number(v.duration.amount)) && text(v.duration.unit)
  )
  return {
    price: prices.length ? prices.join(' / ') : '',
    duration: timed ? `${timed.duration.amount} ${text(timed.duration.unit)}` : ''
  }
}

/** The channels the business takes bookings or messages on, by name: a verified booking link, WhatsApp, its own DMs. */
function channelsOf(brief, contact, locale) {
  const names = []
  if ((brief?.integrations ?? []).some((x) => x?.kind === 'booking' && x?.verified === true))
    names.push(neutralText('neutral.factRow.online', locale))
  if (text(contact?.whatsapp?.value)) names.push('WhatsApp')
  for (const f of brief?.facts ?? [])
    if (f?.field === 'contactChannels' && f?.onSite === true && CHANNEL_NAMES[f?.value?.kind])
      names.push(CHANNEL_NAMES[f.value.kind])
  const unique = [...new Set(names.filter(Boolean))].slice(0, 3)
  if (unique.length === 0) return text(contact?.phone?.value)
  const or = ` ${neutralText('neutral.factRow.or', locale)} `
  return unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(', ')}${or}${unique.at(-1)}`
}

/**
 * Every fact a row may show, for the cards of the brief's offerings: the business's own, and each offering's.
 * @param {object} brief
 * @param {Array<{id: string, label: string}>} offerings - the brief's offerings the site shows
 * @param {Record<string, {value: string}>} [contact] - the site plan's contact facts (`readContact`)
 * @param {{locale?: string}} [options]
 * @returns {{order: string[], shared: Record<string, {kind: string, label: string, value: string}>,
 *   own: Record<string, Record<string, {kind: string, label: string, value: string}>>}}
 */
export function factRowFacts(brief, offerings, contact = {}, { locale = 'en' } = {}) {
  const row = (kind, key, value) => ({ kind, label: neutralText(`neutral.factRow.${key}`, locale), value })
  const shared = {}
  const own = Object.fromEntries(offerings.map((o) => [o.id, {}]))
  const audience = (brief?.reading?.audience ?? []).filter((a) => text(a?.label) && shownItem(brief, a))
  const audienceRow = (line) => row('audience', LEVEL_WORDS.test(line) ? 'level' : 'audience', capital(line))
  for (const a of audience) {
    const named = offeringNamedBy(`${a.label} ${a.quote ?? ''}`, offerings)
    if (named) own[named.id].audience ??= audienceRow(text(a.label))
    else shared.audience ??= audienceRow(text(a.label))
  }
  const area = text(contact?.serviceArea?.value) || text(contact?.address?.value)
  if (area) shared.area = row('area', 'area', area)
  const hours = text(contact?.hours?.value)
  if (hours) shared.hours = row('hours', 'hours', hours)
  const channels = channelsOf(brief, contact, locale)
  if (channels) shared.booking = row('booking', 'booking', channels)
  // A line the business says of itself, once: never one an audience or an area row already shows.
  const said = new Set(
    [...Object.values(shared), ...Object.values(own).flatMap(Object.values)].map((r) => folded(r.value))
  )
  for (const s of (brief?.reading?.story ?? []).filter((x) => text(x?.label) && shownItem(brief, x))) {
    if ([...said].some((v) => v.includes(folded(s.label)) || folded(s.label).includes(v))) continue
    shared.promise = row('promise', 'promise', capital(text(s.label)))
    break
  }
  const rating = statFactsOf(brief).find((f) => f.kind === 'rating')
  if (rating)
    shared.rating = row(
      'rating',
      'rating',
      `${rating.value} ${neutralText('neutral.factRow.onGoogle', locale)}`
    )
  for (const o of offerings) {
    const { price, duration } = ownNumbers(brief, o)
    if (price) own[o.id].price = row('price', 'price', price)
    if (duration) own[o.id].duration = row('duration', 'duration', duration)
  }
  // Kinds every offering holds lead the list; then the business's; then a kind only some offerings hold.
  const everyone = (kind) => offerings.length > 0 && offerings.every((o) => own[o.id][kind])
  const someone = (kind) => offerings.some((o) => own[o.id][kind])
  const order = [
    ...ITEM_KINDS.filter(everyone),
    ...BUSINESS_KINDS.filter((kind) => shared[kind] || someone(kind)),
    ...ITEM_KINDS.filter((kind) => someone(kind) && !everyone(kind))
  ]
  return { order, shared, own }
}

/**
 * The words of one card's fact lists: each row takes the next fact of the list's order that fits its slots, under a label
 * that names it; the rows beyond the facts are emptied. One card alone: `planCollectionFactRows` of that card.
 * @param {{id?: string, slots: any[]}} group - a kept card
 * @param {{id: string}} assigned - the brief offering the card shows
 * @param {ReturnType<typeof factRowFacts>} facts
 * @returns {{values: Record<string, string>, blanks: any[]}}
 */
export function planFactRows(group, assigned, facts) {
  return planCollectionFactRows([{ group, assigned }], facts)[0]
}

/** The words a row shows for a fact, by slot key, or null when the fact does not fit the row. */
function rowWords(row, fact) {
  if (row.label) {
    const label = cased(row.label, fact.label)
    const value = cased(row.value, fact.value)
    if (!fits(row.label, label) || !fits(row.value, value)) return null
    return { [row.label.key]: label, [row.value.key]: value }
  }
  const line = `${fact.label}: ${fact.value}`
  return fits(row.value, line) ? { [row.value.key]: cased(row.value, line) } : null
}

/**
 * 🔒 THE CARDS OF ONE LIST SHARE ONE SET OF ROW LABELS (COO rule, #189 round 9): row n of every kept card of a collection
 * shows the same kind under the same label, each card with its own value; a kind some card has no value for, no room for,
 * or a different label for is shown on none of them, and a list keeps only as many rows as its shortest card holds. A
 * visitor never compares a card that says "Level / Where" with one that says "Level" and one with no row at all.
 * @param {Array<{group: {slots: any[]}, assigned: {id: string}}>} cards - the kept cards of one collection, in order
 * @param {ReturnType<typeof factRowFacts>} facts
 * @returns {Array<{values: Record<string, string>, blanks: any[]}>} per card, in the order given
 */
export function planCollectionFactRows(cards, facts) {
  const lists = cards.map(({ group }) => factListsOf(group))
  const factOf = (card, kind) => facts.own?.[card.assigned?.id]?.[kind] ?? facts.shared?.[kind] ?? null
  const shared = cards.length ? Math.min(...lists.map((l) => l.length)) : 0
  /** Per list position, the kinds its rows show, in row order. */
  const kinds = []
  for (let j = 0; j < shared; j += 1) {
    const room = Math.min(...lists.map((l) => l[j].rows.length))
    const chosen = []
    let next = 0
    while (chosen.length < room && next < facts.order.length) {
      const kind = facts.order[next++]
      const per = cards.map((card) => factOf(card, kind))
      if (per.some((f) => !f) || new Set(per.map((f) => f.label)).size !== 1) continue
      const i = chosen.length
      if (per.every((fact, c) => rowWords(lists[c][j].rows[i], fact))) chosen.push(kind)
    }
    kinds.push(chosen)
  }
  return cards.map((card, c) => {
    const values = {}
    const blanks = []
    lists[c].forEach(({ rows }, j) =>
      rows.forEach((row, i) => {
        const kind = kinds[j]?.[i]
        const words = kind ? rowWords(row, factOf(card, kind)) : null
        if (words) Object.assign(values, words)
        const cells = words ? row.rest : [row.label, row.value, ...row.rest]
        for (const slot of cells) if (slot) blanks.push(slot)
      })
    )
    return { values, blanks }
  })
}
