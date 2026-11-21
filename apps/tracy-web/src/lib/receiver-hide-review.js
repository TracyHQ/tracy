// What the Joomla receiver (the Claude Cowork plugin) lets a site empty, read the way the plugin reads it: its review
// `joomla/cowork/lib/hideable-slots.json` is made by the plugin's `scripts/hideable-slots.mjs` from this repo's template
// kit and the contract's content map (and its presentation lock, for rows), and a slot the review does not list is never
// emptied (QuickstartContract.php loadHideable: "a slot is emptied only where the receiver's review lists it"). The
// functions below are that script's `hideableSlots` and `reviewedRows`, kept to the same rules, so the planner knows
// before the write what the site will refuse to take off. A change to the plugin's script is a change here.
//
// Why: dev lat24b (21/11/2026) the final check's largest group was hides the plugin refused (`contract-has-no-slot`):
// 28 at BXR London and 11 at Arabian Tea House. The plans hid pictures the review never lists (an article's
// `images.image_intro`, `images.image_fulltext`, a video thumbnail in `attribs`) and pictures it lists only with their
// row (`withRow`: the exercise rows of JA Boxing's class pages), keeping the rest of the row. Each refused hide left the
// demo's picture on the page.
//
//   measured    a frame the kit emptied, and the block held (canHide: true).
//   unmeasured  a word slot the kit has no verdict on.
//   withRow     a link, or a frame the kit says looks wrong emptied alone (canHide: false): taken only when another
//               slot of its row goes too. Listed with that row.
//   never       a slot that is empty already, one a text node or attribute addresses, a whole column of a row.

const ADDRESS_MOVES = /\/(?:text\(\)(?:\[\d+\])?|@[A-Za-z-]+)$/
const WORD_KINDS = new Set(['module', 'article'])
const arr = (x) => (Array.isArray(x) ? x : [])

/** The kit names a module `block-<id>`; the content map names it `module-<id>`. */
export const slotKeyOf = (id) => String(id).replace(/^block-/, 'module-')

/** Which row of its entity a JSON slot belongs to: `[acm, field, 2]` is row 2 of the acm, `[list, row3, field]` is row3. */
export function rowOf(slot) {
  const path = slot.jsonPath
  if (!Array.isArray(path) || path.length < 2) return null
  const last = path[path.length - 1]
  const row =
    typeof last === 'number' || /^\d+$/.test(String(last))
      ? `${path[0]}#${last}`
      : path.slice(0, -1).join('/')
  return `${slot.entity}|${row}`
}

const movable = (slot) => !ADDRESS_MOVES.test(String(slot.xpath ?? ''))
const occupied = (slot) => String(slot.sample ?? '').trim() !== ''
const kindOf = (slot) => String(slot.entity).split('-')[0]

const isFormWord = (slot) =>
  (kindOf(slot) === 'contact' && slot.column === 'email_to') ||
  (kindOf(slot) === 'field' && slot.column === 'params' && slot.jsonPath?.at(-1) === 'hint')

const CONTACT_LINES = new Set([
  'address',
  'suburb',
  'state',
  'postcode',
  'country',
  'telephone',
  'mobile',
  'fax',
  'webpage',
  'con_position'
])
const CONTACT_LINK = /^link([a-e])$/
const CONTACT_LINK_NAME = /^link([a-e])_name$/
const paramOf = (slot) =>
  slot.column === 'params' && slot.jsonPath?.length === 1 ? String(slot.jsonPath[0]) : null

function contactTier(slot, map) {
  if (kindOf(slot) !== 'contact') return null
  if (CONTACT_LINES.has(slot.column) && !slot.jsonPath) return 'unmeasured'
  const key = paramOf(slot)
  if (key && CONTACT_LINK.test(key)) return 'unmeasured'
  const pair = key ? CONTACT_LINK_NAME.exec(key) : null
  if (!pair) return null
  const address = arr(map.slots).find(
    (s) => s.entity === slot.entity && paramOf(s) === `link${pair[1]}` && occupied(s) && movable(s)
  )
  return address ? { withRow: [address.key] } : null
}

/**
 * The plugin script's `hideableSlots`: the slots the receiver empties, by tier.
 * @returns {{ measured: string[], unmeasured: string[], withRow: Record<string, string[]> }}
 */
export function hideableSlots(kit, map) {
  const frames = new Map(
    arr(kit?.blocks)
      .flatMap((b) => arr(b?.frames))
      .map((f) => [slotKeyOf(f.id), f])
  )
  const rows = new Map()
  for (const slot of arr(map?.slots)) {
    const row = occupied(slot) && movable(slot) ? rowOf(slot) : null
    if (row) rows.set(row, [...(rows.get(row) ?? []), slot])
  }
  const others = (slot) => {
    const rest = (rows.get(rowOf(slot)) ?? []).filter((s) => s.key !== slot.key)
    return rest.some((s) => s.type !== 'url') ? rest.map((s) => s.key).sort() : []
  }
  const measured = []
  const unmeasured = []
  const withRow = {}
  for (const slot of arr(map?.slots)) {
    if (!occupied(slot) || !movable(slot)) continue
    if (isFormWord(slot)) {
      unmeasured.push(slot.key)
      continue
    }
    const contact = contactTier(slot, map)
    if (contact === 'unmeasured') {
      unmeasured.push(slot.key)
      continue
    }
    if (contact) {
      withRow[slot.key] = contact.withRow
      continue
    }
    const frame = frames.get(slot.key)
    if (frame) {
      if (frame.canHide === true) measured.push(slot.key)
      else if (frame.canHide === false && others(slot).length) withRow[slot.key] = others(slot)
      continue
    }
    const held = slot.jsonPath || slot.xpath
    if (
      slot.type === 'url' &&
      WORD_KINDS.has(kindOf(slot)) &&
      slot.jsonPath &&
      !slot.xpath &&
      others(slot).length
    )
      withRow[slot.key] = others(slot)
    else if (
      slot.type === 'text' &&
      ((WORD_KINDS.has(kindOf(slot)) && held) || kindOf(slot) === 'languageString')
    )
      unmeasured.push(slot.key)
  }
  const sorted = Object.fromEntries(Object.entries(withRow).sort(([a], [b]) => (a < b ? -1 : 1)))
  return { measured: measured.sort(), unmeasured: unmeasured.sort(), withRow: sorted }
}

/**
 * The receiver's review as the planner reads it: whether a slot of the content map may be emptied alone, only with another
 * slot of its row, or never; and what the write step's `rows.remove` door takes instead (lib/plan-rows.js `slotsToRemove`):
 * a slot of an HTML field (its element or text goes), and a row whose every word and picture the plan hides. Null for a kit
 * whose contract has no content map.
 * @returns {{ alone: Set<string>, withRow: Map<string, string[]>, known: Set<string>, empty: Set<string>,
 *   inHtml: Set<string>, rowOf: Map<string, string>, rowWords: Map<string, string[]> } | null} `rowWords`: by row, the
 *   slots holding words or a picture (no address), which must all go for the door to take the row
 */
export function receiverHideReview(kit, map) {
  if (!map || !Array.isArray(map.slots)) return null
  const { measured, unmeasured, withRow } = hideableSlots(kit, map)
  const rowOfKey = new Map()
  const rowWords = new Map()
  for (const slot of map.slots) {
    const row = rowOf(slot)
    if (!row) continue
    rowOfKey.set(slot.key, row)
    if (slot.type !== 'url' && occupied(slot)) rowWords.set(row, [...(rowWords.get(row) ?? []), slot.key])
  }
  return {
    alone: new Set([...measured, ...unmeasured]),
    withRow: new Map(Object.entries(withRow)),
    known: new Set(map.slots.map((s) => s.key)),
    empty: new Set(map.slots.filter((s) => !occupied(s)).map((s) => s.key)),
    inHtml: new Set(map.slots.filter((s) => s.xpath).map((s) => s.key)),
    rowOf: rowOfKey,
    rowWords
  }
}
