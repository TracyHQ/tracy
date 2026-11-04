/**
 * Every visible text of a WordPress page's markup, as units a content map can address (spec #37, issue #43).
 *
 * `capture-contract.mjs` makes a slot only for a block named by `metadata.name`; a theme that names a fraction of its
 * blocks leaves the rest of the page (dish names, prices, hours, list items) outside the map. This reader walks every
 * text-bearing core block in document order and returns one unit per block, with the texts and links it holds.
 *
 * POSITION is the address of a block that has no name (or repeats one): `blockType` and `occurrence`, the 1-based
 * count of blocks of that type in the page, named or not, in document order. A block that holds several texts adds a
 * sub-position (`list` item, `table` cell, `quote` cite).
 */

import {
  blockFields,
  blockUnits,
  decodeEntities,
  hrefsIn,
  sampleOf,
  visibleText
} from '../../tracy-seeder/src/wordpress-block-address.mjs'

// The walker and the texts of a block are the writer's own (`wordpress-block-address.mjs`), so a position the capture
// makes is the block the writer reaches (TracyHQ/tracy#139).
export { decodeEntities, visibleText }

/**
 * @param {string} content a page's `post_content`
 * @returns {{ blockType: string, occurrence: number, name: string | null, start: number, fields: { id: string, attr: string, raw: string, text: string, sample: string, links: string[], url?: string | null }[] }[]}
 */
export function textUnits(content) {
  return blockUnits(content).map((unit) => ({
    blockType: unit.blockType,
    occurrence: unit.occurrence,
    name: unit.name,
    start: unit.start,
    fields: blockFields(unit)
      .map((f) => ({
        id: f.id,
        attr: f.attr,
        raw: f.raw,
        links: f.attr === 'label' || unit.blockType === 'button' ? [] : hrefsIn(f.raw),
        ...(f.url !== undefined ? { url: f.url } : {}),
        sample: sampleOf(f.raw),
        text: visibleText(f.raw)
      }))
      .filter((f) => f.text !== '')
  }))
}

const NAMED_TYPES = new Set(['heading', 'paragraph', 'list-item', 'button'])
const budget = (sample) => Math.max(80, Math.min(2000, sample.length * 2 + 20))

/**
 * The slots of one page when every visible text is captured.
 *   - the first block of a name, of a type the plugin addresses by name, keeps the key and target `pageSlots` always
 *     gave it (so a released profile's slots do not move);
 *   - every other text, and the links inside it, is addressed by position (see the file header).
 * @param {{ content: string, entityKey: string, prefix: string, nameProblem: (name: string, start: number) => string | null }} input
 *   `nameProblem`: why the plugin cannot address the first block of that name, or null when it can
 * @returns {{ slots: object[], skipped: string[] }}
 */
export function allTextSlots({ content, entityKey, prefix, nameProblem }) {
  const slots = []
  const skipped = []
  const usedNames = new Set()
  for (const unit of textUnits(content)) {
    const byName = unit.name !== null && NAMED_TYPES.has(unit.blockType) && !usedNames.has(unit.name)
    if (unit.name !== null) usedNames.add(unit.name)
    const problem = byName ? nameProblem(unit.name, unit.start) : null
    if (problem) skipped.push(`${entityKey}:${unit.name} (${problem}; captured by position)`)
    const named = byName && !problem
    unit.fields.forEach((field) => {
      const where = named
        ? { target: { block: unit.name } }
        : { target: { blockType: unit.blockType, occurrence: unit.occurrence } }
      const base = named
        ? `${prefix}.${unit.name}`
        : `${prefix}.${unit.blockType}.${unit.occurrence}${field.id ? `.${field.id}` : ''}`
      const label = `${prefix} — ${named ? unit.name : base.slice(prefix.length + 1)}`
      // A block that holds several texts (list items, table cells, a cite) names the one: by name or by position alike.
      const subField = field.id ? { field: field.id } : {}
      slots.push({
        key: base,
        entity: entityKey,
        target: { ...where.target, attr: field.attr, ...subField },
        type: 'text',
        sample: field.sample,
        maxCharacters: budget(field.sample),
        label
      })
      if (field.url) {
        slots.push({
          key: `${base}.url`,
          entity: entityKey,
          target: { ...where.target, attr: 'url', ...subField },
          type: 'url',
          sample: field.url,
          maxCharacters: 2048,
          label: `${label} (link)`
        })
      }
      field.links.forEach((href, k) =>
        slots.push({
          key: `${base}.link.${k + 1}`,
          entity: entityKey,
          target: { ...where.target, attr: 'url', link: k + 1, ...subField },
          type: 'url',
          sample: href,
          maxCharacters: 2048,
          label: `${label} (link ${k + 1})`
        })
      )
    })
  }
  return { slots, skipped }
}
