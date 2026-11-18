// What a shipped state must not carry: anything a site gains after its seed. tools/release.mjs runs this on the scrubbed
// copy of the state and stops the release on any problem; the state must equal a fresh seed of the template.
//
// Found on JA Diner 0.1.2 (independent review, 16/11/2026), when the state was copied from the site the gates had run
// on: the forms check left 2 submissions, the mail check left 4 delivery log rows and the builder's SMTP host
// (127.0.0.1:1025, no auth) as the site's mail settings, so the admin's magic-link sign-in failed on a restored site;
// the recovery and editability checks left 3 revisions and two posts at a version their seed receipt does not know,
// so bootstrap-site.sh kept those posts as editor-changed and skipped later seed updates to them.

/** `_plugin_storage` collections a fresh seed writes (the audit log is scrubbed before this runs). */
export const SEEDED_PLUGIN_STORAGE = ['emdash-forms/forms']

/**
 * One statement on a better-sqlite3 database, answered as the sqlite3 CLI's list mode answers it: one row per
 * line, columns joined by `|`, NULL as an empty column, and nothing for a statement that returns no rows.
 * tools/release.mjs reads and scrubs the state through it, so a release needs no sqlite3 CLI (G5).
 * @param {import('better-sqlite3').Database} db
 * @returns {(q: string) => string}
 */
export function sqlText(db) {
  return (q) => {
    const statement = db.prepare(q)
    if (!statement.reader) {
      statement.run()
      return ''
    }
    return statement
      .raw()
      .all()
      .map((row) => row.map((v) => (v === null ? '' : String(v))).join('|'))
      .join('\n')
  }
}

/**
 * @param {(q: string) => string} sql runs one statement on the state's data.db and returns its rows as text,
 *   one row per line and columns joined by `|` (the sqlite3 CLI's list mode)
 * @param {{ entries?: Record<string, { id: string, rev: string }> }} receipts the state's data/seed-receipts.json
 * @returns {string[]} one line per leftover; empty when the state is a fresh seed
 */
export function stateResidue(sql, receipts) {
  const rows = (q) => sql(q).split('\n').filter(Boolean)
  const problems = []
  for (const row of rows(
    "select plugin_id || '/' || collection, count(*) from _plugin_storage group by plugin_id, collection order by 1"
  )) {
    const [name, n] = row.split('|')
    if (!SEEDED_PLUGIN_STORAGE.includes(name))
      problems.push(`_plugin_storage ${name}: ${n} row(s) a seed does not write`)
  }
  // mail is set up in the admin of each site (docs/install.md), never shipped
  for (const name of rows("select name from options where name like 'plugin:emdash-smtp:%' order by name"))
    problems.push(`option ${name}: mail settings of the build machine`)
  // an entry whose live version is not the one its seed receipt wrote reads as editor-changed after a restore
  for (const [key, receipt] of Object.entries(receipts.entries ?? {})) {
    const collection = key.split('/')[0]
    if (!/^[a-z0-9_]+$/.test(collection) || !/^[A-Za-z0-9]+$/.test(String(receipt.id))) {
      problems.push(`${key}: receipt names no entry this check can read`)
      continue
    }
    const [version, updatedAt] = Buffer.from(String(receipt.rev), 'base64').toString('utf8').split(/:(.*)/s)
    const live = rows(
      `select version || '|' || updated_at from ec_${collection} where id = '${receipt.id}'`
    )[0]
    if (!live) problems.push(`${key}: the receipted entry is gone`)
    else if (live !== `${version}|${updatedAt}`)
      problems.push(
        `${key}: live version ${live.split('|')[0]}, the seed wrote ${version} (an edit after the seed)`
      )
    else {
      // `created_at` has one-second resolution and the seed stamps its own revision in the second of the
      // write or before it: a revision in a later second is not the seed's (G5b); one in that very second
      // is not told apart by its time.
      const later = Number(
        sql(
          `select count(*) from revisions where collection = '${collection}' and entry_id = '${receipt.id}' and cast(strftime('%s', created_at) as integer) > cast(strftime('%s', '${updatedAt}') as integer)`
        )
      )
      if (later > 0) problems.push(`${key}: ${later} revision(s) written after the seed`)
    }
  }
  return problems
}
