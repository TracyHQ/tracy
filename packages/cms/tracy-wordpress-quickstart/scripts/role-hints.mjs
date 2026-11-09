/**
 * Role hints: the roles a person (or an agent that read the pictures) decided for slots the rule tables cannot decide
 * from a slot's own signals, kept in a committed file next to the template so every recapture produces them again.
 * Shape: { version: 1, hints: [{ key, role, group?, why }] }. A hint names an existing slot, a role of the vocabulary and,
 * for a fact role, its group; it carries the reason. Pure: the map in, the map and the errors out.
 */
import { isGroupKind, isRole } from '../../../wo/website-opportunities/domain/place-content-roles.mjs'

export function applyRoleHints(contentMap, hintsFile, vocabulary, { allowMissing = false } = {}) {
  if (hintsFile === undefined || hintsFile === null) return { contentMap, errors: [] }
  const errors = []
  if (hintsFile.version !== 1 || !Array.isArray(hintsFile.hints)) {
    return { contentMap, errors: ['role hints: version must be 1 and hints a list'] }
  }
  const slots = contentMap.slots.map((s) => ({ ...s }))
  const byKey = new Map(slots.map((s) => [s.key, s]))
  for (const hint of hintsFile.hints) {
    const at = `role hint ${JSON.stringify(hint?.key ?? null)}`
    const slot = byKey.get(hint?.key)
    if (!slot) {
      // capture-contract runs before the picture slots exist: a hint for one is applied by capture-image-slots
      if (!allowMissing) errors.push(`${at} names no slot of the map`)
      continue
    }
    if (typeof hint.why !== 'string' || !hint.why.trim()) {
      errors.push(`${at} needs a reason (why)`)
      continue
    }
    if (!isRole(hint.role, vocabulary)) {
      errors.push(`${at}: ${JSON.stringify(hint.role)} is not a ${vocabulary} role`)
      continue
    }
    if (hint.group !== undefined && hint.group !== null && !isGroupKind(hint.group.kind, vocabulary)) {
      errors.push(`${at}: ${JSON.stringify(hint.group.kind)} is not a group kind`)
      continue
    }
    slot.role = hint.role
    if (hint.group === null) delete slot.group
    else if (hint.group !== undefined) slot.group = { ...hint.group }
  }
  return { contentMap: { ...contentMap, slots }, errors }
}
