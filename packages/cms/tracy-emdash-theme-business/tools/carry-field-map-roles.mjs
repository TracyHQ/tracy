// carry-field-map-roles.mjs: keep the slot roles of seed/field-map.json when the file is regenerated (ADR 0038).
//
// WHY. A field map declares, once per field, which role its copy plays (`role`, `group`, `subRoles`), plus the
// top-level `roleVocabularyVersion` and `settings`. The generators (build-seed.mjs, compile-seed.mjs) rebuild the map
// from their sources and know nothing about roles, so without this a regeneration silently erases the declaration.
//
// RULE. Same idea as the Joomla and WordPress capture: a role is kept when the field still exists with the same
// shape (same name, same type; for a repeater, per sub-field). A new or reshaped field gets none, so the contract check
// (`node scripts/slot-roles/check.mjs`) reports it by name instead of letting it inherit a role that may be wrong.
//
// NO ROLES, NO CHANGE. A field map that declares no role at all (a template that has not adopted ADR 0038 yet) is
// returned exactly as generated: no key is added, moved or reordered, so its seed output is byte-identical.
import { existsSync, readFileSync } from 'node:fs'

const ROLE_KEYS = ['role', 'group', 'subRoles']
const TOP_LEVEL_KEYS = ['roleVocabularyVersion', 'settings']

/** The previous field map at `file`, or null when there is none or it is unreadable. */
export function readPreviousFieldMap(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** `field` with the role keys of `old` added, when `old` is the same field (same name, same type). */
function withRoles(field, old) {
  if (!old || old.type !== field.type) return field
  const out = { ...field }
  if (old.role !== undefined) out.role = old.role
  if (old.subRoles !== undefined) {
    // A repeater keeps the role of every sub-field that still exists with the same type; an added or retyped
    // sub-field gets none and is reported by the contract check.
    const oldTypes = new Map((old.subFields ?? []).map((raw) => String(raw).split(':')))
    const live = new Map((field.subFields ?? []).map((raw) => String(raw).split(':')))
    const kept = Object.fromEntries(
      Object.entries(old.subRoles).filter(([name]) => live.has(name) && oldTypes.get(name) === live.get(name))
    )
    if (Object.keys(kept).length > 0) out.subRoles = kept
  }
  if (old.group !== undefined && (out.role !== undefined || out.subRoles !== undefined)) out.group = old.group
  return out
}

/** Whether `map` declares any slot role, at the top level or on any field, in either field-map shape. */
export function declaresRoles(map) {
  if (!map || typeof map !== 'object') return false
  if (TOP_LEVEL_KEYS.some((key) => map[key] !== undefined)) return true
  const hasRole = (field) => field && ROLE_KEYS.some((key) => field[key] !== undefined)
  if (Object.values(map.fields ?? {}).some(hasRole)) return true
  return (map.collections ?? []).some((c) => (c.fields ?? []).some(hasRole))
}

function withTopLevel(previous, next) {
  const out = { ...next }
  const carried = {}
  for (const key of TOP_LEVEL_KEYS) if (previous[key] !== undefined) carried[key] = previous[key]
  // Insert right after generatedAt, where the declaration sits in the committed file.
  const { generatedAt, ...rest } = out
  return { ...(generatedAt !== undefined ? { generatedAt } : {}), ...carried, ...rest }
}

/**
 * The field map build-seed.mjs writes (`collections[].fields[]`) with the roles of `previous` carried over.
 * @param {any} previous the field map on disk before regeneration (null for none)
 * @param {any} next the freshly generated field map
 */
export function carryRolesIntoFieldMap(previous, next) {
  if (!declaresRoles(previous)) return next
  const oldFields = new Map(
    (previous.collections ?? []).map((c) => [c.collection, new Map((c.fields ?? []).map((f) => [f.slug, f]))])
  )
  const out = withTopLevel(previous, next)
  out.collections = (next.collections ?? []).map((col) => {
    const old = oldFields.get(col.collection)
    if (!old) return col
    return { ...col, fields: (col.fields ?? []).map((f) => withRoles(f, old.get(f.slug))) }
  })
  return out
}

/**
 * The field map compile-seed.mjs writes (`fields` keyed `<collection>.<field>`) with the roles of `previous` kept
 * where the field's source kind and target type are unchanged.
 */
export function carryRolesIntoCompiledMap(previous, next) {
  if (!declaresRoles(previous)) return next
  const out = withTopLevel(previous, next)
  out.fields = Object.fromEntries(
    Object.entries(next.fields ?? {}).map(([key, entry]) => {
      const old = previous.fields?.[key]
      if (!old || old.source !== entry.source || old.target !== entry.target) return [key, entry]
      const kept = { ...entry }
      for (const roleKey of ROLE_KEYS) if (old[roleKey] !== undefined) kept[roleKey] = old[roleKey]
      return [key, kept]
    })
  )
  return out
}
