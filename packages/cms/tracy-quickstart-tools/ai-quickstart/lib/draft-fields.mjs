// One kit slot as one typed field of an AI quickstart block store (ADR 0046, ticket #583). Pure: a slot of
// template-kit.json in, a field of block-store.json out. The format is docs/references/ai-quickstart-contract.md.
//
// A text field's limit is the most characters it holds at the narrowest width. The kit already measured most slots
// (`maxCharactersFrom`: its own frame reading at 390 and 1440 px, or the content map's Slot fit, ADR 0039, whose phone
// viewport is 390 px); its number is the smallest of its readings, so it holds at 390 px too. A declared store cap,
// a reading at the widest width only, or a fit that is only the box of the demo words is not a measurement: such a
// field gets no limit from the kit, and needs one measured on the running template (`measured` below), or the
// contract check reports it.

/** The narrowest width a limit is measured at: the phone viewport of the kit and the coverage audit. */
export const NARROWEST_WIDTH = 390

const LINK_ROLES = new Set(['business.video', 'contact.map', 'editorial.navigation_url'])
const ICON_ROLES = new Set(['editorial.item_icon', 'icon'])
const NUMBER_ROLES = new Set(['step.index', 'business.founded_year'])
const DESIGN_ROLE = 'editorial.design_element'

/** The content map key of a kit id: the kit names a module `block-N`, the map `module-N`. */
export const mapKeyOf = (id) => String(id ?? '').replace(/^block-/, 'module-')

/**
 * The field type of a slot, by its role first: a link or an icon stored as text is still a link or an icon, and a
 * design element is a design value whatever it is stored as.
 * @param {{role?: string|null, type?: string|null}} slot
 */
export function fieldTypeOf({ role, type }) {
  if (role === DESIGN_ROLE) return 'design'
  if (ICON_ROLES.has(role)) return 'icon'
  if (LINK_ROLES.has(role) || String(role ?? '').endsWith('_url') || type === 'url') return 'link'
  if (type === 'image') return 'image'
  if (NUMBER_ROLES.has(role)) return 'number'
  return 'text'
}

/** Whether a kit's `maxCharactersFrom` says the number was read at the narrowest width. */
function measuredAtNarrowest(from) {
  if (/box of the demo words/.test(from)) return false
  if (new RegExp(`\\b${NARROWEST_WIDTH}px \\d+`).test(from)) return true
  return /^content map fit\b/.test(from) && /\bphone \d+/.test(from)
}

/**
 * The limit of a text slot and where it came from.
 * @param {{maxCharacters?: number, maxCharactersFrom?: string}} entry the kit's entry for the slot
 * @param {{limit: number, limitFrom: string}} [measured] a limit measured on the running template, recorded beside
 *   the declarations; it wins over the kit
 * @returns {{limit: number|null, limitFrom: string, measured: boolean}}
 */
export function limitOf(entry, measured) {
  if (measured && Number.isInteger(measured.limit) && measured.limit > 0)
    return { limit: measured.limit, limitFrom: measured.limitFrom, measured: true }
  const from = String(entry?.maxCharactersFrom ?? 'no reading')
  if (Number.isInteger(entry?.maxCharacters) && entry.maxCharacters > 0 && measuredAtNarrowest(from))
    return { limit: entry.maxCharacters, limitFrom: from, measured: true }
  return { limit: null, limitFrom: from, measured: false }
}
