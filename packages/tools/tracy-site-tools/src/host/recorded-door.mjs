/**
 * A SHELL COMMAND THAT WRITES WHAT A RECORDED DOOR WRITES IS REFUSED, AND THE DOOR NAMED (ladder DL14/DL15
 * on dsl2jo, JA Essence j6, 14/10/2026).
 *
 * WHY. Asked to change "the home title" on a home with no h1, the agent renamed the site with
 * `php .webroot/cli/joomla.php config:set sitename="…"` — found by listing the CLI's commands after the
 * shell guard pointed it at `config:get`. The name changed on every page, and NOTHING RECORDED IT: no
 * Apply-door receipt, no `site_write` row, no step in the plugin's undo log. In the next conversation the
 * customer asked to undo exactly that change; it was not among the changes the agent could find, and the
 * agent undid two articles instead. The same value has a door that records it — `tracy_site`
 * `site.identity` on Joomla (Claude Cowork for Joomla 0.22.0), `content.update {kind:"option"}` on
 * WordPress — each with an apply_id that `apply.revert` undoes and that the site's recent changes list.
 *
 * 🔒 ONLY WHAT A DOOR RECORDS, NAMED ONE BY ONE. The site's name, description and page-title setting:
 * `site.identity`'s three Joomla options, and WordPress's site title and tagline. Every other
 * `config:set` / `wp option` stays the shell's (no door holds it, and refusing it would leave no road at
 * all). ADR 0022 keeps content-only a recommendation, not a lock: the shell is refused only where a
 * recorded door makes the very same write.
 *
 * THE SHELL IS BEST-EFFORT, as the comment fence's is (`comment-fence.mjs`): a command is split at `;`
 * `&&` `||` `|` and newlines, and a part is judged by its words. A program that writes the file by itself
 * (`php script.php`) is not seen here. Pure: no I/O.
 */

/** Tools whose text is a shell command, and the argument holding it (the comment fence's own list). */
const SHELL_TEXT = Object.freeze({ bash: 'command', pwsh: 'command', terminal_send: 'text' })

/** Joomla Global Configuration options `site.identity` writes (`lib/SiteIdentity.php` `FIELDS`). */
export const JOOMLA_IDENTITY_OPTIONS = Object.freeze(['sitename', 'MetaDesc', 'sitename_pagetitles'])

/** WordPress options that carry the site's name and tagline (`WP_SHOWN_OPTIONS`' first two). */
export const WORDPRESS_IDENTITY_OPTIONS = Object.freeze(['blogname', 'blogdescription'])

/** `config:set` of Joomla's own console, then one of its options as `<name>=`. */
const JOOMLA_SET = /\bconfig:set\b/
const JOOMLA_OPTION = new RegExp(`(?:^|[\\s"'])(${JOOMLA_IDENTITY_OPTIONS.join('|')})\\s*=`)
/** `wp option update|add|set <name>` — wp-cli's writes of one option. */
const WORDPRESS_SET = new RegExp(
  `\\bwp\\s+(?:[-\\w=]+\\s+)*option\\s+(?:update|add|set)\\s+["']?(${WORDPRESS_IDENTITY_OPTIONS.join('|')})\\b`
)

/**
 * The refusal for a shell call that writes a value a recorded door writes, or null to let it run.
 *
 * 🔒 NEVER A ROAD CLOSED WITH NO DOOR LEFT. A Joomla plugin older than 0.22.0 answers `site.identity` with
 * `bad_action`, which the call memory keeps for an hour (`learned(label).missing`): on such a site the
 * shell is the only road to the name, and it is let through.
 * @param {unknown} name - the tool's name (`bash`, `pwsh`, `terminal_send`; any other passes).
 * @param {unknown} args - its arguments.
 * @param {{ missing?: readonly string[] }} [site] - the actions this site's plugin was found to lack.
 * @returns {string | null}
 */
export function recordedDoorRefusal(name, args, site = {}) {
  const key =
    typeof name === 'string' && Object.hasOwn(SHELL_TEXT, name)
      ? /** @type {Record<string, string>} */ (SHELL_TEXT)[name]
      : null
  if (key === null || args === null || typeof args !== 'object') return null
  const command = /** @type {Record<string, unknown>} */ (args)[key]
  if (typeof command !== 'string' || command === '') return null
  const lacks = (/** @type {string} */ action) => Array.isArray(site.missing) && site.missing.includes(action)
  for (const part of command.split(/\n|;|&&|\|\||\|/)) {
    const set = JOOMLA_SET.exec(part)
    const joomla =
      set === null || lacks('site.identity')
        ? null
        : JOOMLA_OPTION.exec(part.slice(set.index + set[0].length))
    if (joomla !== null)
      return (
        `site-tools: this command changes the site's ${joomla[1]} in Joomla's configuration, where no receipt records it, so the customer could not ask you to undo it. ` +
        `Next: tracy_site site.identity {operation:"set", fields:{${joomla[1]}:"<the new value>"}} — recorded, and apply.revert undoes it; its answer is the receipt.`
      )
    const wordpress = lacks('content.update') ? null : WORDPRESS_SET.exec(part)
    if (wordpress !== null)
      return (
        `site-tools: this command changes the site's ${wordpress[1]} option, where no receipt records it, so the customer could not ask you to undo it. ` +
        `Next: tracy_site content.update {kind:"option", key:"${wordpress[1]}", fields:{value:"<the new value>"}} — recorded, and apply.revert undoes it; its answer is the receipt.`
      )
  }
  return null
}
