/**
 * Local review mode (`TRACY_LOCAL_REVIEW=1`, 17/10/2026): a local stand set up for a person to
 * review unpublished quickstart packs (`local-releases.js`) by eye, without building a site per look.
 *
 * With it on, and only on a stand that reads `TRACY_LOCAL_RELEASES_DIR` (refused at boot otherwise,
 * `config.js`), three things change on THIS stand:
 *   1. The template gallery offers the local packs only (`localReviewCards`): the published cards draw
 *      the released bytes, which are not what is under review, and they bury the "(local)" cards.
 *   2. The design system customer lock is open (`OPEN_LOCK`): a local pack never has a demo, so its /ops
 *      Design system step always holds DEMO-1 and the lock would keep the picker shut for good.
 *   3. The Add site preview of a local pack reads a running site built from that same pack when the
 *      pack has no demo (`localReviewDemoOf`): the newest one, so the preview shows the fixed bytes
 *      without a demo container (no extra RAM).
 *
 * 🔒 NOTHING HERE RUNS OFF A LOCAL STAND. `config.js` refuses the variable unless the local releases
 * directory is set, which is itself refused on production and on any public origin. Dev and production
 * never set it, so their gallery, lock and preview are unchanged.
 */
import { isLocalTag } from './local-releases.js'

/** A lock that blocks nobody: the shape `design-system-customer-lock.js` `customerLock` answers. */
export const OPEN_LOCK = Object.freeze({ blocked: async () => false })

/**
 * The gallery's cards in local review mode: the local packs' only. Off: unchanged.
 * @template {{ local?: boolean }} T
 * @param {T[]} cards
 * @param {boolean} on
 * @returns {T[]}
 */
export function localReviewCards(cards, on) {
  return on ? cards.filter((c) => c.local === true) : cards
}

/**
 * The newest running site built from a local pack: what stands in for the demo it never has.
 * Only a site with an address, a port and a platform, as a demo row the preview door reads has.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} tag
 */
export async function localPackSiteOf(pool, tag) {
  if (!isLocalTag(tag)) return null
  const { rows } = await pool.query(
    `select site_key, label, host, port, publish, address, platform, quickstart_version, quickstart_sha256
       from site
      where not demo and quickstart_tag = $1 and address is not null and port is not null and platform is not null
      order by created_at desc
      limit 1`,
    [tag]
  )
  return rows[0] ?? null
}

/**
 * The preview doors' `demoOf` in local review mode: the live demo when there is one, else (a local
 * pack only) the newest site built from it. Off: the live demo only, as before.
 * @param {{
 *   on: boolean,
 *   liveDemoOf: (tag: string) => Promise<any>,
 *   packSiteOf: (tag: string) => Promise<any>
 * }} deps
 * @returns {(tag: string) => Promise<any>}
 */
export function localReviewDemoOf({ on, liveDemoOf, packSiteOf }) {
  return async (tag) => {
    const demo = await liveDemoOf(tag)
    if (demo || !on || !isLocalTag(tag)) return demo ?? null
    return (await packSiteOf(tag)) ?? null
  }
}
