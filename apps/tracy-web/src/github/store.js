/**
 * The narrow slice of `site` (and `merge_ledger`) this domain reads and writes for itself — never
 * `sites/store.js`'s functions, which would cross the module-graph boundary (test/module-graph.test.mjs:
 * a domain imports only `lib/`, `db/`, and its own directory). `site.repo`/`site.repo_creator` are
 * physically columns of the site book, but the write belongs to whichever feature decides their
 * value, the same way `seats/route.js` queries `site` directly for `siteMetaFor` rather than
 * importing `sites/store.js`.
 */

/** The repo already on record for a site, or null — the idempotency check `createRepoFor` runs
 * before ever calling GitHub, so a retried job-poll never asks GitHub to create the same repo
 * twice. */
export async function repoFor(pool, siteKey) {
  const { rows } = await pool.query('select repo from site where site_key = $1', [siteKey])
  return rows[0]?.repo ?? null
}

/** The three columns the fleet token door weighs for one site — its repo, the host it lives on and
 * its label — or null when no such site exists. One read, so the door judges ownership and the repo
 * against the same row. */
export async function siteRepoOwner(pool, siteKey) {
  const { rows } = await pool.query('select repo, host, label from site where site_key = $1', [siteKey])
  return rows[0] ?? null
}

/** Record the repo a site's code now lives in. INSERT never happens here — the row already
 * exists by the time a site has a repo to record. */
export async function writeRepo(pool, siteKey, { repo, repoCreator = null }) {
  await pool.query('update site set repo = $2, repo_creator = $3 where site_key = $1', [
    siteKey,
    repo,
    repoCreator
  ])
}

/** The reverse of `repoFor` — which site a repo's full name belongs to, or null. The push police
 * door (`route.js`) only ever learns a repo's name from the webhook payload, never a site key. */
export async function siteKeyOfRepo(pool, repo) {
  const { rows } = await pool.query('select site_key from site where repo = $1', [repo])
  return rows[0]?.site_key ?? null
}

/** Whether `sha` reached `main` through a door this app already sanctioned — the ledger the push
 * police checks before ever alerting on anything (ADR 0068). Nothing in this task writes a row
 * here yet: no merge/approve door has been ported in this plan, so the ledger starts empty and a
 * test seeds it directly to exercise the sanctioned branch. */
export async function mergeSanctioned(pool, siteKey, sha) {
  const { rows } = await pool.query('select 1 from merge_ledger where site_key = $1 and sha = $2', [
    siteKey,
    sha
  ])
  return rows.length > 0
}
