// Shared: the site writer's input, the copy check, the copy export and the site check read it, so it lives in lib/
// (module-graph.test.mjs). The inline emphasis of a kit text slot (ADR 0042, 2026-11-04): the template paints words marked with
// a `span` inside a heading in the accent colour ("((span))NO1((/span)) BOXING STUDIO"). The kit lists such marks beside its
// plain sample as `inline: [{ tag, attrs, text, at }]`; the writer names the words of its own text to mark as `emphasis`, and
// the export wraps them in the demo's tag. A kit without `inline` changes nothing. Pure, no input is modified.

/** An emphasis may run this many times the demo's marked words, and never under EMPHASIS_MIN_ROOM characters of room. */
export const EMPHASIS_STRETCH = 2
export const EMPHASIS_MIN_ROOM = 12
/** An emphasis is under this share of the slot's text: never the whole text. */
export const EMPHASIS_MAX_SHARE = 0.5

/** The first `span` mark with words in a kit slot's demo, or null. */
export function spanMarkOf(slot) {
  const marks = Array.isArray(slot?.inline) ? slot.inline : []
  return (
    marks.find((m) => m && m.tag === 'span' && typeof m.text === 'string' && m.text.trim() !== '') ?? null
  )
}

const WHERE = { start: 'at the start', end: 'at the end', inside: 'inside the text' }

/** The writer's note for a slot whose demo marks words in a span, or null. */
export function emphasisNoteOf(slot) {
  const mark = spanMarkOf(slot)
  if (!mark) return null
  return `The demo draws "${mark.text}" in the accent colour, ${WHERE[mark.at] ?? 'inside the text'}: give this slot an emphasis of your own words.`
}

/** The longest emphasis a slot allows: twice the demo's marked words, at least 12 characters. */
export const emphasisRoomOf = (mark) =>
  Math.max(String(mark?.text ?? '').length * EMPHASIS_STRETCH, EMPHASIS_MIN_ROOM)

/**
 * The line break the demo draws right before its accent words when they end the text (`Our((br/))((span))Classes((/span))`:
 * the kit's `inline` is `[..., {tag: 'br'}, {tag: 'span', at: 'end'}]`), in content map notation; null for any other demo.
 * @param {object | undefined} slot the kit slot
 */
export function breakBeforeMarkOf(slot) {
  const marks = Array.isArray(slot?.inline) ? slot.inline : []
  const mark = spanMarkOf(slot)
  const k = marks.indexOf(mark)
  const prev = k > 0 ? marks[k - 1] : null
  if (!mark || mark.at !== 'end' || prev?.tag !== 'br') return null
  return prev.attrs ? `((br ${prev.attrs}/))` : '((br/))'
}

/**
 * The items with the emphasis wrapped in the demo's tag, in content map notation, in the one item that holds it (the first).
 * When the demo breaks the line right before its accent words at the end of the text (`breakBeforeMarkOf`), the break is
 * written before the emphasis too, so the title prints on two lines as the demo does; a demo without that break gets none.
 * Unchanged without a span mark, without an emphasis, or when no item holds it.
 * @param {string[]} items
 * @param {string | undefined} emphasis
 * @param {object | undefined} slot the kit slot
 */
export function withEmphasis(items, emphasis, slot) {
  const mark = spanMarkOf(slot)
  if (!mark || typeof emphasis !== 'string' || !emphasis) return items
  const at = items.findIndex((t) => t.includes(emphasis))
  if (at === -1) return items
  const open = mark.attrs ? `((${mark.tag} ${mark.attrs}))` : `((${mark.tag}))`
  const i = items[at].indexOf(emphasis)
  const before = items[at].slice(0, i)
  const br = breakBeforeMarkOf(slot)
  // The break goes between words only: an emphasis that opens the text has no line above it.
  const lead = br && before.trim() ? `${before.trimEnd()}${br}` : before
  const wrapped = `${lead}${open}${emphasis}((/${mark.tag}))${items[at].slice(i + emphasis.length)}`
  return items.map((t, n) => (n === at ? wrapped : t))
}
