// An item renamed on the plan card reaches the needs profile (#612, the edit gate's `profileAfterEdit`). The writer
// reads an item's name from the profile (`page-writer-context.mjs`, the plan data of the profile), not from the plan's
// `items[].label`, so a label edit that changed only the plan left every writer request with the old name.
//
// The rule: the new label becomes the value of the item's naming field, the first required role of its kind
// (`GROUP_KINDS_V3`: `offering.name` for a service or a dish, `package.name` for a package, `person.name` for a team
// member, `step.title`, `event.title`, `faq.question`, `stat.value`), with the owner as its only source, as a fact the
// owner changed is. A review and a photo are not named by their label (it reads "Review by ..." and a photo caption),
// and a kind with no required role (a claim, a post) has no naming field: their label stays a plan label. Written to
// the same shape the build chat's own patch wrote (`build-draft/edit-item-names.js`), so that patch, run after this,
// changes nothing.
import { ANSWER_SOURCE } from './plan-answers.mjs'
import { GROUP_KINDS_V3 } from './place-content-roles.mjs'

const LABEL = /^items\[([^\]]+)\]\.label$/
/** Kinds whose plan label is not their name. */
export const NOT_NAMED_BY_LABEL = Object.freeze(['quote', 'gallery'])

/** The field that names an item of `kind`, or null when its label is not its name. */
export function namingRoleOf(kind) {
  if (NOT_NAMED_BY_LABEL.includes(kind)) return null
  return GROUP_KINDS_V3[kind]?.requiredRoles?.[0] ?? null
}

/**
 * Write the item label changes of `changes` into the profile items of `data` (the plan data of the profile copy being
 * edited, `planDataOf`), in place.
 * @param {{byId: Map<string, {what: string, kind: string, source: object}>}} data
 * @param {Array<{field: string, value: unknown}>} changes
 * @returns {boolean} whether an item was renamed
 */
export function renameItems(data, changes) {
  let changed = false
  for (const { field, value } of changes) {
    const id = LABEL.exec(String(field ?? ''))?.[1]
    const record = id && data.byId.get(id)
    if (record?.what !== 'item' || typeof value !== 'string' || value.trim() === '') continue
    const role = namingRoleOf(record.kind)
    if (!role) continue
    const item = record.source
    item.fields ??= {}
    item.fields[role] = { ...item.fields[role], value: value.trim(), sources: [ANSWER_SOURCE] }
    changed = true
  }
  return changed
}
