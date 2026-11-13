/**
 * The limits and flags of the slots a blank site contract opens (ticket #584): each place the build writes takes the
 * limit of the kit's own field, and carries no flag that makes the door refuse a normal write.
 *
 * WHY: a released slot's `fit.maxCharacters` is the box of the demo words measured by the content coverage audit (a
 * button label "Book now" gives 17). The Claude Cowork plugin relaxes such a box while the slot holds its demo sample
 * (`SlotFit::checkText`: a limit no more than the sample's visible length plus 3 is the shrink wrapped box of those
 * words, not a limit), but a slot the blank site opens has an empty sample, so the box binds and a value of the kit's
 * own limit is refused (`SLOT_TOO_LONG`). The kit's limit (`block-store.json`, measured on the running template, ADR
 * 0045) is the limit a build writes within, so the blank site contract carries it, the way the plugin's own receiver
 * corrections do for a released contract (`lib/slot-corrections.json`, "limits: the kit's limit in place of the
 * slot's fit"): `fit.maxCharacters` becomes the kit's limit and `fit.maxChars` goes. The slot's own `maxCharacters`
 * (the capture tool's cap, demo length times two plus 20, at least 40) is checked first, so it takes the same limit.
 *
 * Likewise a kept icon (`fit.replace: "keep"`) the blank site empties takes `fit.replace: "icon"`, the state the
 * plugin's receiver correction gives a kept icon ("a kept icon that takes a transparent drawing"), and the capture
 * hint `customize: "keep"` (which no door reads) goes from every slot the build writes.
 */

/** The address ceiling of the released contract's link slots (`capture-contract.py`). */
export const LINK_CEILING = 2048

/** What a visitor reads of a stored value: no `((tag))` code, no HTML tag, every white space run one space. */
function visibleLength(value) {
  const words = String(value)
    .replace(/\(\(\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?\)\)|<\/?[a-z][^<>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [...words].length
}

/**
 * The kit's text fields by stored place: slot key -> `{whole: [{field, limit}], pieces: Map<xpath, [limit]>,
 * links: n}`. `whole` are fields stored as the whole slot, `pieces` text pieces (`<key>@<xpath>`) inside it.
 */
export function kitUsesBySlot(blockStore) {
  const out = new Map()
  const use = (key) => {
    if (!out.has(key)) out.set(key, { whole: [], pieces: new Map(), links: 0, icons: 0 })
    return out.get(key)
  }
  const add = (b, f, places) => {
    for (const place of [places].flat(4)) {
      if (typeof place !== 'string') continue
      const [key, xpath] = place.split('@')
      const u = use(key)
      const name = `${b.id}.${f.name}`
      if (f.type === 'link') u.links += 1
      else if (f.type === 'icon') u.icons += 1
      else if (Number.isInteger(f.limit)) {
        if (xpath) u.pieces.set(xpath, [...(u.pieces.get(xpath) ?? []), f.limit])
        else u.whole.push({ field: name, limit: f.limit })
      }
    }
  }
  const walk = (b, lists) => {
    for (const l of lists ?? []) {
      for (const f of l.fields ?? []) add(b, f, f.slots ?? [])
      walk(b, l.lists)
    }
  }
  for (const b of blockStore.blocks ?? []) {
    for (const f of b.fields ?? []) if (f.slot && f.type !== 'design') add(b, f, f.slot)
    for (const f of b.itemFields ?? []) add(b, f, f.slots ?? [])
    walk(b, b.lists)
    walk(b, b.itemLists)
  }
  return out
}

/**
 * The limit the door must hold a written text slot to, or null when the kit names none for it.
 *   a whole place      the smallest limit of the fields stored there (a place shared by several fields);
 *   pieces of a value  the door counts the visible words of the whole value, so the sum of each text piece's
 *                      smallest limit, a space between pieces, and the words the blank value keeps; each piece's own
 *                      limit is the build's to keep, since the door sees only the whole value;
 *   a link or an icon  class stored in a text slot: the address ceiling of the released link slots.
 */
export function kitLimitOf(use, blankSample) {
  if (!use) return null
  if (use.whole.length) return Math.min(...use.whole.map((w) => w.limit))
  if (use.pieces.size) {
    const sum = [...use.pieces.values()].reduce((n, limits) => n + Math.min(...limits), 0)
    return sum + use.pieces.size + visibleLength(blankSample)
  }
  if (use.links || use.icons) return LINK_CEILING
  return null
}

/** The limit the plugin holds a text slot to with an empty or emptied sample (`checkValue`, `SlotFit::checkText`). */
export function doorLimitOf(slot) {
  const own = Number.isInteger(slot.maxCharacters) ? slot.maxCharacters : Number.POSITIVE_INFINITY
  const fit = slot.fit && typeof slot.fit === 'object' && !Array.isArray(slot.fit) ? slot.fit : null
  let measured = Number.POSITIVE_INFINITY
  if (fit?.measured === true) {
    if (Number.isInteger(fit.maxCharacters)) measured = fit.maxCharacters
    else if (fit.maxChars && typeof fit.maxChars === 'object') {
      const all = Object.values(fit.maxChars).filter(Number.isInteger)
      if (all.length) measured = Math.min(...all)
    }
  }
  return Math.min(own, measured)
}

/** A slot the build writes, with the kit's limit and without a flag that refuses a normal write. */
export function writableSlot(slot, limit) {
  const { customize, ...out } = slot
  if (customize !== undefined && customize !== 'keep') out.customize = customize
  const fit = out.fit && typeof out.fit === 'object' && !Array.isArray(out.fit) ? { ...out.fit } : null
  if (fit?.replace === 'keep') {
    if (fit.kind !== 'icon') throw new Error(`${slot.key}: a kept ${fit.kind ?? 'picture'} the build writes`)
    fit.replace = 'icon'
  }
  if (slot.type === 'text' && Number.isInteger(limit)) {
    out.maxCharacters = limit
    if (fit && fit.measured === true) {
      fit.maxCharacters = limit
      delete fit.maxChars
    }
  }
  if (fit) out.fit = fit
  return out
}

/**
 * Why the door would refuse a normal write into a slot the build writes, or [] (the contract check): its door limit
 * differs from the kit's limit, or it carries a keep flag.
 */
export function writableSlotProblems(slot, limit) {
  const out = []
  if (slot.type === 'text' && Number.isInteger(limit) && doorLimitOf(slot) !== limit)
    out.push(
      `the door holds it to ${doorLimitOf(slot)} characters, the kit's limit for the place is ${limit}`
    )
  if (slot.customize === 'keep') out.push('it carries customize "keep", though the build writes it')
  if (slot.fit?.replace === 'keep')
    out.push('it carries fit.replace "keep": the door refuses every picture (SLOT_PICTURE_KEPT)')
  return out
}
