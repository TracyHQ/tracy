// The footer keeps the template's footer shape (COO decision 30/10/2026, spec TracyHQ/tracy#189, site build rule 5), for
// every CMS. Measured on a brief build of a Joomla T4 template: the demo's footer contact block showed one phone, one
// address and one mailbox, and the built footer listed two phones, WhatsApp, the street address, the areas served and an
// Instagram direct message (seven lines), while the Contact page showed almost nothing.
//
// 🔒 EACH FOOTER CONTACT BLOCK KEEPS THE DEMO'S ENTRIES, KIND BY KIND. Where the demo shows one phone, one mailbox and one
// address line, the footer shows the business's one primary of each kind. A kind the business lacks is hidden, a kind the
// demo lacks is never added (no direct message in a mailbox line, no second number beside the first). Every other channel
// (a second phone, WhatsApp, a direct message, the areas served) is shown on the Contact page only, which carries at least
// every channel the footer carries.
//
// A content map declares its contact blocks in its top-level `contactBlocks` (quickstart-contract skill):
//   { id, placement: "footer" | "header" | "contact-page" | "page", container: <entity> }
// The block's entries are read from the container's text slots by role (`contact.phone`, `contact.email`,
// `contact.address`, `contact.hours`): the demo's own count of each kind. A map that declares none (released before this
// rule) has its footer blocks inferred from the container's place (a module in a footer position).

export const CONTACT_BLOCK_PLACEMENTS = Object.freeze(['footer', 'header', 'contact-page', 'page'])
/** The placements shown on every page: a summary of the business, never its full channel list. */
export const SUMMARY_PLACEMENTS = Object.freeze(['footer', 'header'])

/** The line kind each contact role stands for. */
export const CONTACT_ENTRY_ROLES = Object.freeze({
  'contact.phone': 'phone',
  'contact.email': 'email',
  'contact.address': 'address',
  'contact.hours': 'hours'
})

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const FOOTER_PLACE = /foot/i

/** How many lines of each kind the container's demo shows, from its text slots' roles. */
export function contactEntriesOf(contentMap, container) {
  /** @type {Record<string, number>} */
  const entries = {}
  for (const slot of contentMap?.slots ?? []) {
    if (slot?.entity !== container || slot.type !== 'text') continue
    const kind = CONTACT_ENTRY_ROLES[slot.role]
    if (kind) entries[kind] = (entries[kind] ?? 0) + 1
  }
  return entries
}

/** The containers a content map holds contact lines in, each with the place its entity is shown in. */
function contactContainersOf(contentMap) {
  const places = new Map(
    (contentMap?.entities ?? []).map((e) => [e?.key, String(e?.identity?.position ?? e?.placement ?? '')])
  )
  const out = new Map()
  for (const slot of contentMap?.slots ?? [])
    if (slot?.type === 'text' && CONTACT_ENTRY_ROLES[slot.role] && typeof slot.entity === 'string')
      out.set(slot.entity, places.get(slot.entity) ?? '')
  return out
}

/** The containers with contact lines that sit in a footer place: each must be declared as a footer contact block. */
export function footerContactContainersOf(contentMap) {
  return [...contactContainersOf(contentMap)]
    .filter(([, place]) => FOOTER_PLACE.test(place))
    .map(([key]) => key)
}

/**
 * The contact blocks of a content map: the declared ones, then any footer container no declaration names (inferred from
 * its place, for maps released before the rule). Each carries the demo's entries by kind.
 * @returns {Array<{ id: string, placement: string, container: string, entries: Record<string, number>, inferred?: true }>}
 */
export function contactBlocksOf(contentMap) {
  const declared = (Array.isArray(contentMap?.contactBlocks) ? contentMap.contactBlocks : []).filter(
    (b) => object(b) && typeof b.container === 'string' && CONTACT_BLOCK_PLACEMENTS.includes(b.placement)
  )
  const named = new Set(declared.map((b) => b.container))
  return [
    ...declared.map((b) => ({
      id: String(b.id ?? b.container),
      placement: b.placement,
      container: b.container,
      entries: contactEntriesOf(contentMap, b.container)
    })),
    ...footerContactContainersOf(contentMap)
      .filter((key) => !named.has(key))
      .map((key) => ({
        id: key,
        placement: 'footer',
        container: key,
        entries: contactEntriesOf(contentMap, key),
        inferred: /** @type {const} */ (true)
      }))
  ]
}

/** The containers whose contact block is shown on every page (a footer, a header): one primary of each kind. */
export function summaryContactContainers(contentMap) {
  return new Set(
    contactBlocksOf(contentMap)
      .filter((b) => SUMMARY_PLACEMENTS.includes(b.placement))
      .map((b) => b.container)
  )
}

/**
 * The most lines of each kind a summary block may show: the largest demo count of that kind over the map's summary blocks.
 * Null when the map has no summary block (the check then allows one line of each kind).
 * @returns {Map<string, number> | null}
 */
export function summaryContactShape(contentMap) {
  const blocks = contactBlocksOf(contentMap).filter((b) => SUMMARY_PLACEMENTS.includes(b.placement))
  if (blocks.length === 0) return null
  const out = new Map()
  for (const block of blocks)
    for (const [kind, n] of Object.entries(block.entries)) out.set(kind, Math.max(out.get(kind) ?? 0, n))
  return out
}

/**
 * Structural check of a content map's contact blocks (the packing check). `footerContainers`: the containers with contact
 * lines in a footer place; every one must be declared by exactly one block with a summary placement.
 * @param {any} contentMap
 * @param {string[]} [footerContainers]
 * @returns {string[]}
 */
export function contactBlockProblems(contentMap, footerContainers = footerContactContainersOf(contentMap)) {
  const raw = contentMap?.contactBlocks
  if (raw !== undefined && !Array.isArray(raw)) return ['contactBlocks must be an array']
  const errors = []
  const entities = new Set((contentMap?.entities ?? []).map((e) => e?.key))
  const ids = new Set()
  const taken = new Map()
  for (const block of raw ?? []) {
    if (!object(block) || typeof block.id !== 'string' || !block.id) {
      errors.push('a contact block has no id')
      continue
    }
    if (ids.has(block.id)) errors.push(`contact block ${block.id} is declared twice`)
    ids.add(block.id)
    if (!CONTACT_BLOCK_PLACEMENTS.includes(block.placement))
      errors.push(
        `contact block ${block.id}: placement must be one of ${CONTACT_BLOCK_PLACEMENTS.join(', ')}`
      )
    if (typeof block.container !== 'string' || !entities.has(block.container)) {
      errors.push(`contact block ${block.id}: container ${block.container} is no entity of the map`)
      continue
    }
    if (taken.has(block.container))
      errors.push(
        `contact block ${block.id}: container ${block.container} is declared by ${taken.get(block.container)} too`
      )
    taken.set(block.container, block.id)
    if (Object.keys(contactEntriesOf(contentMap, block.container)).length === 0)
      errors.push(
        `contact block ${block.id}: ${block.container} has no text slot with a contact role (contact.phone, contact.email, contact.address, contact.hours)`
      )
  }
  for (const container of footerContainers) {
    const id = taken.get(container)
    if (!id) {
      errors.push(
        `footer contact block ${container} is not declared in contactBlocks (placement "footer"): the brief build keeps its demo entries kind by kind`
      )
      continue
    }
    const block = (raw ?? []).find((b) => b?.id === id)
    if (!SUMMARY_PLACEMENTS.includes(block?.placement))
      errors.push(
        `contact block ${id}: ${container} sits in a footer place, so its placement must be "footer" (or "header")`
      )
  }
  return errors
}
