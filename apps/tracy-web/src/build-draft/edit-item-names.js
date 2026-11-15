/**
 * A renamed item reaches the needs profile (#612). The edit gate writes a fact value the owner changed into the profile
 * (`plan-edit-gate.mjs profileAfterEdit`), but an item's label on the plan card (`items[<id>].label`) changed the plan
 * only. The writer reads an item's name from the profile (`page-writer-context.mjs`, the plan data of the profile), so
 * a service renamed on the card was still written under its old name on every page.
 *
 * Here the new label becomes the value of the item's naming field (`primaryRoleOf(kind)`: `offering.name` for a
 * service, `person.name` for a person), with the owner as its only source, as a fact the owner changed is. A review and
 * a photo are not named by their label (it is "Review by ..." and a picture caption): their label stays a plan label.
 * Pure. The home of this rule is the edit gate (Part 3, `profileAfterEdit`); it lives here until it moves there.
 */
import { ANSWER_SOURCE } from 'website-opportunities/domain/plan-answers.mjs'
import { GROUP_KINDS_V3 } from 'website-opportunities/domain/place-content-roles.mjs'

const LABEL = /^items\[([^\]]+)\]\.label$/
/** Kinds whose plan label is not their name. */
const NOT_NAMED_BY_LABEL = new Set(['quote', 'gallery'])
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The profile with every item label the edit changed written into the item's naming field.
 * @param {object} profile the needs profile the edit gate answered
 * @param {{changes?: Array<{field: string, value: unknown}>}} edit
 * @returns {object} the same profile when nothing was renamed, else a changed copy
 */
export function profileWithItemNames(profile, edit) {
  const renames = list(edit?.changes)
    .map((c) => ({ id: LABEL.exec(String(c?.field ?? ''))?.[1], value: c?.value }))
    .filter((r) => r.id && typeof r.value === 'string' && r.value.trim() !== '')
  if (renames.length === 0 || !profile?.items) return profile
  const next = structuredClone(profile)
  let changed = false
  for (const [kind, items] of Object.entries(next.items)) {
    if (NOT_NAMED_BY_LABEL.has(kind)) continue
    const role = GROUP_KINDS_V3[kind]?.requiredRoles?.[0]
    if (!role) continue
    for (const item of list(items)) {
      const rename = renames.find((r) => r.id === item?.id)
      if (!rename) continue
      item.fields ??= {}
      item.fields[role] = { ...item.fields[role], value: rename.value.trim(), sources: [ANSWER_SOURCE] }
      changed = true
    }
  }
  if (!changed) return profile
  if (!list(next.sources).some((s) => s?.id === ANSWER_SOURCE))
    next.sources = [...list(next.sources), { id: ANSWER_SOURCE, origin: 'answer' }]
  return next
}
