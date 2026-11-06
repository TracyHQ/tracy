// The finder's closed fault list (#448, carried over from PR #426 without its repair orders): the kinds
// of customer-visible fault it names on a screenshot. Which of them step 9b sends to the site agent, and which it never
// sends, is the repair pass's own table (repair-pass/repair-kinds.js); this one only says what the finder looks for.

export const FINDER_KINDS = Object.freeze({
  'raw-markup': 'raw code or markup printed as words: braces, HTML tags shown as text',
  'unreadable-text': 'text over a picture, text the colour of its background, contrast too low to read',
  'empty-frame': 'a picture frame with nothing in it, a broken picture icon',
  'empty-block': "a block or button left from the template's demo with no content in it",
  'broken-layout': 'content wider than the page, overlapping or cut off, above all at phone width',
  'demo-fact':
    "a phone number, e-mail address or business name of the template's demo company printed on the page",
  'bad-link': "a button or link that leads to a missing page or to the template's demo site",
  'demo-contact-link':
    "a phone or e-mail link that dials or mails the template's demo while the words shown are right",
  'demo-title-meta': "a page title or meta description left from the template's demo",
  'wrong-alt': "a picture's alt text that does not describe it, or that was left from the template's demo",
  'lost-emphasis':
    "accent emphasis on a heading word that the template demo's shot of the same block shows and the site lost",
  'lost-design':
    "another design trait the template demo's shot of the same block shows and the site lost: an accent-coloured button, a small label above a heading"
})

export const OTHER_KIND = 'other'

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

/**
 * The finder's answer held to the shots it was shown: a fault naming a page, width or tile it was not shown is dropped, as
 * it cannot have been seen; a kind outside the list is kept as `other`, so it is logged.
 * @param {unknown} answer `{ faults: [{ page, viewport, tile, slot?, block?, kind, seen }] }`
 * @param {{ page: string, viewport: string, index: number }[]} shown
 */
export function heldFaults(answer, shown) {
  const faults = []
  for (const raw of Array.isArray(answer?.faults) ? answer.faults : []) {
    const viewport = raw?.viewport === 'mobile' ? 'phone' : raw?.viewport
    const tile = Number.isInteger(raw?.tile) ? raw.tile : 0
    const shot = shown.find((s) => s.page === raw?.page && s.viewport === viewport && s.index === tile)
    if (!shot) continue
    const kind = text(raw?.kind, 80)
    faults.push({
      page: shot.page,
      viewport,
      tile,
      slot: text(raw?.slot, 120),
      block: text(raw?.block, 40),
      kind: kind && FINDER_KINDS[kind] ? kind : OTHER_KIND,
      seen: text(raw?.seen, 400)
    })
  }
  return faults
}

/** The fault list as the finder is told it. */
export const faultListText = () =>
  Object.entries(FINDER_KINDS)
    .map(([kind, what]) => `- "${kind}": ${what}`)
    .join('\n')
