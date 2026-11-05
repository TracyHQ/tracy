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

const WP_AT = /\bwp\s+/g
const WP_FLAG = /-[\w-]+(?:=\S+)?\s+/y

/**
 * Where each `wp` command's own words start in `text`: after `wp` and any global flags (`--path=…`,
 * `--allow-root`). One pass: a pattern `\bwp\s+(?:-[\w-]+(?:=\S+)?\s+)*…` reread the whole run of flags
 * from every `wp` inside it (`wp -wp -wp …`), quadratic; a `wp` inside the flags reads the same flags to
 * the same place, so the scan resumes after them.
 * @param {string} text
 * @returns {number[]}
 */
export function wpCommandStarts(text) {
  /** @type {number[]} */
  const out = []
  WP_AT.lastIndex = 0
  for (let m = WP_AT.exec(text); m !== null; m = WP_AT.exec(text)) {
    let at = m.index + m[0].length
    for (;;) {
      WP_FLAG.lastIndex = at
      const flag = WP_FLAG.exec(text)
      if (flag === null) break
      at += flag[0].length
    }
    out.push(at)
    WP_AT.lastIndex = Math.max(WP_AT.lastIndex, at)
  }
  return out
}

/**
 * Whether `re` (global) has a match in `text` from `from` to the next `\n`, `;`, `&` or `|` — what a
 * pattern's `[^\n;&|]*<tail>` asks. `memo` holds the last stretch read: a later `from` inside it is
 * answered from it, so a line of many commands is read once, never once per command.
 * @param {string} text @param {number} from @param {RegExp} re
 * @param {{ from: number, stop: number, last: number }} memo
 */
function tailFrom(text, from, re, memo) {
  if (from < memo.from || from >= memo.stop) {
    STOP.lastIndex = from
    const stop = STOP.exec(text)?.index ?? text.length
    let last = -1
    for (const m of text.slice(from, stop).matchAll(re)) last = from + m.index
    Object.assign(memo, { from, stop, last })
  }
  return memo.last >= from
}
const STOP = /[\n;&|]/g

/**
 * @typedef {{ reason: 'deletes' | 'hides' | 'many' | 'database' | 'code' | 'site', sentence: string, door: string | null }} ShellRule
 *   `sentence`: what the customer reads (the agent words it in their language); `door`: the recorded road.
 */

/**
 * A rule reads a command where its `starts` say (after `wp` and its flags, by default): `next` (sticky)
 * right there, then `tail` (global) somewhere before the line ends — present, or absent when `without`.
 * @typedef {ShellRule & { starts?: RegExp, next: RegExp, tail?: RegExp, without?: boolean }} ShellReading
 */

/** @type {readonly ShellReading[]} */
const RULES = Object.freeze([
  {
    next: /(?:post|term|comment|user|menu|media|widget|sidebar)(?:\s+(?:item|meta))?\s+delete\b/y,
    reason: 'deletes',
    sentence: 'This deletes something from your site, with no undo.',
    door: 'tracy_site content.delete'
  },
  {
    next: /site\s+(?:empty|delete)\b/y,
    reason: 'deletes',
    sentence: "This empties your site's content, with no undo.",
    door: null
  },
  {
    next: /post\s+update\b/y,
    tail: /--post_status=["']?(?:draft|pending|private|trash)\b/g,
    reason: 'hides',
    sentence: "This takes something off your site's pages.",
    door: 'tracy_site content.update'
  },
  {
    next: /search-replace\b/y,
    tail: /--dry-run/g,
    without: true,
    reason: 'many',
    sentence: 'This changes words in many places on your site at once, with no undo.',
    door: 'tracy_site content.replace'
  },
  {
    next: /db\s+(?:reset|drop|import|clean)\b/y,
    reason: 'database',
    sentence: "This replaces or empties your site's database, with no undo.",
    door: 'tracy_site db.rollback'
  },
  {
    next: /(?:plugin|theme)\s+(?:install|activate|deactivate|delete|uninstall|update|toggle|enable|disable)\b/y,
    reason: 'code',
    sentence: 'This installs or switches something your site runs.',
    door: 'tracy_site plugin.install / plugin.activate / theme.activate'
  },
  {
    next: /core\s+(?:update|update-db|download)\b/y,
    reason: 'code',
    sentence: 'This upgrades the software your site runs on.',
    door: 'tracy_site core.upgrade'
  },
  {
    next: /option\s+(?:update|delete|add|set|patch)\b/y,
    reason: 'site',
    sentence: "This changes your site's settings on every page.",
    door: 'tracy_site content.update {kind:"option"}'
  },
  {
    starts: /\bjoomla\.php\b/g,
    next: /(?:)/y,
    tail: /\b(?:extension:(?:install|remove|discover:install)|core:update|database:import|user:delete|config:set|site:down)\b/g,
    reason: 'code',
    sentence: 'This changes how your site runs, with no undo.',
    door: null
  }
])

/**
 * Whether `rule` reads `text`, from one of `wpStarts` (or its own `starts`) — what its pattern
 * `\bwp\s+(?:flag\s+)*<next>[^\n;&|]*<tail>` (or `(?!…<tail>)`) answered, in linear time.
 * @param {ShellReading} rule @param {string} text @param {number[]} wpStarts
 */
function reads(rule, text, wpStarts) {
  const starts = rule.starts ? [...text.matchAll(rule.starts)].map((m) => m.index + m[0].length) : wpStarts
  const memo = { from: 0, stop: -1, last: -1 }
  for (const at of starts) {
    rule.next.lastIndex = at
    if (!rule.next.test(text)) continue
    if (!rule.tail || tailFrom(text, rule.next.lastIndex, rule.tail, memo) !== (rule.without === true))
      return true
  }
  return false
}

/** A database client on the line, or wp-cli's own query. */
const DB_CLIENT_NAME = /\b(?:mysql|mariadb|sqlite3|psql)\b/
const WP_DB_QUERY = /db\s+query\b/y
/** @param {string} text */
const dbClient = (text) =>
  DB_CLIENT_NAME.test(text) ||
  wpCommandStarts(text).some((at) => {
    WP_DB_QUERY.lastIndex = at
    return WP_DB_QUERY.test(text)
  })
/** SQL that writes: a statement word with the word after it that makes it a write. */
const SQL_WRITE =
  /\b(?:update\s+[`"\w.]+\s+set\b|delete\s+from\b|drop\s+(?:table|database|schema)\b|truncate\s+(?:table\s+)?[`"\w]|alter\s+table\b|insert\s+(?:ignore\s+)?into\b|replace\s+into\b)/i
const DB_CLIENTS = /\b(?:mysql|mariadb|sqlite3|psql)\b/g
const LINE_END_OR_FEED = /[\n;&|<]/g

/**
 * A file fed to a database client (`mysql db < dump.sql`): an import. Reads what
 * `/\b(?:mysql|mariadb|sqlite3|psql)\b[^\n;&|]*<\s*\S/` read, once over the text: the first `<` on the
 * client's line decides (anything after a later `<` is after it too), and a client whose line has none
 * leaves no chance to the clients before that line's end.
 * @param {string} text
 */
function sqlImport(text) {
  DB_CLIENTS.lastIndex = 0
  for (let m = DB_CLIENTS.exec(text); m !== null; m = DB_CLIENTS.exec(text)) {
    LINE_END_OR_FEED.lastIndex = m.index + m[0].length
    const end = LINE_END_OR_FEED.exec(text)
    if (end === null) return false
    if (end[0] === '<') return /\S/.test(text.slice(end.index + 1))
    DB_CLIENTS.lastIndex = Math.max(DB_CLIENTS.lastIndex, end.index)
  }
  return false
}

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
  if (dbClient(command) && (SQL_WRITE.test(command) || sqlImport(command)))
    return {
      reason: 'database',
      sentence: "This changes your site's database directly, with no undo.",
      door: null,
      command
    }
  for (const part of command.split(/\n|;|&&|\|\||\|/)) {
    const wpStarts = wpCommandStarts(part)
    for (const rule of RULES)
      if (reads(rule, part, wpStarts))
        return { reason: rule.reason, sentence: rule.sentence, door: rule.door, command }
  }
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
