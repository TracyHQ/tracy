/**
 * A SHELL COMMAND WITH A CONSEQUENCE ASKS THE CUSTOMER FIRST, AS THE DOORS DO (ADR 0034, council
 * 19/10/2026, B4).
 *
 * WHY. `tracy_site` and `tracy_emdash` ask before a delete, a hidden page, a change every page shows, a
 * rewrite of many places (`tiers.mjs`, `consequence.mjs`). A mode with a shell (ADR 0022) reaches the
 * same site by `wp post delete`, `wp search-replace` or an `UPDATE` typed into `mysql`, with no question
 * and no undo: the rule would hold on the door and leak beside it.
 *
 * 🔒 ASKED, NOT LOCKED. ADR 0022 keeps the shell a road (`recorded-door.mjs`: never a road closed with no
 * door left), so a command found here is refused with the door's own kind of question — a `confirm-` card
 * the agent shows — and the very same command runs once after the customer's yes (`call-memory.mjs`
 * `confirmed`). The refusal names the door that records the change, where one exists, as the better road.
 *
 * 🔒 BEST EFFORT, AND SAID SO. Commands are read by their words, as the comment fence and the recorded
 * door read them: a script that writes by itself (`php fix.php`, `node x.js`), a client spelled another
 * way or SQL built in a variable is not seen. This narrows the gap; it does not close it (the ADR's open
 * gap: a shell that cannot write, or a sandbox, closes it). Pure: no I/O.
 */

/** Tools whose text is a shell command, and the argument holding it (`recorded-door.mjs`' own list). */
const SHELL_TEXT = Object.freeze({ bash: 'command', pwsh: 'command', terminal_send: 'text' })

/** `wp`, then any global flags (`--path=…`, `--allow-root`) before the command. */
const WP = String.raw`\bwp\s+(?:--?[\w-]+(?:=\S+)?\s+)*`

/**
 * @typedef {{ reason: 'deletes' | 'hides' | 'many' | 'database' | 'code' | 'site', sentence: string, door: string | null }} ShellRule
 *   `sentence`: what the customer reads (the agent words it in their language); `door`: the recorded road.
 */

/** @type {readonly (ShellRule & { re: RegExp })[]} */
const RULES = Object.freeze([
  {
    re: new RegExp(
      `${WP}(?:post|term|comment|user|menu|media|widget|sidebar)(?:\\s+(?:item|meta))?\\s+delete\\b`
    ),
    reason: 'deletes',
    sentence: 'This deletes something from your site, with no undo.',
    door: 'tracy_site content.delete'
  },
  {
    re: new RegExp(`${WP}site\\s+(?:empty|delete)\\b`),
    reason: 'deletes',
    sentence: "This empties your site's content, with no undo.",
    door: null
  },
  {
    re: new RegExp(`${WP}post\\s+update\\b[^\\n;&|]*--post_status=["']?(?:draft|pending|private|trash)\\b`),
    reason: 'hides',
    sentence: "This takes something off your site's pages.",
    door: 'tracy_site content.update'
  },
  {
    re: new RegExp(`${WP}search-replace\\b(?![^\\n;&|]*--dry-run)`),
    reason: 'many',
    sentence: 'This changes words in many places on your site at once, with no undo.',
    door: 'tracy_site content.replace'
  },
  {
    re: new RegExp(`${WP}db\\s+(?:reset|drop|import|clean)\\b`),
    reason: 'database',
    sentence: "This replaces or empties your site's database, with no undo.",
    door: 'tracy_site db.rollback'
  },
  {
    re: new RegExp(
      `${WP}(?:plugin|theme)\\s+(?:install|activate|deactivate|delete|uninstall|update|toggle|enable|disable)\\b`
    ),
    reason: 'code',
    sentence: 'This installs or switches something your site runs.',
    door: 'tracy_site plugin.install / plugin.activate / theme.activate'
  },
  {
    re: new RegExp(`${WP}core\\s+(?:update|update-db|download)\\b`),
    reason: 'code',
    sentence: 'This upgrades the software your site runs on.',
    door: 'tracy_site core.upgrade'
  },
  {
    re: new RegExp(`${WP}option\\s+(?:update|delete|add|set|patch)\\b`),
    reason: 'site',
    sentence: "This changes your site's settings on every page.",
    door: 'tracy_site content.update {kind:"option"}'
  },
  {
    re: /\bjoomla\.php\b[^\n;&|]*\b(?:extension:(?:install|remove|discover:install)|core:update|database:import|user:delete|config:set|site:down)\b/,
    reason: 'code',
    sentence: 'This changes how your site runs, with no undo.',
    door: null
  }
])

/** A database client on the line, or wp-cli's own query. */
const DB_CLIENT = new RegExp(String.raw`\b(?:mysql|mariadb|sqlite3|psql)\b|${WP}db\s+query\b`)
/** SQL that writes: a statement word with the word after it that makes it a write. */
const SQL_WRITE =
  /\b(?:update\s+[`"\w.]+\s+set\b|delete\s+from\b|drop\s+(?:table|database|schema)\b|truncate\s+(?:table\s+)?[`"\w]|alter\s+table\b|insert\s+(?:ignore\s+)?into\b|replace\s+into\b)/i
/** A file fed to a database client (`mysql db < dump.sql`): an import. */
const SQL_IMPORT = /\b(?:mysql|mariadb|sqlite3|psql)\b[^\n;&|]*<\s*\S/

/**
 * What a shell call does that the customer confirms first, or null to let it run as it is.
 * @param {unknown} name - the tool's name (`bash`, `pwsh`, `terminal_send`; any other is not a shell).
 * @param {unknown} args - its arguments.
 * @returns {(ShellRule & { command: string }) | null} `command`: the text as sent, trimmed — the key the
 *   customer's yes opens, once.
 */
export function shellConsequence(name, args) {
  const key =
    typeof name === 'string' && Object.hasOwn(SHELL_TEXT, name)
      ? /** @type {Record<string, string>} */ (SHELL_TEXT)[name]
      : null
  if (key === null || args === null || typeof args !== 'object') return null
  const raw = /** @type {Record<string, unknown>} */ (args)[key]
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const command = raw.trim()
  // SQL is read over the whole command: a statement may be split by its own `;` inside the quotes.
  if (DB_CLIENT.test(command) && (SQL_WRITE.test(command) || SQL_IMPORT.test(command)))
    return {
      reason: 'database',
      sentence: "This changes your site's database directly, with no undo.",
      door: null,
      command
    }
  for (const part of command.split(/\n|;|&&|\|\||\|/))
    for (const { re, ...rule } of RULES) if (re.test(part)) return { ...rule, command }
  return null
}

/**
 * The refusal the agent reads: what the command does, the better door, and the card to show.
 * @param {ShellRule} found
 * @param {{ questions: unknown[] }} ask - `confirmQuestion` for this command's key
 */
export function shellRefusal(found, ask) {
  const door =
    found.door === null ? '' : ` Better: ${found.door} — it records the change, so it can be undone.`
  return (
    `site-tools: this command ${found.reason === 'deletes' ? 'deletes' : 'changes'} the site with no question to the customer (reason: ${found.reason}); nothing ran.${door} ` +
    `If only this command will do: ask_user_question ${JSON.stringify(ask)} — the id as given, the words in the customer's language — then send the very same command again after their yes.`
  )
}
