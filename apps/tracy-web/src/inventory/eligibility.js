/**
 * Which quickstarts may be installed into inventory, decided from job evidence
 * (`tasks/todo-inventory-va-seed-theo-brief.md` §1, `demo_install_attestation` in
 * `026-site-inventory.sql`).
 *
 * 🔒 THE SITE ROW IS NOT EVIDENCE OF AN INSTALL. `upsertDemoSite` (`lib/demo-sites.js`) rewrites
 * `site.quickstart_version`/`_sha256` in place at the START of every attempt, so the row names the
 * release that was ASKED FOR last, not the one that installed. Measured on the local stand 22/09:
 * `business-emdash.tracy.test` and `saas-emdash.tracy.test` both carry version 1.0.0 on the row
 * with `provision` jobs in state `failed` and not one `done`. A reader that trusted the row would
 * have called both eligible and started installing stock from a release that has never once come
 * up. So eligibility is read off jobs that were SEEN to reach `done`, and the version is taken
 * from that job's own key.
 *
 * 🔒 DRIFT IS REPORTED, NEVER SWALLOWED. A demo that succeeded at 1.0.0 says nothing about 1.1.0
 * (§1: "an old demo does not make a new release eligible by itself"). Such a tag comes back `eligible: false`
 * with `drift: 'version'` and both numbers in the reason, rather than being dropped from the list
 * — a tag that silently vanishes reads as "we never had it", which is a different fact.
 */

/**
 * The version a demo provision job ran at, read off its own job key.
 *
 * Two shapes exist (`lib/demo-sites.js`): `demo:<label>:<version>:<attempt>` from a direct
 * install, and `demo:<label>:redeploy:<jobId>` from a redeploy — the second carries no version at
 * all, because the attempt is named after the teardown job that caused it. Only the first is
 * evidence of WHICH release ran; the second falls back to the row, marked as the weaker source.
 * @param {unknown} detail the job's `detail` column as `noteDemoJob` stored the host's answer
 * @returns {string | null}
 */
export function versionFromJobKey(detail) {
  const key = detail && typeof detail === 'object' ? /** @type {any} */ (detail).jobKey : null
  if (typeof key !== 'string') return null
  const m = /^demo:.+:(.+):\d+$/.exec(key)
  if (!m) return null
  // A redeploy whose job id happens to end in digits would otherwise hand back the word
  // `redeploy` as a version number.
  return m[1] === 'redeploy' ? null : m[1]
}

/**
 * Write down every demo provision that has been seen to finish, once each.
 *
 * Idempotent by (tag, version, job id): re-running it after another job settles records only the
 * new one. Called from the reconciler rather than from the settle path so a job that settled while
 * this feature was off is still picked up.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number }> }} pool
 * @returns {Promise<{ recorded: number }>}
 */
export async function recordDemoAttestations(pool) {
  const { rows } = await pool.query(
    `select j.id as job_id, j.detail, s.site_key, s.quickstart_tag,
            s.quickstart_version, s.quickstart_sha256
       from job j
       join site s on s.site_key = j.site_key
      where j.kind = 'provision' and j.state = 'done'
        and s.demo and s.quickstart_tag is not null`
  )
  let recorded = 0
  for (const row of rows) {
    const fromKey = versionFromJobKey(row.detail)
    const version = fromKey ?? row.quickstart_version
    // No version anywhere is no attestation. A row that cannot say WHICH release came up is not
    // weaker evidence, it is none — and §1 refuses to let a bare "it installed once" stand in.
    if (typeof version !== 'string' || version === '') continue
    const result = await pool.query(
      `insert into demo_install_attestation
         (quickstart_tag, quickstart_version, site_key, job_id, version_source, sha256)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (quickstart_tag, quickstart_version, job_id) do nothing`,
      [
        row.quickstart_tag,
        version,
        row.site_key,
        row.job_id,
        fromKey ? 'job-key' : 'site-row',
        row.quickstart_sha256
      ]
    )
    recorded += result.rowCount ?? 0
  }
  return { recorded }
}

/**
 * Every quickstart a demo has been attempted on, with a verdict on installing stock from it.
 *
 * The candidate list is the union of the tags that have an attestation and the tags a demo site
 * row names — so a tag whose every install failed is still listed, saying so, instead of being
 * invisible.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {{ resolveInstall: (pool: any, tag: string) => Promise<any> }} deps `resolveInstall` from
 *   `lib/quickstart-releases.js`, injected so this module stays testable without a release table.
 * @returns {Promise<{ tag: string, platform: string | null, attestedVersion: string | null,
 *   currentVersion: string | null, eligible: boolean, drift: null | 'version', sha256: string | null,
 *   siteKey: string | null, jobId: string | null, versionSource: string | null,
 *   reason: string | null }[]>}
 */
export async function eligibleQuickstarts(pool, { resolveInstall }) {
  // The newest attestation per tag: that is the release a demo most recently PROVED, and the only
  // one a comparison against the current release has anything to say about.
  const { rows: attested } = await pool.query(
    `select distinct on (quickstart_tag)
            quickstart_tag, quickstart_version, site_key, job_id, version_source, sha256
       from demo_install_attestation
      order by quickstart_tag, attested_at desc, job_id desc`
  )
  const byTag = new Map(attested.map((r) => [r.quickstart_tag, r]))
  const { rows: demoTags } = await pool.query(
    'select distinct quickstart_tag, platform from site where demo and quickstart_tag is not null'
  )
  const platformOfDemo = new Map(demoTags.map((r) => [r.quickstart_tag, r.platform ?? null]))
  const tags = [...new Set([...byTag.keys(), ...platformOfDemo.keys()])].sort()

  const out = []
  for (const tag of tags) {
    const a = byTag.get(tag) ?? null
    const install = await resolveInstall(pool, tag)
    const currentVersion = typeof install?.version === 'string' ? install.version : null
    const base = {
      tag,
      platform: install?.platform ?? platformOfDemo.get(tag) ?? null,
      attestedVersion: a?.quickstart_version ?? null,
      currentVersion,
      sha256: a?.sha256 ?? null,
      siteKey: a?.site_key ?? null,
      jobId: a?.job_id ?? null,
      versionSource: a?.version_source ?? null
    }
    if (!a) {
      out.push({ ...base, eligible: false, drift: null, reason: 'no successful demo install recorded' })
      continue
    }
    if (!currentVersion) {
      // The release is gone, or carries no setting to install from. Not drift — there is no second
      // number to compare against — and never eligible: there is nothing to install.
      out.push({ ...base, eligible: false, drift: null, reason: 'release no longer resolvable' })
      continue
    }
    if (a.quickstart_version !== currentVersion) {
      out.push({
        ...base,
        eligible: false,
        drift: 'version',
        reason: `demo attested ${a.quickstart_version}, release is now ${currentVersion}`
      })
      continue
    }
    out.push({ ...base, eligible: true, drift: null, reason: null })
  }
  return out
}
