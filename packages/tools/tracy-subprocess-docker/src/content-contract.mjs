import { statSync } from 'node:fs'
import { join } from 'node:path'
import { siteOf } from './route.mjs'

/**
 * Whether a site was built from a quickstart that carries a content contract: the host-owned marker
 * `<sitesRoot>/.content-contracts/<label>.json`, outside every site's agent-accessible root.
 *
 * 🔒 A CONTRACT RECOMMENDS, IT DOES NOT LOCK (Lee, 26/09/2026). Until then this marker switched off
 * the shell, the terminal, every file tool outside `docs/agents` and every tool not on a short list —
 * so an agent asked to change a site's primary colour answered "impossible". The contract's slots
 * are guidance for keeping the quickstart's design (lengths, places), not a fence. The one thing a
 * quickstart site refuses is `directDbWriteReason` below.
 * @param {string | undefined} cwd
 * @param {string} sitesRoot
 */
export function hasContentContract(cwd, sitesRoot) {
  if (typeof cwd !== 'string' || !cwd.startsWith(sitesRoot + '/')) return false
  const { label } = siteOf(cwd, sitesRoot)
  try {
    statSync(join(sitesRoot, '.content-contracts', `${label}.json`))
    return true
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return false
    throw new Error('Cannot read the content contract marker')
  }
}

/**
 * The recommendation a quickstart's contract makes, in the one sentence every text quotes (the site
 * context's rows, the refusal next steps): how to change the site without breaking its design.
 * 0.75× to 1.25× is Lee's band (26/09/2026) — a warning, never a refusal.
 */
export const QUICKSTART_DESIGN_RULE =
  "Keep the quickstart's design: reuse its own sections and styles, and keep new text close to the length of the text it replaces (0.75× to 1.25×)."

/** SQL that changes data or schema. Reads (`SELECT`, `SHOW`, `DESCRIBE`) are not in it. */
const SQL_WRITE =
  /\b(insert\s+into|update\s+\S+\s+set|delete\s+from|replace\s+into|truncate|drop\s+(table|database|index|view)|alter\s+table|create\s+(table|database|index|view)|rename\s+table)\b/i
/** A command-line SQL client. `mysqldump` and `mysqlshow` are not one: `\b` stops at the letter after. */
const SQL_CLIENT = /(^|[\s|;&(`])(mysql|mariadb|psql|sqlite3)(?![\w.-])/
/** wp-cli subcommands that replace or wipe the database wholesale. */
const WP_DB_WHOLESALE = /\bwp\s+db\s+(import|reset|clean|drop|create)\b/
/** wp-cli's own SQL road. */
const WP_DB_QUERY = /\bwp\s+db\s+query\b/
/** PHP reaching the database under the CMS: a raw connection, or the CMS's own raw-query handle. */
const PHP_RAW_DB =
  /(new\s+(PDO|mysqli)\b|mysqli_query|\$wpdb\s*->\s*(query|insert|update|delete|replace)\b|->\s*exec\s*\()/i

// One literal on purpose: the /ops page quotes it (`scripts/ops-cms/extract.mjs`).
const REASON =
  "This quickstart site does not take writes to its database directly (SQL, a dump import, a raw query from PHP): they skip the CMS, which is what keeps the site consistent and undoable. Make the same change through the CMS instead — tracy_site, `wp` commands such as `wp option update` / `wp post update`, or Joomla's `php cli/joomla.php` — and reading the database stays open."

/**
 * The refusal a shell command earns on a quickstart site for writing its database directly, or null.
 * A text match, so a determined script can still get past it; it is a rail plus the reason, and the
 * site context says the same rule in words.
 * @param {string} command - the command text the model wrote.
 * @returns {string | null}
 */
export function directDbWriteReason(command) {
  if (WP_DB_WHOLESALE.test(command)) return REASON
  const client = SQL_CLIENT.test(command) || WP_DB_QUERY.test(command)
  // A client fed from a file or a pipe runs SQL this text cannot see: refuse rather than guess.
  if (
    client &&
    (SQL_WRITE.test(command) ||
      /(^|[^<])<(?!<)\s*\S/.test(command) ||
      /\|\s*(mysql|mariadb|psql|sqlite3)\b/.test(command))
  )
    return REASON
  if (/\b(php\s+-r|wp\s+eval(-file)?)\b/.test(command) && PHP_RAW_DB.test(command) && SQL_WRITE.test(command))
    return REASON
  return null
}
