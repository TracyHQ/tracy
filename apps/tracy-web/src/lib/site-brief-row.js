/**
 * Which `site_brief` row is the site's own — kept in lib/ so the opportunities domain can read a
 * site's brief without importing the sites domain (module-graph rule).
 */

/**
 * 🔒 A ROW OLDER THAN ITS SITE IS A DELETED SITE'S (TCH #1013, 12/10/2026). The key is the address, and deleting a site
 * left its row behind (until #1749, `DELETE_BRIEF_OF_GONE`; rows left before it remain), so a site made again under the
 * same address found the deleted site's row: its answers were never written and the poll said `applied` with the
 * deleted site's notes. The site row is written by the claim before any brief (`route.js` `claimOwnership` →
 * `briefs.start`), so a row created before the site standing under the address now is not this site's — the rule
 * `hasJob` (`store.js`) already keeps for jobs. No site row at all (a test, a row read after its site is gone) keeps
 * the row as it is.
 */
export const CURRENT_BRIEF = `(s.created_at is null or b.created_at >= s.created_at)`

/**
 * 🔒 A REMOVED SITE TAKES ITS `site_brief` ROW (#1749). The table has no foreign key on purpose: a quality build writes
 * its brief before the site row exists (`putQualityBrief`, `opportunities-build/quality-protocol.js`). A brief left
 * behind outlived its site, and a WO demo build reusing the key was refused `AGENT_DEMO_OTHER_WRITER`
 * (`opportunities-build/handoff.js`). Every statement that deletes a site row names the rows it deleted `gone` and ends
 * with this, so the brief goes in the same statement and only when the site row did.
 */
export const DELETE_BRIEF_OF_GONE = 'delete from site_brief b using gone where b.site_key = gone.site_key'

/**
 * The site's own row, or null — never a deleted site's row left under the same address (`CURRENT_BRIEF`).
 * @param {import('pg').Pool} pool @param {string} siteKey
 */
export async function briefOf(pool, siteKey) {
  const { rows } = await pool.query(
    `select b.* from site_brief b left join site s on s.site_key = b.site_key
      where b.site_key = $1 and ${CURRENT_BRIEF}`,
    [siteKey]
  )
  return rows[0] ?? null
}
