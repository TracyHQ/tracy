// Slot roles declared on the slots of a quickstart content map (ADR 0038): the deterministic contract check, and the
// group plan (`groups` + `bindings`, the shape `planSlotFill` takes) read from them.
//
// The content map shape. Two OPTIONAL fields per slot; a reader that ignores them keeps working:
//
//   "role":  "offering.price"
//            a name from the vocabulary (`PLACE_CONTENT_ROLES`, `place-content-roles.mjs`)
//   "group": { "id": "module-503.item.1", "item": 1, "kind": "menu_item" }
//            id    shared by every slot of one card (a sidecar binding's `groupId`)
//            item  which entity of its kind the card shows, from 0 (a sidecar group's `itemIndex`)
//            kind  the kind of entity the card holds (a sidecar group's `entityKind`, one of `GROUP_KINDS`)
//
// and, at the top level of the map, the vocabulary the roles were bound against:
//
//   "roleVocabularyVersion": "place-content-roles/2"   (or "place-content-roles/3", ADR 0040)
//
// A version 3 map may also declare repeatable lists (`content-map-repeatable-lists.mjs`), and in it the role alone
// decides whether a slot keeps the demo's content: `customize` and a picture's `fit.replace` must follow from the role
// (`content-map-keep-decision.mjs`).
//
// What a slot no fact fills shows, which kinds a card may borrow from and which roles a kind needs all come from the
// vocabulary; the map states none of them. Released content maps are never edited (their hash is bound on every site),
// so roles appear only in contract versions released after ADR 0038.
import { keepDerivationProblems } from './content-map-keep-decision.mjs'
import { repeatableListProblems } from './content-map-repeatable-lists.mjs'
import { sectionDeclarationProblems } from './content-map-section-declarations.mjs'
import {
  CONTENT_MAP_ROLE_VOCABULARY_VERSIONS,
  DEFAULT_NEUTRAL_BY_ROLE,
  GROUP_KINDS_V3,
  ROLE_VOCABULARY_V3,
  SLOT_ROLES_SCHEMA_VERSION,
  isFactRole,
  isGroupKind,
  isRole,
  modeOfRole
} from './place-content-roles.mjs'

/** Slot types that hold words or a picture: each must carry a role once a map declares roles. */
const ROLE_REQUIRED_TYPES = new Set(['text', 'image'])

const slotsOf = (contentMap) => (Array.isArray(contentMap?.slots) ? contentMap.slots : [])
const has = (object, key) => Boolean(object && typeof object === 'object' && Object.hasOwn(object, key))

/**
 * Whether a content map declares slot roles at all: a vocabulary version, or a role or group on any slot.
 * @param {any} contentMap
 */
export function contentMapDeclaresRoles(contentMap) {
  return (
    has(contentMap, 'roleVocabularyVersion') ||
    slotsOf(contentMap).some((slot) => has(slot, 'role') || has(slot, 'group'))
  )
}

function groupProblem(group, version) {
  if (!group || typeof group !== 'object' || Array.isArray(group))
    return 'group must be an object {id, item, kind}'
  if (typeof group.id !== 'string' || !group.id.trim()) return 'group needs a non-empty id'
  if (!Number.isInteger(group.item) || group.item < 0) return 'group item must be a whole number from 0'
  if (version === undefined ? !has(GROUP_KINDS_V3, group.kind) : !isGroupKind(group.kind, version))
    return `group kind ${JSON.stringify(group.kind)} is not a known kind`
  return null
}

/**
 * The contract check of a content map's slot roles. A map that declares no roles is not checked (`declared: false`):
 * contracts released before ADR 0038 have none. A map that declares roles must name the current vocabulary, give every
 * text and image slot a known role, put every fact slot in a group, and keep each group whole (one card, one kind, no
 * slot twice, the roles its kind needs present).
 * @param {any} contentMap
 * @returns {{declared: boolean, ok: boolean, errors: string[]}}
 */
export function checkContentMapRoles(contentMap) {
  // Button actions are judged by the contract gate (`buttonActionProblems`, `scripts/slot-roles/check.mjs`), not here: this
  // check also decides at build time whether a released map's roles are used, and a released map is never edited.
  if (!contentMapDeclaresRoles(contentMap)) return { declared: false, ok: true, errors: [] }
  const errors = []
  const version = contentMap.roleVocabularyVersion
  if (!CONTENT_MAP_ROLE_VOCABULARY_VERSIONS.includes(version))
    errors.push(
      `roleVocabularyVersion must be one of ${CONTENT_MAP_ROLE_VOCABULARY_VERSIONS.map((v) => `"${v}"`).join(', ')}, got ${JSON.stringify(version)}`
    )
  // An unknown version is reported above; its roles are judged as the version capture writes.
  const rolesOf = CONTENT_MAP_ROLE_VOCABULARY_VERSIONS.includes(version) ? version : undefined

  const seen = new Set()
  /** @type {Map<string, {item: number, kind: string, slotKey: string, roles: Set<string>}>} */
  const groups = new Map()
  for (const slot of slotsOf(contentMap)) {
    const key = String(slot?.key ?? '')
    if (seen.has(key)) errors.push(`slot "${key}" appears more than once`)
    seen.add(key)
    const named = `slot "${key}"${slot?.type ? ` (${slot.type})` : ''}`

    if (!has(slot, 'role')) {
      if (ROLE_REQUIRED_TYPES.has(slot?.type)) errors.push(`${named} has no role`)
    } else if (!isRole(slot.role, rolesOf)) {
      errors.push(`${named} has unknown role ${JSON.stringify(slot.role)}`)
    }
    if (version === ROLE_VOCABULARY_V3)
      for (const problem of keepDerivationProblems(slot)) errors.push(`${named} ${problem}`)

    if (!has(slot, 'group')) {
      if (isFactRole(slot?.role)) errors.push(`${named} has fact role "${slot.role}" and needs a group`)
      continue
    }
    const problem = groupProblem(slot.group, rolesOf)
    if (problem) {
      errors.push(`${named}: ${problem}`)
      continue
    }
    if (!has(slot, 'role')) errors.push(`${named} is in group "${slot.group.id}" but has no role`)
    const { id, item, kind } = slot.group
    const known = groups.get(id)
    if (!known) {
      groups.set(id, { item, kind, slotKey: key, roles: new Set([slot.role]) })
      continue
    }
    known.roles.add(slot.role)
    if (known.item !== item || known.kind !== kind)
      errors.push(
        `group "${id}" is split: slot "${known.slotKey}" says item ${known.item} kind ${known.kind}, slot "${key}" says item ${item} kind ${kind}`
      )
  }

  for (const [id, group] of groups) {
    const missing = GROUP_KINDS_V3[group.kind].requiredRoles.filter((role) => !group.roles.has(role))
    if (missing.length > 0)
      errors.push(`group "${id}" (${group.kind}) lacks the role(s) its kind needs: ${missing.join(', ')}`)
  }
  errors.push(...repeatableListProblems(contentMap, groups))
  errors.push(...sectionDeclarationProblems(contentMap))
  return { declared: true, ok: errors.length === 0, errors }
}

/**
 * The group plan of a content map's slot roles, in the shape a `slot-roles.json` sidecar has (`planSlotFill` input):
 * one group per card, one binding per fact slot in a group. Editorial slots are not bound: no fact fills them. Pure;
 * run `checkContentMapRoles` first, this does not judge the map.
 * @param {any} contentMap
 * @param {{contract?: string | null, cms?: string | null}} [about]
 */
export function slotRolesOfContentMap(contentMap, { contract = null, cms = null } = {}) {
  /** @type {Map<string, any>} */
  const groups = new Map()
  const bindings = []
  for (const slot of slotsOf(contentMap)) {
    if (!isFactRole(slot?.role) || groupProblem(slot?.group)) continue
    const { id, item, kind } = slot.group
    let group = groups.get(id)
    if (!group) {
      group = {
        id,
        groupId: id,
        entityKind: kind,
        allowedKinds: [...GROUP_KINDS_V3[kind].allowedKinds],
        itemIndex: item,
        requiredRoles: [...GROUP_KINDS_V3[kind].requiredRoles],
        neutral: {}
      }
      groups.set(id, group)
    }
    group.neutral[slot.role] ??= DEFAULT_NEUTRAL_BY_ROLE[slot.role] ?? { policy: 'empty' }
    bindings.push({ slotKey: String(slot.key), groupId: id, role: slot.role, mode: modeOfRole(slot.role) })
  }
  return {
    schemaVersion: SLOT_ROLES_SCHEMA_VERSION,
    roleVocabularyVersion: contentMap?.roleVocabularyVersion ?? null,
    contract,
    cms,
    status: 'checked',
    groups: [...groups.values()],
    bindings
  }
}
