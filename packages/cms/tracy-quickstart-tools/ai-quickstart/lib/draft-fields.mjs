// One kit slot as one typed field of an AI quickstart block store (ADR 0046, ticket #583). Pure: a slot of
// template-kit.json in, a field of block-store.json out. The format is docs/references/ai-quickstart-contract.md.
//
// A text field's limit is the most characters it holds at the narrowest width. The kit already measured most slots
// (`maxCharactersFrom`: its own frame reading at 390 and 1440 px); its number is the smallest of its readings, so it
// holds at 390 px too. A declared store cap, a reading at the widest width only, and a content map fit (ADR 0039: its
// box is a whole section, so its number is the demo length) are not measurements: such a field gets no limit from the
// kit, and needs one measured on the running template (`measured` below), or the contract check reports it.

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

/**
 * Whether a kit's `maxCharactersFrom` says the number was read at the narrowest width: only the kit's own frame
 * reading at 390 px. A content map fit is never one: its box is the whole section the text sits in (711 characters
 * in a box one line high, measured on JA Boxing), so its number is the demo sample's length, not what the box holds.
 */
function measuredAtNarrowest(from) {
  if (/box of the demo words/.test(from)) return false
  return new RegExp(`\\bkit frame[^;]*\\b${NARROWEST_WIDTH}px \\d+`).test(from)
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
