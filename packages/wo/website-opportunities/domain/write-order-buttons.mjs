// The buttons of the write order (ticket #597 review): a button label and the link it opens are one button. A label is
// paired with a link of the same place (a block, an item or a child list row) by the store's own pairing when it
// declares one (`for` naming the other field), else by adjacent stored places (`module-176.0` and `module-176.1`),
// else by adjacent declarations. Then:
//   - a label beside the main button link (`contact.cta_url`) is the customer's answer, character for character, like
//     every `contact.cta_label` field;
//   - a label whose link has no value is hidden with it (`button_link_hidden`): no dead button is written;
//   - where the store pairs them, a link whose label is hidden is hidden too (`button_label_hidden`).
// Pure.
import { limitOf, placeLimitsOf } from './field-place-limits.mjs'

export const MAIN_BUTTON_LINK = 'contact.cta_url'
export const MAIN_BUTTON_LABEL = 'contact.cta_label'
const list = (value) => (Array.isArray(value) ? value : [])
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isLabel = (f) => f?.type === 'text' && /(?:button|cta)_label$/.test(f.kind ?? '')
const isLink = (f) =>
  f?.type === 'link' && (f.derived !== undefined || /(?:cta|navigation)_url$/.test(f.kind ?? ''))
export const hasValue = (e) => e.value !== undefined && e.value !== null && e.value !== ''
/** Whether a link entry opens something: a value, or a page the build makes. */
export const linkOpens = (e) => e?.from === 'derived' || hasValue(e ?? {})

const storedAt = (field) => {
  const stored = [field.slot, ...list(field.slots).flat(3)].find(isName)
  const match = /^(.*)\.(\d+)$/.exec(stored ?? '')
  return match ? { base: match[1], n: Number(match[2]) } : null
}
const storePaired = (a, b) => list(a.for).includes(b.name) || list(b.for).includes(a.name)
const nextTo = (a, b) => {
  const [x, y] = [storedAt(a), storedAt(b)]
  return x !== null && y !== null && x.base === y.base && Math.abs(x.n - y.n) === 1
}

/**
 * The buttons of one place's declared fields.
 * @returns {Array<{label: object, link: object, declared: boolean}>} `declared`: the store pairs them itself
 */
export function buttonPairsOf(fields) {
  const all = list(fields)
  const labels = all.filter(isLabel)
  const links = all.filter(isLink)
  const taken = new Set()
  const pairs = []
  const pass = (fits, declared) => {
    for (const link of links) {
      if (taken.has(link)) continue
      const label = labels.find((l) => !taken.has(l) && fits(l, link))
      if (!label) continue
      taken.add(label).add(link)
      pairs.push({ label, link, declared })
    }
  }
  pass(storePaired, true)
  pass(nextTo, false)
  pass((l, k) => Math.abs(all.indexOf(l) - all.indexOf(k)) === 1, false)
  return pairs
}

/** The fields of one place a customer answer of `kind` fills. */
export function answerFieldsOf(fields, kind = MAIN_BUTTON_LABEL) {
  const paired =
    kind === MAIN_BUTTON_LABEL
      ? buttonPairsOf(fields)
          .filter((p) => p.link.kind === MAIN_BUTTON_LINK)
          .map((p) => p.label)
      : []
  return list(fields).filter((f) => (f?.type === 'text' && f.kind === kind) || paired.includes(f))
}

/**
 * The longest customer answer of `kind` the plan can write: the smallest limit (`limitOf`, the smallest stored place
 * it shares) of every field the answer fills on the plan's placed blocks, or null when it fills none.
 * @param {{blockStore: object, plan: object, kind?: string, library?: object[]}} input
 */
export function answerLimitOf({ blockStore, plan, kind = MAIN_BUTTON_LABEL, library = [] }) {
  const blocks = new Map()
  for (const block of [...list(blockStore?.blocks), ...list(library)])
    if (!blocks.has(block.id)) blocks.set(block.id, block)
  const placeLimits = placeLimitsOf(blocks.values())
  const limits = []
  const visit = (fields) => {
    for (const field of answerFieldsOf(fields, kind)) {
      const limit = limitOf(field, placeLimits)
      if (Number.isInteger(limit)) limits.push(limit)
    }
  }
  const walk = (lists) => {
    for (const child of list(lists)) {
      visit(child.fields)
      walk(child.lists)
    }
  }
  for (const page of list(plan?.pages))
    for (const placed of list(page.blocks)) {
      const d = blocks.get(placed.block)
      if (!d) continue
      visit(d.fields)
      visit(d.itemFields)
      walk(d.lists)
      walk(d.itemLists)
    }
  return limits.length ? Math.min(...limits) : null
}

/**
 * Settle the buttons of one place, in place.
 * @param {object[]} entries the place's field entries
 * @param {object[]} fields its declared fields
 * @param {{answer: string | null, keep: (e: object) => object}} ctx `keep`: an entry without its value
 */
export function settleButtons(entries, fields, { answer, keep }) {
  const byName = new Map(entries.map((e, i) => [e.field, i]))
  const set = (i, e) => {
    entries[i] = e
  }
  for (const { label, link, declared } of buttonPairsOf(fields)) {
    const [li, ki] = [byName.get(label.name), byName.get(link.name)]
    if (li === undefined || ki === undefined) continue
    const [l, k] = [entries[li], entries[ki]]
    l.button = k.place
    k.button = l.place
    if (!linkOpens(k)) {
      set(li, { ...keep(l), from: 'no-data', action: 'hide', reason: 'button_link_hidden' })
      continue
    }
    if (link.kind === MAIN_BUTTON_LINK && answer !== null) {
      const written =
        l.written !== undefined
          ? { written: l.written }
          : l.from === 'writer' && l.value !== answer
            ? { written: l.value }
            : {}
      set(li, { ...keep(l), from: 'answer', value: answer, data: 'contact-cta-label', ...written })
    } else if (declared && !hasValue(l))
      set(ki, { ...keep(k), from: 'no-data', action: 'hide', reason: 'button_label_hidden' })
  }
}
