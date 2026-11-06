// The finisher's content orders (#422, spec #418 orders 2 to 6), rows of ORDER_KINDS (repair-orders.js) that check themselves
// (`validate`): fix one link, fix or remove one demo item, fix one picture's alt, fix one page's title or description, and mark
// accent emphasis in one heading. The fixer only proposes; code holds every order to these rules and an order that breaks one
// is dropped with its reason, nothing written:
//   - new words and addresses come only from the brief, the site copy file, step 8's picture descriptions and the pages the
//     written site keeps (repair-facts.js); an order whose replacement is not found there is refused, never filled in;
//   - an order is tied to its fault: the slot the finder named, or a slot of the page it was seen on (a page's title: that page);
//   - it changes one value, and writes through the write step's doors under its own apply id, so the checker can revert it.
// The fault kinds that call for these orders are in fault-kinds.js (#423); each lists the order kinds that repair it.
import {
  hasEmphasisCodes,
  showsRawCodes,
  storageOf,
  visibleText
} from '../../lib/site-copy/emphasis-markup.js'
import { EMPHASIS_MAX_SHARE, spanMarkOf, withEmphasis } from '../../lib/site-copy/inline-emphasis.js'
import { international, phoneOf } from '../phone-links.js'
import { emphasisHtmlWrite, readRowValue, rowFieldWrite, rowReadOf } from './content-repair-writes.js'

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const ADDRESS = /^(https?:|\/|#|index\.php)/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+(]?[\d\s().-]{6,}$/
const timesIn = (text, needle) => (needle ? text.split(needle).length - 1 : 0)
const no = (reason) => ({ ok: false, reason })

/** The slot an order names, held to the kit, to what this run wrote and to the fault: `{ slot, key, current }` or a refusal. */
function slotOf(order, { fault, kitSlots, pageSlots, keyOf, currentOf }) {
  const slot = order.slot
  if (typeof slot !== 'string' || !kitSlots.has(slot))
    return no(`slot ${JSON.stringify(slot ?? null)} is not a slot the kit has`)
  const key = keyOf(slot)
  const current = key ? currentOf(key) : undefined
  if (!key || typeof current !== 'string')
    return no(`slot ${slot} was not written by this run, so the site has no value to repair there`)
  if (fault.slot && slot !== fault.slot)
    return no(`the order targets ${slot}, the finder named ${fault.slot}`)
  if (!fault.slot && !pageSlots(fault.page).has(slot))
    return no(`${slot} is not on ${fault.page}, where the fault was seen`)
  return { ok: true, slot, key, current }
}

/** A contract repair of one slot, unless it writes what the slot holds already. */
const slotRepair = (at, after) =>
  after === at.current
    ? no(`a no-op: the new value is what ${at.slot} holds now, so nothing is written`)
    : { ok: true, slot: at.slot, key: at.key, current: at.current, after, changes: { [at.key]: after } }

/** Fix one link: a slot that holds an address gets the address of a page the written site keeps. */
function validateLink(order, context) {
  const at = slotOf(order, context)
  if (!at.ok) return at
  if (!ADDRESS.test(at.current.trim())) return no(`${at.slot} holds no address, so it is no link`)
  const to = `/${String(order.to ?? '').replace(/^\/+/, '')}`
  if (!context.sitePages.some((p) => p.path === to))
    return no(
      `no page of the site is at ${JSON.stringify(order.to ?? null)}: a link goes only to a page the site keeps`
    )
  const route = to === '/' ? null : to.slice(1)
  const listed = (context.site?.pages ?? []).find((p) =>
    route === null
      ? p?.route === 'home' || p?.route === ''
      : String(p?.route ?? '').replace(/^\/+/, '') === route
  )
  const item = /^menuItem-(\d+)$/.exec(String(listed?.entity ?? ''))
  if (!item) return no(`the site lists no menu item that opens ${to}, so it has no address to link to`)
  return slotRepair(at, `index.php?Itemid=${item[1]}`)
}

const itemField = (item) => (EMAIL.test(item) ? 'email' : PHONE.test(item) ? 'phone' : 'name')
const isBriefs = (item, field, values) =>
  field === 'phone'
    ? Boolean(
        phoneOf(
          item,
          values.map((v) => ({ digits: international(v) }))
        )
      )
    : values.some((v) => squash(v).toLowerCase() === squash(item).toLowerCase())

/**
 * Fix or remove one demo item: a phone, an e-mail or a name of the demo inside one slot is replaced by the brief's fact of the
 * same field, or, when the brief has none, taken out alone. A slot whose block would be left with no words is refused.
 */
function validateDemoItem(order, context) {
  const at = slotOf(order, context)
  if (!at.ok) return at
  const item = typeof order.item === 'string' ? order.item.trim() : ''
  if (!item) return no('the order names no demo item')
  const field = itemField(item)
  const values = context.brief.get(field) ?? []
  if (isBriefs(item, field, values))
    return no(`${JSON.stringify(item)} is the brief's own ${field}, not the demo's`)
  if (timesIn(at.current, item) !== 1)
    return no(`${at.slot} does not hold ${JSON.stringify(item)} exactly once`)
  if (field === 'name' && !String(context.mapSlotOf(at.key)?.sample ?? '').includes(item))
    return no(
      `${JSON.stringify(item)} is not in the demo's words for ${at.slot}, so it is not shown to be the demo's`
    )
  if (order.with !== undefined && order.with !== null) {
    const fact = values.find((v) => squash(v) === squash(order.with))
    if (!fact) return no(`${JSON.stringify(order.with)} is no ${field} the brief gives`)
    return slotRepair(
      at,
      at.current.replace(item, () => fact)
    )
  }
  if (values.length)
    return no(
      `the brief gives a ${field} to put in its place (${values.join(', ')}): the item is replaced, never removed`
    )
  const after = at.current
    .replace(item, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  if (!visibleText(after)) {
    const block = context.kit?.blocks?.find((b) => b?.id === context.kitSlotOf(at.slot)?.block)
    const others = (block?.slots ?? []).filter((s) => s?.id !== at.slot)
    const kept = others.some((s) => {
      const key = context.keyOf(s.id)
      return key && visibleText(context.currentOf(key) ?? '')
    })
    if (!kept)
      return no(
        `removing it would leave block ${block?.id ?? '(unknown)'} with no words: one item, never a whole block`
      )
  }
  return slotRepair(at, after)
}

/** Fix one picture's alt: the words step 8 saw in the picture of that frame, or the site copy's alt for it. */
function validateAlt(order, context) {
  const at = slotOf(order, context)
  if (!at.ok) return at
  const frame = context.kitSlotOf(order.frame)
  if (!frame || frame.type !== 'image' || frame.block !== context.kitSlotOf(at.slot)?.block)
    return no(`${JSON.stringify(order.frame ?? null)} is no picture of the block ${at.slot} is in`)
  const sources = [context.seen.get(order.frame), context.copyAlts.get(order.frame)].filter(Boolean)
  if (typeof order.text !== 'string' || !sources.some((s) => squash(s) === squash(order.text)))
    return no(`the alt is neither step 8's description of ${order.frame} nor the site copy's alt for it`)
  return slotRepair(
    at,
    sources.find((s) => squash(s) === squash(order.text))
  )
}

/** Fix one page's title or description: the site copy's words for that page, where the write step put them. */
async function validatePageMeta(order, context) {
  const { fault } = context
  if (!['title', 'description'].includes(order.field))
    return no('the order names neither the title nor the description')
  if (order.page !== fault.page)
    return no(`the order targets ${order.page}, the fault was seen on ${fault.page}`)
  const page = context.sitePages.find((p) => p.path === order.page)
  if (!page?.id)
    return no(`${order.page} is no kit page of this site, so the site copy gives it no ${order.field}`)
  const slot = `${page.id}:${order.field}`
  const wanted = context.copySeo.get(page.id)?.[order.field]
  if (typeof order.text !== 'string' || !wanted || squash(wanted) !== squash(order.text))
    return no(`the ${order.field} is not the site copy's ${order.field} for ${page.id}`)
  const read = rowReadOf(context.reportLineOf(slot)?.readFrom)
  if (!read) return no(`the write step left ${slot} no place on the site, so there is nowhere to write it`)
  const held = await readRowValue(context.door, context.siteKey, read)
  if (held.reason) return no(held.reason)
  if (held.current === wanted) return no(`a no-op: ${slot} holds the site copy's words already`)
  return {
    ok: true,
    slot,
    key: null,
    current: held.current ?? '',
    after: wanted,
    write: rowFieldWrite(read, held.fieldWith(wanted))
  }
}

/** Mark accent emphasis: one or two words the heading holds once, wrapped in the demo's mark; never a new or changed word. */
function validateEmphasis(order, context) {
  const at = slotOf(order, context)
  if (!at.ok) return at
  const kitSlot = context.kitSlotOf(at.slot)
  if (!spanMarkOf(kitSlot)) return no(`the template marks no accent words in ${at.slot}`)
  if (hasEmphasisCodes(at.current) || showsRawCodes(at.current) || /<[a-z/]/i.test(at.current))
    return no(`${at.slot} holds markup already`)
  const words = typeof order.words === 'string' ? squash(order.words) : ''
  const count = words ? words.split(' ').length : 0
  if (count < 1 || count > 2) return no('an emphasis is one or two words')
  const whole = new RegExp(
    `(^|[^\\p{L}\\p{N}])${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`,
    'gu'
  )
  if ((at.current.match(whole) ?? []).length !== 1)
    return no(`${at.slot} does not hold ${JSON.stringify(words)} once, as whole words`)
  if (words.length >= visibleText(at.current).length * EMPHASIS_MAX_SHARE)
    return no('an emphasis is never most of the heading')
  const [after] = withEmphasis([at.current], words, kitSlot)
  if (visibleText(after) !== visibleText(at.current))
    return no('the emphasis would change the words of the heading')
  const storage = storageOf(context.mapSlotOf(at.key))
  if (storage === 'unknown')
    return no(`the content map does not say how ${at.slot} stores emphasis, so a mark could print as code`)
  const repair = slotRepair(at, after)
  if (!repair.ok || storage === 'codes') return repair
  return {
    ...repair,
    write: emphasisHtmlWrite({ contentMap: context.contentMap, key: at.key, value: after })
  }
}

const kind = (label, shape, validate) => Object.freeze({ label, shape, validate })

/** The rows, as ORDER_KINDS holds them. */
export const CONTENT_ORDER_KINDS = Object.freeze({
  'fix-link': kind(
    'fix one link: point it at a page the site keeps',
    '{ "kind": "fix-link", "slot": "<slot id>", "to": "<path of a page the site keeps>" }',
    validateLink
  ),
  'remove-demo-item': kind(
    "replace one demo phone, e-mail or name with the brief's own, or remove it alone when the brief gives none",
    '{ "kind": "remove-demo-item", "slot": "<slot id>", "item": "<the demo words as the slot holds them>", "with": "<the brief\'s fact>" | null }',
    validateDemoItem
  ),
  'fix-alt': kind(
    "fix one picture's alt from the description of that picture",
    '{ "kind": "fix-alt", "slot": "<alt slot id>", "frame": "<picture slot id>", "text": "<the description>" }',
    validateAlt
  ),
  'fix-title-meta': kind(
    "fix one page's title or meta description from the site copy",
    '{ "kind": "fix-title-meta", "page": "<path>", "field": "title" | "description", "text": "<the site copy\'s words>" }',
    validatePageMeta
  ),
  'mark-emphasis': kind(
    'mark one or two words of a heading in the accent colour, never adding or changing a word',
    '{ "kind": "mark-emphasis", "slot": "<slot id>", "words": "<one or two words the heading holds>" }',
    validateEmphasis
  )
})
