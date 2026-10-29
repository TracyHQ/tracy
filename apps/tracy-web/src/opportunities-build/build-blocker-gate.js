/**
 * The blocker gate (spec TracyHQ/tracy#189). Runs once the brief build's final check and its one bounded cleanup turn
 * (`demo-leftover-cleanup.js`) are done: the report left on the receipt is judged by the domain's one list of blocker
 * kinds (`website-opportunities/domain/build-blockers.mjs`) and the verdict is kept as `receipt.blockers`
 * (`{version, state: 'clear' | 'needs-fixes', items: [{rule, pages, count}], total}`). A build whose verdict is
 * `needs-fixes` is shown to the person as "Needs fixes" with that list, never as built (`status.ts` `buildView`).
 *
 * It sits in the shared build runner, after the CMS engine, so it holds for every CMS. It never fails the build: the site
 * stays for the person to open and fix. A build with no check report (no page reader) is left alone.
 */

/**
 * @param {{query: Function}} db
 * @param {{build: any, domain: any}} input
 * @returns {Promise<any>} the build as it stands afterwards
 */
export async function gateBuildBlockers(db, { build, domain }) {
  if (typeof domain?.buildBlockers !== 'function' || !build?.receipt?.leftovers) return build
  const blockers = domain.buildBlockers(build.receipt.leftovers)
  try {
    const { rows } = await db.query(
      `update wo_build set receipt = coalesce(receipt, '{}'::jsonb) || $2::jsonb, updated_at = now()
       where id = $1 returning *`,
      [build.id, JSON.stringify({ blockers })]
    )
    return rows[0] ?? { ...build, receipt: { ...build.receipt, blockers } }
  } catch (error) {
    if (error?.code === 'DEMO_LEASE_LOST') throw error
    return { ...build, receipt: { ...build.receipt, blockers } }
  }
}
