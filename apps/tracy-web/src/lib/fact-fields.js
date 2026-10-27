/**
 * Which slots of a quickstart contract hold a FACT by their field's role, whatever module they sit in.
 *
 * 🔒 EVIDENCE IS DECIDED PER FIELD, NOT PER MODULE TITLE (TCH #1326, 13/10/2026). The capture marked
 * `requiresEvidence` by module title only (`Pricing|Statistics|Testimonials|Clients|Team`), so on a dev site
 * built from Tracy Business Joomla the hero's `stat-value` cells came out as "0" or trade words and the
 * Branches `city` cells took the customer's industry, and on JA Voyara "Home - Stats" (not "Statistics") and
 * "Landing - Testimonial" (singular) were the planner's to invent. A counter, a city, an address, a
 * quotation, a client's name, a team member, a price: each is a fact by what the field is CALLED, and a
 * fact nobody gave is either the customer's own words (evidence) or the template's demo value, never a
 * planner's.
 *
 * ONE RULE, THREE READERS. `fact-fields.json` beside this file is the only statement of the rule:
 *   - the Joomla planner (`sites/brief-engines/joomla.js`) reads a profile through `withFieldEvidence`, so a
 *     site bound to a plugin that carries the title-only flags is still gated here, today, on every template;
 *   - `capture-contract.py --evidence-by-field` writes the same flags into a new profile's bytes, and
 *     `scripts/regate-contract.mjs` into one captured before the flag existed;
 *   - the contracts gate (`scripts/check-contracts.ts`) refuses a profile outside the sealed list whose fact
 *     fields are open (`ungatedFactSlots`).
 * The title rule stays as it was: field gating is added to it, never traded for it, so every profile's
 * gating is a superset of what it shipped with.
 *
 * A `siteIdentity` slot (the one module a quickstart keeps its own name, address and contacts in) is not a fact of
 * the template's: it takes the customer's contact answers, and the Claude Cowork plugin lets it be EMPTIED when the
 * customer has none, because there the demo's value must not stay. It is never gated by field.
 *
 * WordPress profiles name their slots by block kind (`about.stats.item.1.title`), carry no `requiresEvidence`
 * and their planner has no evidence door yet; they are not read here.
 */
import RULES from './fact-fields.json' with { type: 'json' }

/** role name → the field names (lower-cased) it covers. */
const ROLES = Object.entries(RULES.roles).map(([role, source]) => [role, new RegExp(source, 'i')])
/** field name → the sibling field names beside which it is a fact (a counter's `label`). */
const COMPANIONS = new Map(
  Object.entries(RULES.companions ?? {}).map(([field, beside]) => [field.toLowerCase(), new Set(beside)])
)

/**
 * The ACM field a slot writes, as the capture names it: the last string of its `jsonPath` with the
 * `group[field]` wrapper taken off, else the last ` / ` segment of its label (a jatable row label's
 * ` row N` suffix dropped). An HTML slot (an article's paragraph, a custom module's heading) has none.
 * @param {{ jsonPath?: unknown, label?: unknown }} slot
 * @returns {string}
 */
export function fieldOf(slot) {
  if (Array.isArray(slot.jsonPath)) {
    const name = [...slot.jsonPath].reverse().find((part) => typeof part === 'string') ?? ''
    return name.replace(/.*\[([^\]]+)\]$/, '$1')
  }
  const label = String(slot.label ?? '')
  const at = label.lastIndexOf(' / ')
  if (at < 0) return ''
  return label.slice(at + ' / '.length).replace(/ row \d+$/, '')
}

/**
 * The role a field holds a fact in, or null when it is words.
 * @param {string} field
 * @param {Set<string>} siblings - the fields of the same module, lower-cased
 * @returns {string | null}
 */
export function factRole(field, siblings = new Set()) {
  const name = field.toLowerCase()
  if (name === '') return null
  for (const [role, pattern] of ROLES) if (pattern.test(name)) return role
  const beside = COMPANIONS.get(name)
  if (beside && [...beside].some((other) => siblings.has(other))) return 'stat-label'
  return null
}

/** entity key → the lower-cased fields of its slots. */
function fieldsByEntity(slots) {
  /** @type {Map<string, Set<string>>} */
  const by = new Map()
  for (const slot of slots) {
    const field = fieldOf(slot).toLowerCase()
    if (field === '') continue
    const entity = String(slot.entity ?? '')
    if (!by.has(entity)) by.set(entity, new Set())
    by.get(entity)?.add(field)
  }
  return by
}

/**
 * The slots with `requiresEvidence` raised wherever the field holds a fact; what was gated stays gated.
 * Copies: the planner reads a profile once and hands the same map to every run.
 * @template {{ key?: unknown, entity?: unknown, jsonPath?: unknown, label?: unknown, requiresEvidence?: unknown, siteIdentity?: unknown }} T
 * @param {T[]} slots
 * @returns {T[]}
 */
export function withFieldEvidence(slots) {
  const by = fieldsByEntity(slots)
  return slots.map((slot) => {
    if (slot.siteIdentity === true) return { ...slot }
    const role = factRole(fieldOf(slot), by.get(String(slot.entity ?? '')))
    return role === null ? { ...slot } : { ...slot, requiresEvidence: true }
  })
}

/**
 * The fact fields a profile leaves open: what the contracts gate reports, what `regate-contract.mjs` closes.
 * @param {Array<{ key?: unknown, entity?: unknown, jsonPath?: unknown, label?: unknown, requiresEvidence?: unknown, siteIdentity?: unknown }>} slots
 * @returns {Array<{ key: string, field: string, role: string }>}
 */
export function ungatedFactSlots(slots) {
  const by = fieldsByEntity(slots)
  const open = []
  for (const slot of slots) {
    if (slot.requiresEvidence === true || slot.siteIdentity === true) continue
    const field = fieldOf(slot)
    const role = factRole(field, by.get(String(slot.entity ?? '')))
    if (role !== null) open.push({ key: String(slot.key ?? ''), field, role })
  }
  return open
}

/**
 * Whether one module's words are a list of facts of `roles` (a company's offices, a price list) under at most a heading
 * and an intro: it holds a fact of one of those roles, a fact field repeats (a list, not one line), and the words of its
 * own (a field that holds no fact and appears once; a picture's `alt` is not read) are two at most. A hero over a strip of
 * counters, a page section with its own paragraphs, is more than its list.
 * @param {Array<{ jsonPath?: unknown, label?: unknown, siteIdentity?: unknown }>} slots - the text slots of one module
 * @param {string[]} [roles]
 * @returns {boolean}
 */
export function isFactList(slots, roles = ['place', 'price']) {
  if (slots.some((slot) => slot.siteIdentity === true)) return false
  const fields = slots.map((slot) => fieldOf(slot).toLowerCase())
  const siblings = new Set(fields)
  /** @type {Map<string, number>} */
  const count = new Map()
  for (const field of fields) count.set(field, (count.get(field) ?? 0) + 1)
  const role = fields.map((field) => (field === '' ? null : factRole(field, siblings)))
  if (!role.some((r) => r !== null && roles.includes(r))) return false
  if (!fields.some((field, i) => role[i] !== null && (count.get(field) ?? 0) > 1)) return false
  const words = fields.filter(
    (field, i) => role[i] === null && count.get(field) === 1 && !/(?:^|[-_])alt$/.test(field)
  )
  return words.length <= 2
}

/**
 * The repeated row a fact slot belongs to (`<entity>|<group>|<index>`), or null: a slot that holds words, the site
 * identity, or a field the capture did not number. A repeated ACM field is numbered by the last number of its
 * `jsonPath` (`["tb-sys-branches", "tb-sys-branches[city]", 1]`), a jatable cell by its label's ` row N`.
 * @param {{ entity?: unknown, jsonPath?: unknown, label?: unknown, siteIdentity?: unknown }} slot
 * @param {Set<string>} [siblings] - the fields of the same module, lower-cased (a counter's `label` is a fact beside `value`)
 * @returns {string | null}
 */
export function factRowOf(slot, siblings = new Set()) {
  if (slot.siteIdentity === true || factRole(fieldOf(slot), siblings) === null) return null
  const entity = String(slot.entity ?? '')
  if (Array.isArray(slot.jsonPath)) {
    const index = [...slot.jsonPath].reverse().find((part) => typeof part === 'number')
    if (index === undefined) return null
    return `${entity}|${typeof slot.jsonPath[0] === 'string' ? slot.jsonPath[0] : ''}|${index}`
  }
  const label = String(slot.label ?? '')
  const row = / row (\d+)$/.exec(label)
  if (!row) return null
  return `${entity}|${label.slice(0, label.lastIndexOf(' / '))}|${row[1]}`
}

/**
 * The planned keys that leave a repeated row half written, which must keep the demo instead.
 *
 * 🔒 A REPEATED ROW IS ONE FACT: ITS FIELDS ARE WRITTEN TOGETHER OR NOT AT ALL (14/10/2026, acceptance of TCH #1331 on dev).
 * Site g66-accept-tbjoomla, Tracy Business Joomla 1.2.3, a description that mentions Dubai and no office answered: each
 * Branches `city` cell was gated, and "Dubai" is a verbatim piece of the brief, so all three passed as evidence while every
 * `addr` cell kept the demo's: "Dubai: Lipetsk SEZ, 6 Tekhnologichesky proezd". A branch, a team member, a client, a counter
 * is one thing; a row is written only when EVERY fact field of it is written with evidence (or already holds the
 * customer's words, `held`), and the same value written into one field of two rows is one fact, not two: those rows keep
 * the demo. One location of the business belongs in the site identity, which is never a row.
 * @param {object} input
 * @param {Array<{ key?: unknown, entity?: unknown, jsonPath?: unknown, label?: unknown, sample?: unknown, siteIdentity?: unknown }>} input.slots
 * @param {Record<string, string>} input.changes
 * @param {Record<string, string>} input.evidence
 * @param {Set<string>} [input.held] - keys whose slot already holds what a person wrote
 * @returns {string[]} keys of `changes` to drop
 */
export function partialFactRows({ slots, changes, evidence, held = new Set() }) {
  const by = fieldsByEntity(slots)
  /** @type {Map<string, Array<{ key: string, field: string }>>} row → its fact slots that ship words */
  const rows = new Map()
  for (const slot of slots) {
    if (String(slot.sample ?? '').trim() === '') continue
    const row = factRowOf(slot, by.get(String(slot.entity ?? '')))
    if (row === null) continue
    rows.set(row, [
      ...(rows.get(row) ?? []),
      { key: String(slot.key ?? ''), field: fieldOf(slot).toLowerCase() }
    ])
  }
  const proven = (/** @type {string} */ key) => key in changes && String(evidence[key] ?? '').trim() !== ''
  /** @type {Set<string>} */
  const dropped = new Set()
  /** `<entity>|<group>` + field + value → the rows that write it. */
  const seen = new Map()
  for (const [row, cells] of rows) {
    const written = cells.filter((cell) => cell.key in changes)
    if (written.length === 0) continue
    if (!cells.every((cell) => proven(cell.key) || held.has(cell.key))) {
      dropped.add(row)
      continue
    }
    const table = row.slice(0, row.lastIndexOf('|'))
    for (const cell of written) {
      const said = `${table}\u0000${cell.field}\u0000${String(changes[cell.key]).trim().toLowerCase()}`
      seen.set(said, [...(seen.get(said) ?? []), row])
    }
  }
  for (const same of seen.values()) if (same.length > 1) for (const row of same) dropped.add(row)
  return [...rows]
    .filter(([row]) => dropped.has(row))
    .flatMap(([, cells]) => cells.map((cell) => cell.key).filter((key) => key in changes))
}
