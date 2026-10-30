/**
 * The packing rule of repeated item cards (COO rule of 30/10/2026, spec TracyHQ/tracy#189): the cards of one repeated list
 * (an item, a feature, a step of a field list) are declared as numbered role groups, so their bodies are siblings the brief
 * engine writes to one shape (`website-opportunities/domain/sibling-copy-shape.mjs`). A card whose title stands in no
 * group, or whose body is declared a line of another record (an offering's description), leaves the engine to write each
 * body alone: measured on a pilot build, three of four item cards came out with no body and the fourth with a sentence
 * about the whole page.
 *
 * Read from the map's own field paths (a repeated field item: `[list, list<N>, field]`), never a template's name.
 */

const BODY_ROLES = new Set(['offering.description', 'offering.summary', 'editorial.paragraph'])
const words = (v) =>
  String(v ?? '')
    .replace(/\(\(\/?[a-z][^)]*\)\)|<[^>]*>/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))

/** The repeated field item a slot sits in (`list` and its item number), else null. */
function fieldItemOf(slot) {
  const p = Array.isArray(slot?.jsonPath) ? slot.jsonPath : []
  const at = typeof p[1] === 'string' ? /^(.+?)(\d+)$/.exec(p[1]) : null
  return p.length >= 3 && at && at[1] === p[0]
    ? { list: `${slot.entity}|${p[0]}`, item: Number(at[2]) }
    : null
}

/** @type {Array<import('./content-map-lint.js').LintRule>} */
export const ITEM_GROUP_RULES = [
  {
    id: 'repeated-item-ungrouped',
    severity: 'error',
    checks: 'each card of a repeated field list (title and body) is declared as one numbered role group',
    fix: 'Give every slot of item N of the field list the group {"id": "<entity>.<list>.<N>", "item": N, "kind": "business"} (or the record kind it shows), and declare its body editorial.paragraph, never offering.description: a body of an item card is the item\'s own line, and siblings in numbered groups share one written shape.',
    find: ({ slots }) => {
      /** @type {Map<string, Map<number, any[]>>} */
      const lists = new Map()
      for (const slot of slots) {
        const at = fieldItemOf(slot)
        if (!at || slot.type !== 'text') continue
        const items = lists.get(at.list) ?? new Map()
        items.set(at.item, [...(items.get(at.item) ?? []), slot])
        lists.set(at.list, items)
      }
      const hits = []
      for (const items of lists.values()) {
        if (items.size < 2) continue
        for (const [item, members] of items) {
          const title = members.find((s) => s.role === 'editorial.heading')
          const body = members.find((s) => BODY_ROLES.has(s.role) && words(s.sample).length >= 3)
          if (!title || !body) continue
          const numbered = (s) => /\.\d+$/.test(String(s.group?.id ?? ''))
          const same = numbered(title) && numbered(body) && title.group.id === body.group.id
          if (same && body.role === 'editorial.paragraph') continue
          hits.push({
            key: String(body.key),
            note: `item ${item} of "${String(body.jsonPath[0])}": title ${title.key} and body ${body.key} are not one card group`
          })
        }
      }
      return hits
    }
  }
]
