/**
 * The seat book's role rules (ADR 0028), as pure functions — no `env`, no fetch, no cache.
 *
 * Three roles, Google Docs style. Each holds a FIXED set of toolsets: there is no per-site or
 * per-workspace matrix any more, so nothing a site or workspace stores can widen or narrow a role.
 * Toolsets stay the internal language the seat door speaks to dsh (ADR 0001); customers only ever
 * see the three role names.
 *
 * - viewer: sees the site, its changes and the team, comments, asks the agent (read-only agent).
 * - editor: changes the whole site, publish and restore included; invites viewers and editors.
 * - owner:  also manages people, the custom domain and the site's lifecycle.
 *
 * The staff ranks of the `tracy_admin` workspace (`owner/admin/developer`, read by `ops/`) are NOT
 * these roles and do not go through this file.
 */

/** The seat book's three roles, widest first. The migration's check constraint states the same list. */
export const ROLES = ['owner', 'editor', 'viewer']

/** Roles an invitation may carry. Owners are made from the Team list, never by invitation. */
export const INVITABLE_ROLES = ['editor', 'viewer']

/**
 * Roles retired by ADR 0028, and what each became. Only things minted before the migration can
 * still carry one (a signed invitation link, a stale client); read them through `normalizeRole`.
 */
export const RETIRED_ROLES = { admin: 'editor', developer: 'editor' }

/** The seat book's four toolsets, in the order the seat door lists them. */
export const TOOLSETS = ['content', 'code', 'site', 'lifecycle']

/** What each role may use. A viewer holds none: the agent is read-only for it. */
export const TOOLSETS_BY_ROLE = {
  owner: ['content', 'code', 'site', 'lifecycle'],
  editor: ['content', 'code', 'site'],
  viewer: []
}

/**
 * A current role name for any role string, or null when it is not a role at all. Retired names map
 * to their successor so a link minted before the migration still lands on a real role.
 * @param {unknown} role
 * @returns {'owner'|'editor'|'viewer'|null}
 */
export function normalizeRole(role) {
  if (typeof role !== 'string') return null
  if (ROLES.includes(role)) return role
  // `hasOwn`, not a plain lookup: `RETIRED_ROLES['constructor']` is a function, not a role.
  return Object.hasOwn(RETIRED_ROLES, role) ? RETIRED_ROLES[role] : null
}

/** A seat that is live: accepted, and neither revoked nor declined. Pending invites grant nothing. */
export const isLive = (grant) => Boolean(grant?.accepted_at && !grant.revoked_at && !grant.declined_at)

/** Owner rights: manage people, make owners, the domain, delete the site. Must be a live seat. */
export const actingOwner = (grant) => Boolean(grant?.role === 'owner' && isLive(grant))

/** Edit rights: change the site through Tracy, publish, restore, undo, invite. Must be a live seat. */
export const actingEditor = (grant) =>
  Boolean((grant?.role === 'owner' || grant?.role === 'editor') && isLive(grant))

/**
 * What one role may do, as one boolean per toolset. An unknown role gets nothing (fail closed).
 * @param {string} role
 * @returns {{content: boolean, code: boolean, site: boolean, lifecycle: boolean}}
 */
export function permissionsFor(role) {
  const held = TOOLSETS_BY_ROLE[normalizeRole(role) ?? ''] ?? []
  const result = {}
  for (const name of TOOLSETS) result[name] = held.includes(name)
  return result
}

/**
 * The toolsets a role holds, as the LIST the seat door takes. An empty list is a real answer
 * ("read-only") and must be sent as one: the door reads an absent `toolsets` as "use a default".
 * @param {string} role
 * @returns {string[]}
 */
export function toolsetsFor(role) {
  return [...(TOOLSETS_BY_ROLE[normalizeRole(role) ?? ''] ?? [])]
}
