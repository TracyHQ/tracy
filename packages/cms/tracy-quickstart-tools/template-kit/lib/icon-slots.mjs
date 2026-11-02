// The icon a row's link draws, declared as a slot of that row, and how the list's icons are drawn.
const HOW = {
  'font-icon': 'set the icon class (a font picks the glyph from it)',
  'inline-svg': 'replace the inline SVG markup',
  'image-file': 'replace the image file',
  'css-background': 'change the background picture in the stylesheet (not a content field)'
}

const tokens = (v) =>
  String(v ?? '')
    .split(/\s+/)
    .filter(Boolean)

/**
 * The content map's slot that holds a drawn icon: a slot of the block whose role or JSON path names an icon and
 * whose value is that icon (every class of the slot's value is on the icon, or it names the icon's file). Each
 * map slot is taken once.
 */
function mapIconSlot(icon, mapSlots, taken) {
  const have = new Set(tokens(icon.classes))
  return (mapSlots ?? []).find((s) => {
    if (taken.has(s.key) || !/icon/i.test(`${s.role ?? ''} ${(s.jsonPath ?? []).join(' ')}`)) return false
    const want = tokens(s.sample)
    if (!want.length) return false
    if (icon.file) return String(s.sample).includes(icon.file)
    return want.every((t) => have.has(t))
  })
}

/**
 * A row whose link draws an icon gets an icon slot naming the network (or what the icon shows), and its list says
 * how the icon is drawn and whether it can be changed (`iconMechanism`), from the DOM: a font icon is changeable
 * when setting one row's class to another's changed the glyph. When the content map declares the slot that holds
 * the icon (its value is the drawn icon), the icon slot names it as its `field` (the slot id to write); else
 * `field: null`.
 */
export function addIconSlots(lists, links, probe, mapSlots = [], idOf = (k) => k) {
  const byId = new Map(links.map((l) => [l.id, l]))
  const taken = new Set()
  for (const list of lists) {
    if (!list.rows) continue
    const kinds = new Set()
    const fields = []
    for (const row of list.rows) {
      const link = row.slots.map((s) => byId.get(s.id)).find((l) => l?.icon)
      if (!link) continue
      kinds.add(link.icon.mechanism)
      const held = mapIconSlot(link.icon, mapSlots, taken)
      if (held) taken.add(held.key)
      fields.push(held ? idOf(held.key) : null)
      const slot = {
        id: `${link.id}.icon`,
        role: 'icon',
        type: 'icon',
        network: link.icon.network ?? null,
        value: link.icon.classes ?? link.icon.file ?? null,
        field: held ? idOf(held.key) : null,
        ...(held ? { fieldRole: held.role ?? null, fieldValue: held.sample ?? null } : {})
      }
      row.slots.push(slot)
      if (row.index === 0) list.rowSlots.push({ id: slot.id, role: slot.role, type: slot.type })
    }
    if (!kinds.size) continue
    const [kind] = kinds
    const font = kind === 'font-icon'
    list.iconMechanism = {
      kind: kinds.size > 1 ? [...kinds] : kind,
      canChange: font ? (probe ? probe.glyphChanged : null) : kind !== 'css-background',
      how: HOW[kind] ?? null,
      measured: font
        ? probe
          ? `class "${probe.from}" set to "${probe.to}": the glyph ${probe.glyphChanged ? 'changed with it' : 'did not change'}`
          : 'no second icon to swap with: not measured'
        : 'read from the DOM',
      field: fields.every(Boolean) ? 'per row (each icon slot names its field)' : null,
      fieldNote: fields.every(Boolean)
        ? 'the content map holds each row icon in a slot of its own'
        : fields.some(Boolean)
          ? 'the content map holds the icon of some rows only'
          : 'the content map declares no field for the icon'
    }
  }
}
