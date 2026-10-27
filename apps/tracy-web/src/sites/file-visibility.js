/**
 * Which webroot files a seat may read the bytes of, through the diff door
 * (`GET /api/sites/:key/file-diff`) — plan `tasks/todo-site-changes.md` Q1, invariant 10.
 *
 * A seat may know that `wp-config.php` changed (the Site changes list names it), but not read it:
 * the file holds the database password and the salts, and every seat on a site — an editor
 * included — can open a diff. So the door answers `{blocked: true, reason}` for a configuration
 * file instead of its bytes.
 *
 * 🔒 THREE RUNTIMES, ONE LIST. The same files are refused by tracy-host's job validator
 * (`isSensitiveWebrootPath` in `apps/tracy-host/src/webroot.js`) and inside the fleet script that
 * produces the diff (`webroot-git.sh` `file-diff`/`file-show`, through
 * `scripts/lib/webroot-sensitive.sh`), so a caller that reaches the host job without this door is
 * refused as well. None of the three can import another (two images and bash), so the list is
 * written three times; `test/file-visibility.test.mjs` runs all three over the same paths and fails
 * when any two disagree. Change all three in one commit.
 *
 * SOURCE: the agent file fence's secrets list — `WEBROOT_SECRETS` (`wp-config.php`,
 * `configuration.php`) and `.env` anywhere, `secretsFileReason` in
 * `packages/tools/tracy-subprocess-docker/src/site-guards.mjs`. This image does not carry
 * `packages/tools`, so it is copied, widened to copies and backups, and the test holds it to cover
 * everything the fence refuses.
 *
 * This is a denylist of files KNOWN to carry secrets. It does not promise that no other file in a
 * webroot holds one (a plugin may write a key anywhere); it closes the ones every site has.
 *
 * EmDash (not certain, recorded in the plan): its secrets live in the site directory's `.env`
 * (`EMDASH_ENCRYPTION_KEY`) and its SQLite database `data/data.db`, both outside the webroot on a
 * site Tracy builds — they are listed so that a webroot that ever holds a copy still hides it.
 */

/** Longer than any path a person clicks; the same ceiling the door had before. */
const MAX_PATH = 400

/**
 * Whether a webroot-relative path names a configuration file whose bytes are never shown. Matched
 * on the last segment, case-insensitively, so a copy in a subfolder or a backup next to it counts.
 * @param {string} path
 * @returns {boolean}
 */
export function isSensitivePath(path) {
  const name = String(path).split('/').at(-1)?.toLowerCase() ?? ''
  // An editor's swap or a hidden copy (`.wp-config.php.swp`) keeps the secret too.
  const bare = name.replace(/^\.+/, '')
  // WordPress: the config, and every backup or renamed copy of it. The sample ships with core
  // and carries placeholders only.
  if (bare.startsWith('wp-config') && bare !== 'wp-config-sample.php') return true
  // Joomla: `configuration.php` and its copies (`.bak`, `.orig`, `-dist`).
  if (bare.startsWith('configuration.') && bare.includes('php')) return true
  // Dotenv files, any flavour: `.env`, `.env.local`, `production.env`.
  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) return true
  // EmDash: the SQLite database (users, token hashes, encrypted settings) and its journal files,
  // and the agent token file provisioning writes under `data/`.
  if (/\.(db|sqlite3?)(-wal|-shm|-journal)?$/.test(name)) return true
  if (name === 'tracy-agent.token') return true
  return false
}

/** Every spelling one decode or two could turn a path into; `%2D` and `%252E` hide nothing. */
function spellings(path) {
  const out = [path]
  let current = path
  for (let i = 0; i < 3 && current.includes('%'); i++) {
    try {
      current = decodeURIComponent(current)
    } catch {
      break
    }
    out.push(current)
  }
  return out
}

/**
 * What the diff door may do with a requested path: refuse it as invalid, show it, or name it
 * without its bytes. The path that goes on to the host is the NORMALIZED one (no `.` segments, no
 * empty segments), so the script never sees a spelling this function did not judge.
 *
 * Refused as invalid: anything that leaves the webroot (`..`, a leading `/`), names nothing, holds
 * a control character or a backslash, or carries git pathspec magic (`:(glob)…`, `*`, `?`, `[`) —
 * on a host running an older script, `git diff -- 'wp-config.ph?'` would match the config.
 *
 * @param {unknown} raw - the `path` query parameter, already URL-decoded once by the router.
 * @returns {{ok: false, code: 'INVALID_PATH'} | {ok: true, path: string, blocked: false} |
 *   {ok: true, path: string, blocked: true, reason: 'configuration-file'}}
 */
export function fileVisibility(raw) {
  const invalid = /** @type {const} */ ({ ok: false, code: 'INVALID_PATH' })
  if (typeof raw !== 'string' || !raw || raw.length > MAX_PATH) return invalid
  if (raw.startsWith('/') || raw.startsWith(':') || /[\\*?[]/.test(raw)) return invalid
  for (const ch of raw) {
    const code = ch.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return invalid
  }
  const segments = []
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return invalid
    segments.push(segment)
  }
  if (segments.length === 0) return invalid
  const path = segments.join('/')
  const blocked = spellings(path).some((p) => isSensitivePath(p) || p.split('/').includes('..'))
  return blocked
    ? { ok: true, path, blocked: true, reason: 'configuration-file' }
    : { ok: true, path, blocked: false }
}
