// The finisher's "remove-demo-item" order (#422, spec #418): a phone, an e-mail or a name of the demo inside one slot is
// replaced by the brief's fact of the same field, or, when the brief has none, taken out alone, never a whole block. An item
// written with its scheme (`tel:...`, `mailto:...`) is a phone or an e-mail like the bare number or address.
// A demo phone or e-mail that is a link leaves with its whole link: an `<a>` among the slot's words goes with its text, and a
// stored address whose whole value is the link is refused, since emptying it would print an empty tel: or mailto: link that
// dials or mails nothing (a stored link's element has no content door; the repair log keeps it for the team).
import { visibleText } from '../../lib/site-copy/emphasis-markup.js'
import { international, phoneOf } from '../phone-links.js'
import { no, slotOf, slotRepair, squash } from './content-order-slots.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+(]?[\d\s().-]{6,}$/
const CONTACT = /^(tel|mailto):/i
const ANCHOR = /<a\b[^>]*>[\s\S]*?<\/a>/gi
const timesIn = (text, needle) => (needle ? text.split(needle).length - 1 : 0)

/** An item without its tel: or mailto: scheme, as it is matched against a field. */
const bareItem = (item) => item.replace(CONTACT, '')

/** The field of the brief an item stands for: a phone or an e-mail (scheme or not), else a name. */
export function itemField(item) {
  const bare = bareItem(item)
  const scheme = item.match(CONTACT)?.[1]?.toLowerCase()
  if (scheme === 'mailto' || EMAIL.test(bare)) return 'email'
  if (scheme === 'tel' || PHONE.test(bare)) return 'phone'
  return 'name'
}

const isBriefs = (item, field, values) =>
  field === 'phone'
    ? Boolean(
        phoneOf(
          bareItem(item),
          values.map((v) => ({ digits: international(v) }))
        )
      )
    : values.some((v) => squash(v).toLowerCase() === squash(bareItem(item)).toLowerCase())

/** The `<a>` element among the words whose link is a tel: or mailto: link holding the item, or null. */
function contactAnchorOf(words, item) {
  const bare = bareItem(item)
  return (
    [...words.matchAll(ANCHOR)]
      .map((m) => m[0])
      .find((a) => /\shref\s*=\s*["']?(?:tel|mailto):/i.test(a) && a.includes(bare)) ?? null
  )
}

const tidy = (s) => s.replace(/[ \t]{2,}/g, ' ').trim()

/** The slot's words with the item taken out alone: with its whole link when it is a contact link, never leaving one empty. */
function withoutItem(at, item) {
  if (CONTACT.test(at.current.trim()) && !at.current.includes('<'))
    return no(
      `${at.slot} is a stored ${at.current.trim().match(CONTACT)[1]}: address and the brief gives none to put in its place: emptying it would leave an empty tel: link (or mailto:) that reaches no one, and no content door takes the link off whole`
    )
  const anchor = contactAnchorOf(at.current, item)
  if (anchor) return { ok: true, after: tidy(at.current.replace(anchor, '')) }
  const after = tidy(at.current.replace(item, ''))
  if (/\shref\s*=\s*["']?(?:tel|mailto):["'\s>]/i.test(after))
    return no(`removing ${JSON.stringify(item)} would leave an empty tel: or mailto: link in ${at.slot}`)
  return { ok: true, after }
}

/** A slot whose block would be left with no words when this one is emptied: the refusal, or null. */
function emptiesBlock(at, after, context) {
  if (visibleText(after)) return null
  const block = context.kit?.blocks?.find((b) => b?.id === context.kitSlotOf(at.slot)?.block)
  const others = [...(block?.slots ?? []), ...(block?.demoOwned ?? [])].filter((s) => s?.id !== at.slot)
  const kept = others.some((s) => {
    const key = context.keyOf(s.id)
    return key && visibleText(context.currentOf(key) ?? '')
  })
  return kept
    ? null
    : `removing it would leave block ${block?.id ?? '(unknown)'} with no words: one item, never a whole block`
}

/** Fix or remove one demo item (see the head of this file). */
export function validateDemoItem(order, context) {
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
    const scheme = item.match(CONTACT)?.[0] ?? ''
    return slotRepair(
      at,
      at.current.replace(item, () => scheme + fact)
    )
  }
  if (values.length)
    return no(
      `the brief gives a ${field} to put in its place (${values.join(', ')}): the item is replaced, never removed`
    )
  const removed = withoutItem(at, item)
  if (!removed.ok) return removed
  const empties = emptiesBlock(at, removed.after, context)
  return empties ? no(empties) : slotRepair(at, removed.after)
}
