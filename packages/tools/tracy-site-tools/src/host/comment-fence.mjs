/**
 * THE COMMENT FENCE (plan "comment thread" C1, 29/09/2026): in a comment turn, a file write aimed at
 * the site's served files is refused by machine, not only asked against in the hint.
 *
 * WHY. V2-H1 (stand E2E round 2, `tasks/evidence/comment-multi-pin/stand-e2e.md`): asked to make an
 * image's alt print, the agent answered a comment with `edit` on
 * `.webroot/templates/tracy_business/acm/tb-projects/tmpl/style-1.php` and reported ✓ — a write outside
 * the Apply door's receipts, so the person's revert could not undo it. `COMMENT_WRITES_ONLY` already
 * said "never edit theme, template, plugin or PHP/JS/CSS files on the site for a comment"; the agent
 * read it and edited anyway.
 *
 * 🔒 ONLY A COMMENT TURN. ADR 0022: content-only is guidance, never a lock — an ordinary chat may edit
 * the site's files as its seat allows. A comment turn is the one place the product promised the
 * person an undoable answer, so it is the one place a write that cannot be undone is refused. The
 * turn is recognised by the SAME reading as the many-comments rule (`prompter.mjs`
 * `commentBlockCount`): the person's latest message carries ≥ 1 `tracy-element` / `tracy-page` block.
 *
 * WHAT IS STILL ALLOWED, because the comment hint itself allows it (`COMMENT_WRITES_ONLY`, 29/09 pm):
 * - reads, always (`read`, `grep`, `glob`, `str_replace_editor view`, a shell that writes nothing);
 * - a LOOK change — a stylesheet (`.css` `.scss` `.less`) or a block theme's `theme.json`, the files
 *   `page.look` names as a rule's or a token's home: the person asked the agent to make it itself;
 * - the file a `write:` line of the comment block names — Tracy's own resolved target (a Joomla
 *   override line, a template's file and line, EmDash template source through the shell);
 * - anything outside the served tree (a scratch note in the site folder).
 *
 * WHAT COUNTS AS THE SITE'S FILES: `<site>/.webroot/` (WordPress, Joomla, EmDash's data), `<site>/template/`
 * (a fleet EmDash site's template copy) and `/app/` (EmDash's template source inside the site's
 * container, where a shell command lands). A WordPress or Joomla web container mounts the webroot a
 * second time at the image's own document root, `/var/www/html` (`render-compose.sh`), so a path
 * there is read as the same file under `<site>/.webroot/` (survey 08/10/2026: `sed -i` on
 * `/var/www/html/…` was not seen as the site's file).
 *
 * THE SHELL IS BEST-EFFORT. A command is split at `;` `&&` `||` `|` and newlines, and a part is a write
 * when it redirects (`>` `>>`), `tee`s, edits in place (`sed -i`, `perl -i`), or moves, copies,
 * removes or touches files (`mv` `cp` `rm` `ln` `touch` `truncate` `install` `chmod` `chown` `mkdir`
 * `rsync` `unlink` `dd of=` `patch`). A program that writes by itself (`php script.php`, `wp …`,
 * `python -c`) is not seen here.
 */
import path from 'node:path'

import { commentBlockCount, messageTextOf } from './prompter.mjs'

/** The refusal, word for word (plan C1). The reason adds the tool, the path and the next step. */
export const COMMENT_FENCE_REFUSAL =
  'A comment is answered only through tracy_site / tracy_emdash content writes; site files are not edited for a comment. If the page prints no slot for what was asked, say so with ✗.'

/**
 * What to do instead — the refusal names its next step (the `refusal-next` idea: a bare "no" sends the
 * agent looking for another way in, V2-H1 took 13 extra calls).
 */
export const COMMENT_FENCE_NEXT =
  'Next: change its words with `tracy_site` `content.replace` (or `content.locate`, then the write its level names, or the call a `write:` line gives); a look change goes in a stylesheet `page.look` names; anything else, answer that comment ✗ with the reason and go on.'

/**
 * The comment turn a session is in, read from its own log: the latest message a PERSON typed (a
 * `user` source — plugin and tool messages are the machine talking) — or null when that message
 * carries no comment block.
 * @param {readonly unknown[] | undefined} events - the session's events, oldest first.
 * @returns {{ writes: string[] } | null} the files the blocks' `write:` lines name.
 */
export function commentTurnOf(events) {
  if (!Array.isArray(events)) return null
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = /** @type {{ type?: string, data?: { source?: { kind?: string }, content?: unknown } }} */ (
      events[i]
    )
    if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') continue
    const content = event.data?.content
    if (commentBlockCount(content) < 1) return null
    return { writes: writeTargets(messageTextOf(content)) }
  }
  return null
}

/**
 * The files `write:` lines name (`tracy-chat-input` `comment-turn.mjs` `writeOf`): `edit <file> …`,
 * `<file> line N: …`, `<file>: add the line …`, `in the site's shell (…), edit <file> …`. A call line
 * (`content.replace {…}`, `content.contract {…}`) and `none — …` name no file.
 * @param {string} text
 * @returns {string[]}
 */
function writeTargets(text) {
  /** @type {string[]} */
  const out = []
  // Lines are split on `\n` alone, as the chat input that indents a person's own `write:` lines
  // splits them (`wordLines`): a regex `m` flag would also start a line after `\r`, U+2028 or U+2029,
  // so a person's "…<U+2028>write: edit index.php" would pass the input as one line and reach here as
  // Tracy's target (survey 08/10/2026). `.` matches none of those characters either.
  for (const raw of text.split('\n')) {
    const line = /^write: (.+)$/.exec(raw)?.[1]
    if (line === undefined) continue
    const rest = line
      .replace(/^in the site's shell \([^)]*\),\s*/, '')
      .replace(/^edit\s+/, '')
      .trim()
    const file = (rest.split(/\s/)[0] ?? '').replace(/[:,]$/, '')
    if (file === '' || file === 'none' || file.startsWith('content.')) continue
    if (!file.includes('/') && !file.includes('.')) continue
    out.push(file)
  }
  return out
}

/** Tools that write the file their path argument names. */
const FILE_WRITES = Object.freeze({ write: 'file_path', edit: 'file_path', str_replace_editor: 'path' })

/** Tools whose text is a shell command, and the argument holding it and its working directory. */
const SHELLS = Object.freeze({
  bash: { text: 'command', dir: 'workdir' },
  pwsh: { text: 'command', dir: 'workdir' },
  terminal_send: { text: 'text', dir: null }
})

/** Every tool the fence judges; any other call passes without the session's log being read. */
export const COMMENT_FENCED_TOOLS = new Set([...Object.keys(FILE_WRITES), ...Object.keys(SHELLS)])

/**
 * The fence's judgement for one tool call: the reason to refuse it, or null to let it through.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string,
 *   turn: { writes: string[] } | null }} call - `cwd` resolves a relative path; `siteRoot` is the
 *   session's site folder; `turn` is {@link commentTurnOf}'s answer.
 * @returns {string | null}
 */
export function commentFenceDecision({ name, args, cwd, siteRoot, turn }) {
  if (turn === null) return null
  const targets = callWriteTargets({ name, args, cwd, siteRoot })
  if (targets === null) return null
  const fenced = targets.find((target) => served(target, siteRoot) && !excepted(target, siteRoot, turn))
  if (fenced === undefined) return null
  const shown = fenced.startsWith(`${siteRoot}/`) ? fenced.slice(siteRoot.length + 1) : fenced
  return `site-tools: ${name} ${JSON.stringify(shown)} refused in a comment turn. ${COMMENT_FENCE_REFUSAL} ${COMMENT_FENCE_NEXT}`
}

/**
 * The absolute paths one tool call writes, as the fence reads them — or null for a call the fence
 * does not judge (a read, a tool that writes no file). The one reading, shared with the look undo
 * (`look-undo.mjs`), so the files kept before a write are exactly the ones the fence let through.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string }} call
 * @returns {string[] | null}
 */
export function callWriteTargets({ name, args, cwd, siteRoot }) {
  const a = /** @type {Record<string, unknown>} */ (args !== null && typeof args === 'object' ? args : {})
  if (name in FILE_WRITES) {
    if (name === 'str_replace_editor' && a.command === 'view') return null
    const value = a[FILE_WRITES[/** @type {keyof typeof FILE_WRITES} */ (name)]]
    return typeof value === 'string' && value.trim() !== ''
      ? [hostPath(path.resolve(cwd, value), siteRoot)]
      : []
  }
  if (name in SHELLS) {
    const shell = SHELLS[/** @type {keyof typeof SHELLS} */ (name)]
    const text = a[shell.text]
    const dir =
      shell.dir !== null && typeof a[shell.dir] === 'string' ? path.resolve(cwd, String(a[shell.dir])) : cwd
    return typeof text === 'string'
      ? shellWriteTargets(text, dir, siteRoot).map((target) => hostPath(target, siteRoot))
      : []
  }
  return null
}

/** The web container's second mount of the webroot (`render-compose.sh`: `<webroot>:/var/www/html`). */
const CONTAINER_WEBROOT = '/var/www/html'

/**
 * The site-folder path of a file named through the container's own document root; any other path
 * unchanged.
 * @param {string} target - absolute.
 * @param {string} siteRoot
 */
function hostPath(target, siteRoot) {
  if (target !== CONTAINER_WEBROOT && !target.startsWith(`${CONTAINER_WEBROOT}/`)) return target
  return path.join(siteRoot, '.webroot', target.slice(CONTAINER_WEBROOT.length))
}

/**
 * Is this path one of the site's served files?
 * @param {string} target - absolute.
 * @param {string} siteRoot
 */
export function served(target, siteRoot) {
  if (target === '/app' || target.startsWith('/app/')) return true
  const rel = path.relative(siteRoot, target)
  return (
    rel === '.webroot' || rel.startsWith('.webroot/') || rel === 'template' || rel.startsWith('template/')
  )
}

/** A look change's file: a stylesheet, or a block theme's tokens. */
const LOOK_FILE = /\.(css|scss|less)$/i

/**
 * Is this a look change's file — a stylesheet or a block theme's `theme.json`?
 * @param {string} target
 */
export function isLookFile(target) {
  return LOOK_FILE.test(target) || path.basename(target) === 'theme.json'
}

/**
 * A served file the comment hint lets the agent write anyway: exactly the file a `write:` line names,
 * a relative name read under the webroot or the template copy, never a tail that any file of that
 * name elsewhere in the site ends with (survey 08/10/2026: `index.php` allowed every `index.php`,
 * `tmpl/default.php` every component's).
 * @param {string} target
 * @param {string} siteRoot
 * @param {{ writes: string[] }} turn
 */
function excepted(target, siteRoot, turn) {
  if (isLookFile(target)) return true
  return turn.writes.some((file) => {
    if (path.isAbsolute(file)) return target === hostPath(path.normalize(file), siteRoot)
    const named = path.normalize(file)
    if (named.startsWith('..')) return false
    return (
      target === path.resolve(siteRoot, '.webroot', named) ||
      target === path.resolve(siteRoot, 'template', named)
    )
  })
}

/** Commands whose every path argument is written (moved, removed, created, re-permissioned). */
const WRITES_EVERY_ARG = new Set([
  'mv',
  'rm',
  'rmdir',
  'ln',
  'touch',
  'truncate',
  'chmod',
  'chown',
  'mkdir',
  'unlink',
  'patch'
])
/** Commands that write only their LAST path argument — the rest are read. */
const WRITES_LAST_ARG = new Set(['cp', 'install', 'rsync'])
/** Editors that write in place when given `-i` (`sed -i`, `perl -pi`). */
const IN_PLACE = new Set(['sed', 'perl', 'ruby'])

/**
 * Best-effort: the absolute paths a shell command writes (see the file header for what is seen).
 * @param {string} command
 * @param {string} dir - where it starts (its `workdir`, else the session cwd).
 * @param {string} siteRoot - where a bare `cd` goes.
 * @returns {string[]}
 */
export function shellWriteTargets(command, dir, siteRoot) {
  /** @type {string[]} */
  const out = []
  let here = dir
  const at = (/** @type {string} */ word) => {
    const bare = word.replace(/^['"]|['"]$/g, '')
    if (bare === '' || bare.startsWith('$') || bare.startsWith('~') || bare.startsWith('/dev/')) return
    out.push(path.resolve(here, bare))
  }
  for (const part of command.split(/\n|;|&&|\|\||\|/)) {
    for (const [, target] of part.matchAll(/(?:^|[^0-9<>&])(?:\d|&)?>>?\s*([^\s;|&<>]+)/g))
      if (!target.startsWith('&')) at(target)
    const words = part.trim().split(/\s+/).filter(Boolean)
    let i = 0
    while (i < words.length && (words[i] === 'sudo' || words[i] === 'env' || /^[A-Za-z_]\w*=/.test(words[i])))
      i += 1
    const cmd = path.basename(words[i] ?? '')
    const rest = words.slice(i + 1).filter((w) => !/^\d?>>?/.test(w))
    const args = rest.filter((w) => !w.startsWith('-'))
    if (cmd === 'cd') {
      here = args[0] === undefined ? siteRoot : path.resolve(here, args[0].replace(/^['"]|['"]$/g, ''))
      continue
    }
    if (cmd === 'tee') args.forEach(at)
    else if (WRITES_EVERY_ARG.has(cmd)) args.forEach(at)
    else if (WRITES_LAST_ARG.has(cmd) && args.length > 0) at(/** @type {string} */ (args.at(-1)))
    else if (cmd === 'dd') {
      for (const w of rest) if (w.startsWith('of=')) at(w.slice(3))
    } else if (IN_PLACE.has(cmd) && rest.some((w) => /^-[a-zA-Z]*i/.test(w) || w.startsWith('--in-place')))
      args.forEach(at)
  }
  return out
}
