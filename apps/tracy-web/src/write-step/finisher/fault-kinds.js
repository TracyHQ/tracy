// The finisher's closed fault list (spec #418): the kinds of customer-visible fault it repairs, each with the repair orders
// that may answer it. A kind joins by adding an entry here (#421 to #423), never a branch elsewhere. Whatever the finder
// names outside this table is kept in the repair log as logged only and never repaired.

/** Every repairable kind: `label` and `what` are what the finder is told; `orders` the repair order kinds that fix it. */
export const FAULT_KINDS = Object.freeze({
  'raw-markup': Object.freeze({
    label: 'raw code or markup printed',
    what: 'markup printed as words: emphasis markers such as ((SPAN)) or ((br/)), braces, HTML tags shown as text',
    orders: Object.freeze(['fix-text'])
  })
})

export const VIEWPORTS = Object.freeze(['desktop', 'phone'])

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

/**
 * The finder's answer held to the shots it was shown: faults of a listed kind, and the faults it named outside the list.
 * A fault naming a page or a width it was not shown is not kept at all: it cannot have been seen.
 * @param {unknown} answer the finder's JSON object, `{ faults: [{ page, viewport, tile, slot?, kind, seen }] }`
 * @param {{ page: string, viewport: string, index: number }[]} shown the shots of this call
 * @returns {{ faults: object[], loggedOnly: object[] }}
 */
export function heldFaults(answer, shown) {
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
    if (FAULT_KINDS[fault.kind]) faults.push(fault)
    else loggedOnly.push(fault)
  }
  return { faults, loggedOnly }
}

/** The fault list as the finder is told it. */
export const faultListText = () =>
  Object.entries(FAULT_KINDS)
    .map(([kind, k]) => `- "${kind}": ${k.label} (${k.what})`)
    .join('\n')
