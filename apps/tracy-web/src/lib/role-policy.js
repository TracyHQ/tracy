/**
 * LEFT OVER FROM THE ROLE MATRIX, KEPT THIN UNTIL ITS LAST CALLER IS GONE (ADR 0028, 08/10/2026).
 *
 * This file used to resolve which role → toolset matrix governed a site (workspace first, then the
 * site's own, then the shipped default) so the Apply door and the seat mint agreed on one answer.
 * ADR 0028 removed the matrix: each role now holds a FIXED set (`seats/roles.js`), and nothing a
 * site or workspace stores can widen or narrow it. The policy tables are no longer read.
 *
 * What remains answers in the old shapes so a caller not yet moved keeps working, and answers the
 * fixed sets: `effectiveRolePolicy` always says "no policy", and `toolsetsOn` ignores any policy it
 * is handed. New code calls `seats/roles.js`'s `toolsetsFor` / `permissionsFor` (injected, since a
 * domain may not import another domain) and never this file. Delete it once `git grep role-policy`
 * finds no importer.
 */

/**
 * Always null: there is no per-site or per-workspace policy any more. Kept for callers still
 * passing its answer on to `permissionsFor`, which ignores it.
 * @returns {Promise<null>}
 */
export async function effectiveRolePolicy() {
  return null
}

/** The seat book's four toolsets, in the order the seat door lists them (`SEAT_TOOLSETS`). */
export const TOOLSETS = ['content', 'code', 'site', 'lifecycle']

/**
 * The toolsets a role holds, as the LIST the seat door takes. An empty list is a real answer
 * ("read-only"), and it is sent as one: the door reads an absent `toolsets` as "use the role
 * default".
 * @param {Function} permissionsFor - `seats/roles.js`'s `permissionsFor`, injected (lib/ imports no domain).
 * @param {string} role
 * @returns {string[]}
 */
export function toolsetsOn(permissionsFor, role) {
  const perms = permissionsFor(role)
  return TOOLSETS.filter((name) => perms[name] === true)
}
