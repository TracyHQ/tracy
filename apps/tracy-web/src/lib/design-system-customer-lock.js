/**
 * Which templates a CUSTOMER may put a design system on (15/10/2026): until a template is design
 * system ready, customers cannot pick, preview or apply a system on it. Tracy staff (an accepted seat in
 * the `tracy_admin` workspace) keep every template, so they can test the rest from `/ops` and from a site.
 *
 * 🔒 NO HAND-KEPT LIST: THE LOCK READS /ops (15/10/2026). A template is open to customers when
 * the /ops Design system step (Road to live, ADR 0031) of every choosable release of it says `ds-ready`:
 * 0 must-fix, 0 worth-fixing, nothing "not measured" (`design-system-ready-templates.js`, which reads
 * the step `roadOf` builds, never a verdict of its own). A release whose version was never checked is
 * locked until the check has run. So /ops and what a customer can do always say the same thing.
 * A key is a slot contract's `template` (`<cms>/<template>`, what `lib/ds-slot.js` `templateKeyOf`
 * answers), so the lock names a template AND its CMS.
 *
 * 🔒 THE LOCK ONLY STOPS NEW PICKS. A site that already wears a system keeps it: nothing here strips a
 * slot, its Design system read still names what it wears, and its undo door stays open (an undo only goes
 * back to what the site held). Every door that would put a NEW look on a site, or show one, refuses:
 *   - `GET  /api/design-system/support`          `supported: false`, `reason: TEMPLATE_NOT_READY`, `locked: true`
 *   - `GET  /api/design-system/preview`          403 `DS_TEMPLATE_LOCKED`
 *   - `POST /api/sites {designSystem}`           403 `DS_TEMPLATE_LOCKED`, before anything is claimed
 *   - `GET  /api/sites/:key/design-system`       `supported: false`, `reason: TEMPLATE_NOT_READY`, `locked: true`
 *   - `GET  /api/sites/:key/design-system/preview`  403 `DS_TEMPLATE_LOCKED` (the template's own look stays)
 *   - `POST /api/sites/:key/design-system`       403 `DS_TEMPLATE_LOCKED` (the press, the chat route, a new
 *                                                site's build)
 *
 * 🔒 STAFF IS READ PER ASK, AND A READ THAT FAILS IS "NOT STAFF". The question is the same predicate as
 * `ops/admit.js` (an accepted, unrevoked, undeclined `tracy_admin` seat); a database that cannot answer
 * keeps the lock shut rather than opening it.
 */

/**
 * Emergency deny-list: slot contract `template` keys locked for customers whatever /ops says. Use it
 * ONLY to hide a template /ops wrongly passes, and fix the checker (`template-design-system-readiness/`)
 * in the same PR, then empty the list again.
 */
export const CUSTOMER_DESIGN_SYSTEM_DENY = Object.freeze(/** @type {string[]} */ ([]))

/** The refusal code of a door the lock closes. */
export const DS_TEMPLATE_LOCKED = 'DS_TEMPLATE_LOCKED'

/** The `reason` a read says for a locked template: the words customers already have for "not ready yet". */
export const LOCKED_REASON = 'TEMPLATE_NOT_READY'

/**
 * Whether `email` is Tracy staff: an accepted seat in the `tracy_admin` workspace (`ops/admit.js`).
 * False for no pool, no email, or a query that fails.
 * @param {import('pg').Pool | null | undefined} pool
 * @returns {(email: string | null | undefined) => Promise<boolean>}
 */
export function staffReader(pool) {
  return async (email) => {
    if (!pool || typeof email !== 'string' || email === '') return false
    try {
      const { rows } = await pool.query(
        `select 1
           from account a
           join seat_workspace sw on sw.account_id = a.id
           join workspace w on w.id = sw.workspace_id
          where a.email = $1
            and w.kind = 'tracy_admin'
            and sw.revoked_at is null and sw.declined_at is null and sw.accepted_at is not null
          limit 1`,
        [email]
      )
      return rows.length > 0
    } catch {
      return false
    }
  }
}

/**
 * The lock the Design system doors ask (`sites/design-system.js` `customerLock`): staff pass every
 * template; for anyone else a template is open only when /ops says it is ready (`isReady`, the reader of
 * `design-system-ready-templates.js`) and it is not on the deny-list. A read that fails keeps it shut.
 * @param {{
 *   isStaff: (email: string | null | undefined) => Promise<boolean>,
 *   isReady: (templateKey: string | null | undefined) => Promise<boolean>,
 *   deny?: readonly string[]
 * }} deps
 * @returns {{ blocked: (email: string | null | undefined, templateKey: string | null | undefined) => Promise<boolean> }}
 */
export function customerLock({ isStaff, isReady, deny = CUSTOMER_DESIGN_SYSTEM_DENY }) {
  const staff = async (/** @type {string | null | undefined} */ email) => {
    try {
      return await isStaff(email)
    } catch {
      return false
    }
  }
  const ready = async (/** @type {string | null | undefined} */ templateKey) => {
    if (typeof templateKey !== 'string' || templateKey === '' || deny.includes(templateKey)) return false
    try {
      return (await isReady(templateKey)) === true
    } catch {
      return false
    }
  }
  return {
    async blocked(email, templateKey) {
      if (await ready(templateKey)) return false
      return !(await staff(email))
    }
  }
}
