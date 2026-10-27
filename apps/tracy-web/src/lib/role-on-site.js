/**
 * The seat's role for one (email, site) pair — the ONE question every domain that answers a
 * customer site (`bar/route.js`, on a customer's own hostname) or a site's own dsh workspace
 * (`workspace/route.js`) must ask before handing out anything: does this viewer hold a LIVE,
 * accepted seat here, and if so, which role.
 *
 * Shared here, in `lib/`, rather than defined once per domain (the module-graph rule in
 * `test/module-graph.test.mjs` forbids a domain from importing another domain's store directly,
 * and `bar/`/`workspace/` are two different domains) — a second, independently-typed copy of this
 * exact check is exactly how a fix to one call site fails to reach the other. `seats` is taken as
 * a plain `{ accountByEmail, grantFor }` bag, never imported from `seats/store.js` itself, so this
 * file stays inside `lib/`'s own rule (no domain import) while both callers hand it the SAME
 * `seats/store.js` functions, wired at the composition root (`app.js`).
 *
 * FAILS CLOSED, on every axis: no email, no `pool`, no `seats`, no matching account, no live grant
 * (`grantFor`'s own filter: not revoked, not declined, and ACCEPTED — an invited-but-not-yet-
 * accepted or a since-revoked seat reads identically to "never invited"), or the lookup itself
 * throwing (a dropped connection, a bad query) — all of them answer `null`, never a role. A caller
 * that reads `null` as "this viewer has no standing on this site" and refuses is the only correct
 * reading; treating a thrown error as anything other than "no role" is precisely the class of bug
 * this file exists to keep out of two places instead of one.
 *
 * @param {import('pg').Pool|null} pool
 * @param {{accountByEmail: Function, grantFor: Function}|null} seats
 * @param {string|null} email
 * @param {string} siteKey
 * @returns {Promise<string|null>} the live role, or null.
 */
export async function roleOnSite(pool, seats, email, siteKey) {
  if (!email || !pool || !seats) return null
  try {
    const account = await seats.accountByEmail(pool, email)
    if (!account) return null
    const grant = await seats.grantFor(pool, account.id, siteKey)
    return grant?.role ?? null
  } catch {
    // A thrown lookup (dropped connection, a bad query) is not a role — refuse, don't propagate a
    // 500 that leaves the caller to decide what an exception means for authorization.
    return null
  }
}
