// The finisher's closed fault list (spec #418): the kinds of customer-visible fault it repairs, each with the repair orders
// that may answer it. A kind joins by adding an entry here (#421 to #423), never a branch elsewhere. Whatever the finder
// names outside this table is kept in the repair log as logged only and never repaired.

/** Every repairable kind: `label` and `what` are what the finder is told; `orders` the repair order kinds that fix it. */
export const FAULT_KINDS = Object.freeze({
  'raw-markup': Object.freeze({
    label: 'raw code or markup printed',
    what: 'markup printed as words: emphasis markers such as ((SPAN)) or ((br/)), braces, HTML tags shown as text',
    orders: Object.freeze(['fix-text'])
  }),
  // The rest of the closed list (#423). An order kind not yet in ORDER_KINDS (repair-orders.js) is dropped and logged.
  'unreadable-text': Object.freeze({
    label: 'unreadable text',
    what: 'text over a picture, text the colour of its background, contrast too low to read',
    orders: Object.freeze(['style-block'])
  }),
  'empty-frame': Object.freeze({
    label: 'empty frame, broken picture or empty block',
    what: 'a picture frame with nothing in it, a broken picture icon, a block or button with no content',
    orders: Object.freeze(['remove-demo-item'])
  }),
  'broken-layout': Object.freeze({
    label: 'broken layout',
    what: 'content wider than the page, overlapping or cut off, above all at phone width; words of a heading glued together with no space (such as "THEPOOL") where a line break was dropped',
    orders: Object.freeze(['style-block'])
  }),
  'demo-fact': Object.freeze({
    label: 'demo fact left visible',
    what: "a phone number, e-mail address or business name of the template's demo company printed on the page",
    orders: Object.freeze(['fix-text', 'remove-demo-item'])
  }),
  'bad-link': Object.freeze({
    label: 'button or link to a 404 or to the demo',
    what: "a button or link that leads to a missing page or to the template's demo site",
    orders: Object.freeze(['fix-link', 'remove-demo-item'])
  }),
  'demo-contact-link': Object.freeze({
    label: 'phone or e-mail link to the demo',
    what: "a phone or e-mail link that dials or mails the template's demo while the words shown are right",
    orders: Object.freeze(['fix-link', 'remove-demo-item'])
  }),
  'demo-title-meta': Object.freeze({
    label: 'demo or duplicated page title or meta description',
    what: "a page title or meta description left from the template's demo, or the same on several pages",
    orders: Object.freeze(['fix-title-meta'])
  }),
  'wrong-alt': Object.freeze({
    label: 'wrong or demo alt text',
    what: "a picture's alt text that does not describe it, or that was left from the template's demo",
    orders: Object.freeze(['fix-alt'])
  }),
  'lost-design': Object.freeze({
    label: 'lost template design',
    what: "a design trait the template demo's shot of the same block shows and the site's block lost: accent emphasis on a heading word, an accent-coloured button, a small label above a heading",
    orders: Object.freeze(['mark-emphasis', 'style-block'])
  })
})

/** The kind a finder names a customer-visible fault that fits no listed kind: kept in the log, never repaired. */
export const OTHER_KIND = 'other'

/** Kinds named on purpose and logged only, with the reason (spec #418): repairing them would change template structure. */
export const LOGGED_ONLY_KINDS = Object.freeze({
  'main-heading': 'a missing or repeated h1 is logged only: fixing it means changing the template structure'
})

/** Why a fault of this kind is logged only and not repaired. */
export const loggedOnlyReason = (kind) => LOGGED_ONLY_KINDS[kind] ?? 'the kind is outside the fault list'

export const VIEWPORTS = Object.freeze(['desktop', 'phone'])

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

/**
 * The finder's answer held to the shots it was shown: faults of a listed kind, and the faults it named outside the list.
 * A fault naming a page or a width it was not shown is not kept at all: it cannot have been seen.
 * @param {unknown} answer the finder's JSON object, `{ faults: [{ page, viewport, tile, slot?, kind, seen }] }`
 * @param {{ page: string, viewport: string, index: number }[]} shown the shots of this call
 * @param {Record<string, object>} [kinds] the fault list; FAULT_KINDS, or the one a bench test gives
 * @returns {{ faults: object[], loggedOnly: object[] }}
 */
export function heldFaults(answer, shown, kinds = FAULT_KINDS) {
  const faults = []
  const loggedOnly = []
  for (const raw of Array.isArray(answer?.faults) ? answer.faults : []) {
    const viewport = raw?.viewport === 'mobile' ? 'phone' : raw?.viewport
    const tile = Number.isInteger(raw?.tile) ? raw.tile : 0
    const shot = shown.find((s) => s.page === raw?.page && s.viewport === viewport && s.index === tile)
    if (!shot) continue
    const fault = {
      page: shot.page,
      viewport,
      tile,
      slot: text(raw?.slot, 120),
      kind: text(raw?.kind, 80) ?? 'unnamed',
      seen: text(raw?.seen, 400)
    }
    if (kinds[fault.kind]) faults.push(fault)
    else loggedOnly.push(fault)
  }
  return { faults, loggedOnly }
}

/** The fault list as the finder is told it. */
export const faultListText = () =>
  Object.entries(FAULT_KINDS)
    .map(([kind, k]) => `- "${kind}": ${k.label} (${k.what})`)
    .join('\n')
