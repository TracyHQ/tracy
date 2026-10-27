#!/usr/bin/env node
/**
 * inventory — a BOUNDED, READ-ONLY roll-call of the dev EmDash sites' agent-token readiness (#155,
 * ahead of PR #162). It answers one question and only that one: for every EmDash site this host
 * runs, does the protected root-owned token custody exist as #155 requires, AND can the fixed
 * agent's identity be read back from the site's own database — WITHOUT minting, staging, writing,
 * reading token bytes, recreating a container, or deploying anything.
 *
 * 🔒 WHAT THIS SCRIPT MUST NEVER DO, because the apply is a SEPARATELY reviewed, one-site step:
 *   - It never writes. No mint, no stage/finalize, no chown/chmod, no compose recreate, no account
 *     creation, no schema change. Every docker call is `ps` / `inspect` / a READ-ONLY `exec`, and
 *     every filesystem call is an `lstat`/`readdir` — never an open of the token file.
 *   - It never reads the token's bytes. Custody is judged by `lstat` (regular / owner / mode) and by
 *     the container's bind-mount metadata (source, destination, read-only, type) — the value itself
 *     is not opened here or in the container.
 *   - It never proves a token AUTHENTICATES. `custody` (the file is where and how #155 wants it) and
 *     `db` (the fixed agent identity is readable) are reported SEPARATELY and it emits no single
 *     "ready to deploy" verdict: an authenticated MCP round-trip is the reader's job, not this one.
 *
 * 🔒 A CONTAINER IS TIED TO ITS SITE BEFORE ANY exec. A `<label>-web-1` name is not proof: a renamed
 * container, a duplicate web service, or a compose brought up from another directory would let this
 * read (and attribute) the wrong site's database. So enumeration is by the Compose SERVICE label,
 * uniqueness per project is enforced (a duplicated web service is reported `ambiguous-container`,
 * never silently picked), and before any `exec` the container's compose identity
 * (project=label, service=web, working_dir=<privateRoot>/<label>, config_files under it) AND its
 * `/app/data` bind source (=<privateRoot>/<label>/data) are validated — a mismatch blocks the read.
 *
 * 🔒 WHAT IT NEVER PRINTS. A provision log reaches the desk, and this output may too. So no raw site
 * label, path, owner email, env value, docker config, or token ever appears in stdout/stderr — a
 * site is named ONLY by `sha256(label)` (full, or truncated to 32 hex with `--truncate`), every
 * other field is a FIXED technical enum or a bounded non-negative count validated on the way out,
 * and a failure is one of a fixed set of sanitized tokens, never a message carrying a path or a
 * docker/db error verbatim.
 *
 * 🔒 THE DATABASE READ RUNS AS www-data, NOT ROOT. `data/data.db` is an agent-writable file; running
 * a query engine over it as root would execute agent-controllable state as root. So the read is a
 * `docker exec -i -u www-data … node --input-type=module -` fed {@link DB_INVENTORY_SCRIPT} on
 * stdin, which opens the database `readOnly: true`. If that reader cannot run (no `node:sqlite`, an
 * open failure, a non-zero transport) the site is reported `db: unknown`/`error` — NEVER ready.
 *
 * The builders below are PURE (argv, classification, custody evaluation, output shaping), so a test
 * asserts the exact argv and verdict the host runs; {@link defaultRun} is the one impure runner and
 * {@link defaultFs} the one filesystem seam, both replaceable through {@link runInventory}.
 *
 * 🔒 THE CI RUNNER DOES NOT NECESSARILY SEE `TRACY_PRIVATE_ROOT`. Run directly there, this would
 * `lstat` a root it cannot see and report every site `root-unsafe`. So `--via-host` (see
 * {@link runHostInventory}) locates the ONE running tracy-host container — the fleet's own management
 * stack, which binds the private root at the identical path — validates it, and pipes THIS reviewed
 * source, UNMODIFIED, into it on stdin to run there. `--root`/`--truncate` alone keep running the
 * inventory locally, unchanged.
 *
 *   node packages/fleet/tracy-fleet-operation/scripts/provision/emdash/inventory.mjs [--root DIR] [--truncate] [--via-host]
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The private root's default — the same value `scripts/lib/roots.sh` pins (`TRACY_PRIVATE_ROOT`). */
export const DEFAULT_PRIVATE_ROOT = '/srv/tracy'

/**
 * A fleet label, exactly as `apps/tracy-host/src/provision.js`'s `SAFE_LABEL` holds it before it
 * reaches a path or a container name. Repeated (not imported) because this script is runnable by
 * hand on a host and a label is interpolated into a filesystem path and matched against compose
 * metadata; a `..` or a `/` in one must be refused here, not trusted.
 */
export const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** The site's directory under the PRIVATE root — its compose working dir and the bind source root. */
export function siteDir(privateRoot, label) {
  return `${privateRoot}/${label}`
}

/** The site's token file, root-owned 0600, under the PRIVATE root — mounted into no dsh. */
export function hostTokenPath(privateRoot, label) {
  return `${privateRoot}/${label}/tracy-agent.token`
}

/** The site's SQLite database DIRECTORY on the host — the bind source of the container's `/app/data`. */
export function hostDataDir(privateRoot, label) {
  return `${privateRoot}/${label}/data`
}

/** The site's SQLite database file on the host. */
export function hostDbPath(privateRoot, label) {
  return `${privateRoot}/${label}/data/data.db`
}

/** Where the token is bound READ-ONLY inside the web container (#155), outside the writable volumes. */
export const CONTAINER_TOKEN_PATH = '/run/tracy-agent.token'

/** Where `./data` is bound inside the web container (`render-compose.sh` tracy_compose_emdash). */
export const CONTAINER_DATA_PATH = '/app/data'

/** The database path inside the web container. */
export const CONTAINER_DB_PATH = '/app/data/data.db'

/**
 * The legacy in-container token copy a pre-#155 bootstrap could leave under an agent-writable path.
 * This is the exact path `platform/emdash.sh`'s tracy-business branch writes, reads and then removes
 * (`bootstrap-site.sh` → `/app/data/tracy-agent.token`) — reported present/absent, never read.
 */
export const LEGACY_TOKEN_PATH = '/app/data/tracy-agent.token'

/** The opaque per-site selector: sha256 of the label, never the label itself. */
export function selectorFor(label, { truncate = false } = {}) {
  const hex = createHash('sha256').update(String(label), 'utf8').digest('hex')
  return truncate ? hex.slice(0, 32) : hex
}

// ── docker argv builders (pure) ────────────────────────────────────────────────────────────────

/**
 * List the running Compose WEB services, one `<id>\t<project>\t<image>\t<name>` per line. Filtered
 * by the compose service label (not by name), so a renamed container is still found and a container
 * that merely ends in `-web-1` but is not a compose web service is not mistaken for one.
 */
export function psArgv() {
  return [
    'ps',
    '--no-trunc',
    '--filter',
    'label=com.docker.compose.service=web',
    '--format',
    '{{.ID}}\t{{.Label "com.docker.compose.project"}}\t{{.Image}}\t{{.Names}}'
  ]
}

/**
 * Parse {@link psArgv} into `{ id, label, image, name }` for rows whose project is a valid fleet
 * label. An invalid project is dropped and counted (`skipped`), never silently merged.
 * @returns {{ rows: Array<{id: string, label: string, image: string, name: string}>, skipped: number }}
 */
export function parsePs(stdout) {
  const rows = []
  let skipped = 0
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.trim()) continue
    const [id, project, image, name] = line.split('\t')
    if (!id || !project) {
      skipped++
      continue
    }
    if (!SAFE_LABEL.test(project)) {
      skipped++
      continue
    }
    rows.push({ id: id.trim(), label: project, image: image ?? '', name: name ?? '' })
  }
  return { rows, skipped }
}

/**
 * Group parsed web services by label. A label with more than one running web container is
 * `duplicate` (reported ambiguous, never picked); a label with exactly one maps to its container.
 * @returns {{ unique: Map<string, {id: string, image: string, name: string}>, duplicate: Set<string> }}
 */
export function groupByLabel(rows) {
  const byLabel = new Map()
  for (const r of rows) {
    if (!byLabel.has(r.label)) byLabel.set(r.label, [])
    byLabel.get(r.label).push(r)
  }
  const unique = new Map()
  const duplicate = new Set()
  for (const [label, list] of byLabel) {
    if (list.length === 1) unique.set(label, { id: list[0].id, image: list[0].image, name: list[0].name })
    else duplicate.add(label)
  }
  return { unique, duplicate }
}

/**
 * Inspect ONE container for the minimal fields this inventory needs, each emitted as its own JSON
 * line so the parser reads primitives, not a whole `docker inspect` dump:
 *   image · running · health · labels (compose identity) · mounts · exposed ports.
 */
export function inspectArgv(container) {
  const format = [
    '{{json .Config.Image}}',
    '{{json .State.Running}}',
    // No healthcheck → no Health key. `index` yields null for a missing key; a field access (even
    // inside `if`) fails the whole inspect on the Docker CLI 27.x inside tracy-host (measured 24/09).
    '{{json (index .State "Health")}}',
    '{{json .Config.Labels}}',
    '{{json .Mounts}}',
    '{{json .Config.ExposedPorts}}'
  ].join('\n')
  return ['inspect', '--format', format, container]
}

/** Parse the six-line {@link inspectArgv} output; a malformed line becomes `null`, never a throw. */
export function parseInspect(stdout) {
  const lines = String(stdout ?? '').split('\n')
  const at = (i) => {
    try {
      return JSON.parse(lines[i])
    } catch {
      return null
    }
  }
  const image = at(0)
  const labels = at(3)
  const mounts = at(4)
  const exposed = at(5)
  return {
    image: typeof image === 'string' ? image : '',
    running: at(1) === true,
    health: at(2),
    labels: labels && typeof labels === 'object' ? labels : {},
    mounts: Array.isArray(mounts) ? mounts : [],
    exposed: exposed && typeof exposed === 'object' ? exposed : {}
  }
}

/**
 * A READ-ONLY presence probe for the legacy in-container token copy, as www-data. It prints one
 * fixed token and NEVER the file's contents: `present` / `present-symlink` / `absent`. `-L` before
 * `-e` so a dangling symlink is still reported as a symlink and not "absent".
 */
export function legacyProbeArgv(container) {
  return [
    'exec',
    '-u',
    'www-data',
    container,
    'sh',
    '-c',
    `if [ -L ${LEGACY_TOKEN_PATH} ]; then echo present-symlink; elif [ -e ${LEGACY_TOKEN_PATH} ]; then echo present; else echo absent; fi`
  ]
}

/** Map {@link legacyProbeArgv} output to a fixed enum. Anything unexpected is `unknown`, not a guess. */
export function parseLegacy(stdout) {
  const s = String(stdout ?? '').trim()
  if (s === 'present' || s === 'present-symlink' || s === 'absent') return s
  return 'unknown'
}

// ── the in-container READ-ONLY database reader ───────────────────────────────────────────────────

/**
 * Fed on stdin to `node --input-type=module -` AS www-data, with the database path as argv[2]. It
 * opens the site's SQLite `readOnly: true` (no write can occur even if a statement tried), checks
 * the two tables' schema, and reports — as counts and fixed enums ONLY — whether the fixed agent
 * account is the SOLE active administrator and how many canonical / recovery token rows it holds,
 * plus canonical expiry as counts. It writes NO user id, email, hash, token, or PAT.
 *
 * 🔒 It counts ALL rows for the fixed email FIRST, then requires a single active role-50 row — the
 * same shape `recover-agent-token.mjs`'s `agent()` enforces — so a duplicate or a disabled/non-admin
 * account is reported (`ambiguous` / `disabled` / `not-admin`), never concealed by a query that only
 * ever selects active admins.
 *
 * On any failure (no `node:sqlite`, an open failure, a query error) it writes a fixed sanitized
 * token so the caller reports `unknown`/`error` and never infers readiness. It is an ES module
 * (`--input-type=module`), so it reaches `node:sqlite` by dynamic import — `require` is undefined
 * here, and a Node without the module is reported `no-sqlite`, not silently treated as ready.
 */
export const DB_INVENTORY_SCRIPT = [
  "const out = (o) => process.stdout.write('TRACY_EMDASH_DB ' + JSON.stringify(o) + '\\n');",
  "const err = (m) => process.stdout.write('TRACY_EMDASH_DB_ERR ' + String(m).replace(/[\\r\\n]+/g, ' ').slice(0, 60) + '\\n');",
  'let DatabaseSync;',
  "try { ({ DatabaseSync } = await import('node:sqlite')); } catch { err('no-sqlite'); process.exit(0); }",
  "const AGENT_EMAIL = 'tracy-agent@tracy.ai';",
  "const CANONICAL = 'tracy-agent';",
  "const RECOVERY_PREFIX = 'tracy-agent.recovery.';",
  'let db;',
  "try { db = new DatabaseSync(process.argv[2], { readOnly: true }); } catch { err('open-failed'); process.exit(0); }",
  'try {',
  "  const cols = (t) => new Set(db.prepare('PRAGMA table_info(' + t + ')').all().map((r) => r.name));",
  "  const users = cols('users');",
  "  const toks = cols('_emdash_api_tokens');",
  "  const schemaOk = users.has('id') && users.has('email') && users.has('role') && users.has('disabled') && toks.has('name') && toks.has('user_id') && toks.has('expires_at');",
  "  if (!schemaOk) { out({ schema: 'incomplete' }); db.close(); process.exit(0); }",
  "  const matching = db.prepare('SELECT id, role, disabled FROM users WHERE lower(email) = lower(?)').all(AGENT_EMAIL);",
  '  let agent, agentId = null;',
  "  if (matching.length === 0) agent = 'missing';",
  "  else if (matching.length > 1) agent = 'ambiguous';",
  "  else if (matching[0].disabled !== 0) agent = 'disabled';",
  "  else if (matching[0].role !== 50) agent = 'not-admin';",
  "  else { agent = 'active-unique'; agentId = matching[0].id; }",
  '  let canonicalTokens = 0, recoveryTokens = 0, canonicalExpired = 0, canonicalNoExpiry = 0;',
  '  if (agentId !== null) {',
  "    const rows = db.prepare('SELECT name, expires_at FROM _emdash_api_tokens WHERE user_id = ?').all(agentId);",
  '    const now = Date.now();',
  '    for (const r of rows) {',
  '      if (r.name === CANONICAL) {',
  '        canonicalTokens++;',
  '        if (r.expires_at == null) canonicalNoExpiry++;',
  '        else { const t = Date.parse(r.expires_at); if (Number.isFinite(t) && t <= now) canonicalExpired++; }',
  "      } else if (typeof r.name === 'string' && r.name.startsWith(RECOVERY_PREFIX)) {",
  '        recoveryTokens++;',
  '      }',
  '    }',
  '  }',
  "  out({ schema: 'ok', agent, canonicalTokens, recoveryTokens, canonicalExpired, canonicalNoExpiry });",
  "} catch { err('query-failed'); } finally { try { db.close(); } catch {} }"
].join('\n')

/** The docker sub-argv for the READ-ONLY database read: www-data, script on stdin, db path as argv. */
export function dbArgv(container) {
  return ['exec', '-i', '-u', 'www-data', container, 'node', '--input-type=module', '-', CONTAINER_DB_PATH]
}

/** Parse the reader's one line into a transport-level result — never a throw, always a fixed shape. */
export function parseDbResult(stdout) {
  const s = String(stdout ?? '').trim()
  if (s.startsWith('TRACY_EMDASH_DB_ERR '))
    return { ok: false, reason: s.slice('TRACY_EMDASH_DB_ERR '.length).trim() }
  if (s.startsWith('TRACY_EMDASH_DB ')) {
    try {
      return { ok: true, ...JSON.parse(s.slice('TRACY_EMDASH_DB '.length)) }
    } catch {
      return { ok: false, reason: 'unparseable' }
    }
  }
  return { ok: false, reason: 'no-output' }
}

/** Only the fixed reasons the reader itself emits survive; anything else collapses to `read-failed`. */
export function sanitizeDbReason(reason) {
  const known = ['no-sqlite', 'open-failed', 'query-failed', 'unparseable', 'no-output', 'transport']
  return known.includes(reason) ? reason : 'read-failed'
}

/**
 * Fold a parsed DB result into the fixed, validated public shape: a known `agent` enum only, and
 * bounded non-negative integer counts only — a docker exec can return anything, and no arbitrary
 * field ever reaches the shared log.
 */
export function sanitizeDbResult(parsed) {
  if (!parsed || !parsed.ok) return { status: 'error', reason: sanitizeDbReason(parsed?.reason) }
  if (parsed.schema === 'incomplete') return { status: 'schema-incomplete' }
  if (parsed.schema !== 'ok') return { status: 'error', reason: 'unparseable' }
  const agentEnum = ['active-unique', 'ambiguous', 'missing', 'disabled', 'not-admin']
  const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : null)
  return {
    status: 'readable',
    agent: agentEnum.includes(parsed.agent) ? parsed.agent : 'unknown',
    canonicalTokens: count(parsed.canonicalTokens),
    recoveryTokens: count(parsed.recoveryTokens),
    canonicalExpired: count(parsed.canonicalExpired),
    canonicalNoExpiry: count(parsed.canonicalNoExpiry)
  }
}

// ── classification (pure) ────────────────────────────────────────────────────────────────────────

/** What a web image says about its platform — the same tag conventions `render-compose.sh` reads. */
export function imageClass(image) {
  const ref = String(image ?? '')
  if (
    ref.startsWith('tracy/emdash:') ||
    ref.startsWith('tracy/web-emdash:') ||
    /^tracy\/[A-Za-z0-9._-]+-emdash:/.test(ref)
  )
    return 'emdash'
  if (ref.startsWith('joomla:') || ref.startsWith('tracy/web-joomla:')) return 'php'
  if (ref.startsWith('wordpress:') || ref.startsWith('tracy/web-wordpress:')) return 'php'
  return 'unknown'
}

/**
 * Classify a site POSITIVELY, and refuse to guess. The site's own label text is NEVER consulted — a
 * label containing "emdash" proves nothing. The signals are the renderer's own tells: an EmDash web
 * IMAGE tag, and a `data/data.db` on the host (`tracy_detect_platform` uses exactly these). Port
 * 4321 alone is NOT identity proof and is not a classification signal. A PHP image together with an
 * EmDash signal is `ambiguous` (reported, not resolved); no signal at all is `unknown`.
 */
export function classify({ image = '', hasDataDb = false } = {}) {
  const cls = imageClass(image)
  const emdashSignal = cls === 'emdash' || hasDataDb
  const phpSignal = cls === 'php'
  if (emdashSignal && phpSignal) return 'ambiguous'
  if (emdashSignal) return 'emdash'
  if (phpSignal) return 'not-emdash'
  return 'unknown'
}

/** Does the container expose EmDash's 4321? Informational only (see {@link classify}). */
export function exposes4321(exposed) {
  return Boolean(
    exposed && typeof exposed === 'object' && Object.keys(exposed).some((k) => /^4321(\/|$)/.test(k))
  )
}

// ── compose identity + custody evaluation (pure) ─────────────────────────────────────────────────

/**
 * Tie a container to the site it claims to be, BEFORE any exec runs against it. Reads only the
 * Compose labels docker writes on every project container. A mismatch means the container was not
 * brought up as this site's `web` service from this site's directory — so its database must not be
 * read as this site's.
 * @returns {'ok'|'project-mismatch'|'service-mismatch'|'workdir-mismatch'|'configfiles-mismatch'}
 */
export function evaluateComposeIdentity(labels, label, privateRoot) {
  const l = labels && typeof labels === 'object' ? labels : {}
  if (l['com.docker.compose.project'] !== label) return 'project-mismatch'
  if (l['com.docker.compose.service'] !== 'web') return 'service-mismatch'
  if (l['com.docker.compose.project.working_dir'] !== siteDir(privateRoot, label)) return 'workdir-mismatch'
  // 🔒 EXACTLY the one file `render-compose.sh` writes (`$SITE_DIR/docker-compose.yml`), and nothing
  // else. A prefix check would accept `…/<label>/../../other/docker-compose.yml` or an extra foreign
  // override file merged in — both of which could bring up a different site's stack under this label.
  // So: a single config entry, equal to the canonical path.
  const expected = `${siteDir(privateRoot, label)}/docker-compose.yml`
  const parts = String(l['com.docker.compose.project.config_files'] ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length !== 1 || parts[0] !== expected) return 'configfiles-mismatch'
  return 'ok'
}

/**
 * Judge the HOST token file from an `lstat` result ALONE — the bytes are never opened. #155 wants a
 * regular file (no symlink), owned by uid 0, mode 0600. A stat that failed for a reason OTHER than
 * "does not exist" (e.g. EACCES) is `stat-error`, not `missing`.
 * @param {{ exists?: boolean, error?: boolean, isSymbolicLink?: boolean, isFile?: boolean, uid?: number, mode?: number }} st
 */
export function evaluateHostFile(st) {
  if (!st) return 'stat-error'
  if (st.error) return 'stat-error'
  if (!st.exists) return 'missing'
  if (st.isSymbolicLink) return 'symlink'
  if (!st.isFile) return 'not-regular'
  if (st.uid !== 0) return 'bad-owner'
  if ((st.mode & 0o777) !== 0o600) return 'bad-mode'
  return 'ok'
}

/**
 * Judge the container's token bind from `.Mounts`, against the host source #155 expects. The mount
 * must be a read-only bind at {@link CONTAINER_TOKEN_PATH} whose source is exactly the host token
 * file. Anything else is reported by name.
 */
export function evaluateMount(mounts, expectedSource) {
  const m = (Array.isArray(mounts) ? mounts : []).find((x) => x && x.Destination === CONTAINER_TOKEN_PATH)
  if (!m) return 'missing'
  if (m.Type !== 'bind') return 'not-bind'
  if (m.Source !== expectedSource) return 'source-mismatch'
  if (m.RW !== false) return 'not-readonly'
  return 'ok'
}

/**
 * Confirm the container's `/app/data` is a bind of THIS site's data directory, so a DB read cannot
 * be attributed to the wrong site. Anything else blocks the read.
 * @returns {'ok'|'missing'|'not-bind'|'source-mismatch'}
 */
export function evaluateDataSource(mounts, expectedSource) {
  const m = (Array.isArray(mounts) ? mounts : []).find((x) => x && x.Destination === CONTAINER_DATA_PATH)
  if (!m) return 'missing'
  if (m.Type !== 'bind') return 'not-bind'
  if (m.Source !== expectedSource) return 'source-mismatch'
  return 'ok'
}

/** The container's own health, folded to a fixed enum (`none` when the image declares no healthcheck). */
export function healthState(inspectHealth, running) {
  if (!running) return 'down'
  if (!inspectHealth || typeof inspectHealth !== 'object') return 'none'
  const s = inspectHealth.Status
  if (s === 'healthy' || s === 'unhealthy' || s === 'starting') return s
  return 'none'
}

// ── the impure seams ───────────────────────────────────────────────────────────────────────────

/** Bounds every docker call: neither a hung daemon nor a chatty container can stall this inventory. */
export const RUN_TIMEOUT_MS = 15_000
export const RUN_MAX_BUFFER = 1 << 20 // 1 MiB — counts and short JSON only ever come back

/**
 * The one impure runner: run a docker sub-argv with a bounded timeout and buffer, feeding stdin when
 * given, never a shell. A caller may raise the ceiling for THIS call via `timeoutMs` (the default,
 * and every other call's bound, is unchanged). Replaced by `config.run` in tests.
 * @param {{ argv: readonly string[], stdin?: string, timeoutMs?: number }} input
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean }>}
 */
export function defaultRun({ argv, stdin, timeoutMs }) {
  return new Promise((resolve) => {
    const child = execFile(
      'docker',
      [...argv],
      { timeout: timeoutMs ?? RUN_TIMEOUT_MS, maxBuffer: RUN_MAX_BUFFER },
      (error, stdout, stderr) => {
        resolve({
          code: error && typeof error.code === 'number' ? error.code : error ? null : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          timedOut: Boolean(error && error.killed)
        })
      }
    )
    if (stdin !== undefined && child.stdin) {
      child.stdin.on('error', () => {})
      child.stdin.end(stdin)
    }
  })
}

/**
 * The filesystem seam: `lstat` (never `stat` — a symlink must be seen as one) and `readdir`. An
 * `lstat` distinguishes "does not exist" (ENOENT) from any other failure, and `readdir` returns
 * `null` on failure so the caller reports the root as not-enumerated rather than empty-success.
 */
export const defaultFs = {
  lstat(path) {
    try {
      const st = lstatSync(path)
      return {
        exists: true,
        isSymbolicLink: st.isSymbolicLink(),
        isFile: st.isFile(),
        isDirectory: st.isDirectory(),
        uid: st.uid,
        mode: st.mode
      }
    } catch (error) {
      if (error && error.code === 'ENOENT') return { exists: false }
      return { error: true }
    }
  },
  readdir(path) {
    try {
      return (
        readdirSync(path, { withFileTypes: true })
          // A real subdirectory only — a symlink is not followed (fail closed: it could point
          // outside the private root), and files are not sites.
          .filter((d) => d.isDirectory() && !d.isSymbolicLink())
          .map((d) => d.name)
      )
    } catch {
      return null
    }
  }
}

// ── the inventory itself ───────────────────────────────────────────────────────────────────────

/**
 * Roll-call every EmDash site this host runs (and every private-root site folder that isn't
 * running), and report each one's classification, web state, compose identity, token custody,
 * legacy-copy presence and readable DB identity — all opaque and fixed-shape. Returns the aggregate;
 * prints nothing.
 *
 * @param {object} [config]
 * @param {string} [config.privateRoot]
 * @param {(i: { argv: readonly string[], stdin?: string }) => Promise<{code: number|null, stdout: string, stderr: string, timedOut: boolean}>} [config.run]
 * @param {typeof defaultFs} [config.fs]
 * @param {boolean} [config.truncate] - truncate the selector to 32 hex
 */
export async function runInventory({
  privateRoot = DEFAULT_PRIVATE_ROOT,
  run = defaultRun,
  fs = defaultFs,
  truncate = false
} = {}) {
  const containers = new Map() // label -> { id, image, name }
  const duplicates = new Set() // labels with more than one running web container
  let containersEnumerated = false
  let skippedContainers = 0
  const psRes = await run({ argv: psArgv() })
  if (psRes.code === 0 && !psRes.timedOut) {
    containersEnumerated = true
    const { rows, skipped } = parsePs(psRes.stdout)
    skippedContainers = skipped
    const grouped = groupByLabel(rows)
    for (const [label, c] of grouped.unique) containers.set(label, c)
    for (const label of grouped.duplicate) duplicates.add(label)
  }

  // 🔒 THE PRIVATE ROOT MUST BE A REAL DIRECTORY BEFORE ANY PER-SITE FILESYSTEM READ OR EXEC. A
  // symlinked / missing / non-directory / unreadable root would make every later
  // `lstat(<root>/<label>/…)` traverse an attacker-chosen path (and every exec run against a site we
  // cannot vouch for). So this is checked FIRST, and if it fails closed the roll-call stops here:
  // containers are still named (from `docker ps`, which touches no host path) with a fixed
  // `root-unsafe` status, but NO token/db `lstat`, NO `inspect`, NO `exec` runs. Honest, incomplete.
  const rootStat = fs.lstat(privateRoot)
  const rootSafe = Boolean(
    rootStat && rootStat.exists && !rootStat.error && rootStat.isDirectory && !rootStat.isSymbolicLink
  )
  if (!rootSafe) {
    const unsafeLabels = new Set([...containers.keys(), ...duplicates])
    const sites = [...unsafeLabels]
      .sort()
      .map((label) => ({ selector: selectorFor(label, { truncate }), status: 'root-unsafe' }))
    return {
      kind: 'emdash-token-inventory',
      version: 1,
      readOnly: true,
      containersEnumerated,
      rootEnumerated: false,
      skippedContainers,
      aggregate: aggregate(sites),
      sites,
      note: 'the private root is not a plain readable directory; per-site custody/db was not read'
    }
  }

  const dirs = []
  let rootEnumerated = false
  const listed = fs.readdir(privateRoot)
  if (Array.isArray(listed)) {
    rootEnumerated = true
    for (const name of listed) if (SAFE_LABEL.test(name)) dirs.push(name)
  }

  // Union of running web containers, duplicated ones, and configured site folders — nothing dropped.
  const labels = new Set([...containers.keys(), ...duplicates, ...dirs])

  const sites = []
  for (const label of [...labels].sort()) {
    const selector = selectorFor(label, { truncate })
    if (duplicates.has(label)) {
      // A duplicated web service is an ambiguity to surface, not a container to pick and read.
      sites.push({ selector, status: 'ambiguous-container' })
      continue
    }
    try {
      sites.push(
        await inspectSite({ label, selector, container: containers.get(label), privateRoot, run, fs })
      )
    } catch {
      // A per-site failure never carries a path or a raw error, and never aborts the roll-call.
      sites.push({ selector, status: 'error', reason: 'site-scan-failed' })
    }
  }

  return {
    kind: 'emdash-token-inventory',
    version: 1,
    readOnly: true,
    containersEnumerated,
    rootEnumerated,
    skippedContainers,
    aggregate: aggregate(sites),
    sites,
    // 🔒 A FIXED, LOAD-BEARING DISCLAIMER: custody is a filesystem/mount fact, db is a readability
    // fact; neither proves the token authenticates. The apply is reviewed one site at a time.
    note: 'custody and db are reported separately; neither proves the token authenticates or that a site is ready to deploy'
  }
}

async function inspectSite({ label, selector, container, privateRoot, run, fs }) {
  // The site directory: fail closed if it is a symlink (do not follow a path out of the private
  // root), unreadable (EACCES), or present-but-not-a-directory before stat-ing the token/db under it.
  const dirState = fs.lstat(siteDir(privateRoot, label))
  const unsafeDir = Boolean(
    !dirState ||
      dirState.error ||
      (dirState.exists && (dirState.isSymbolicLink || dirState.isDirectory === false))
  )

  const hostFile = unsafeDir ? 'unsafe-path' : evaluateHostFile(fs.lstat(hostTokenPath(privateRoot, label)))
  const dbFileStat = unsafeDir ? { exists: false } : fs.lstat(hostDbPath(privateRoot, label))
  const hasDataDb = Boolean(dbFileStat && dbFileStat.exists && dbFileStat.isFile !== false)

  if (!container) {
    // Not running: classify from host signals only, and refuse to speak for what a container would
    // have told us (mount / legacy / db are `unknown`, web is `down`).
    return {
      selector,
      status: 'ok',
      classification: classify({ hasDataDb }),
      web: { running: false, health: 'down' },
      compose: 'unavailable',
      custody: { hostFile, mount: 'unknown' },
      dataSource: 'unknown',
      legacy: 'unknown',
      db: { status: 'unknown' }
    }
  }

  const insRes = await run({ argv: inspectArgv(container.id) })
  if (insRes.code !== 0 || insRes.timedOut) {
    return {
      selector,
      status: 'error',
      reason: insRes.timedOut ? 'inspect-timeout' : 'inspect-failed',
      custody: { hostFile }
    }
  }
  const ins = parseInspect(insRes.stdout)
  const classification = classify({ image: ins.image, hasDataDb })
  const compose = evaluateComposeIdentity(ins.labels, label, privateRoot)
  const dataSource = evaluateDataSource(ins.mounts, hostDataDir(privateRoot, label))

  const site = {
    selector,
    status: 'ok',
    classification,
    web: {
      running: ins.running,
      health: healthState(ins.health, ins.running),
      exposes4321: exposes4321(ins.exposed)
    },
    compose,
    custody: {
      hostFile,
      mount: unsafeDir ? 'unsafe-path' : evaluateMount(ins.mounts, hostTokenPath(privateRoot, label))
    },
    dataSource,
    legacy: 'unknown',
    db: { status: 'unknown' }
  }

  // 🔒 Only interrogate the container further for a RUNNING, positively-classified EmDash site whose
  // compose identity AND data bind both check out. A PHP/ambiguous/unknown site, a stopped one, a
  // symlinked site dir, or a mismatched container gets NO www-data exec and NO DB read — the wrong
  // site's database must never be attributed here.
  const safeToRead =
    classification === 'emdash' && ins.running && !unsafeDir && compose === 'ok' && dataSource === 'ok'
  if (!safeToRead) {
    site.db = { status: 'blocked' }
    return site
  }
  site.legacy = await probeLegacy({ container: container.id, run })
  site.db = await readDb({ container: container.id, run })
  return site
}

async function probeLegacy({ container, run }) {
  const res = await run({ argv: legacyProbeArgv(container) })
  if (res.code !== 0 || res.timedOut) return 'unknown'
  return parseLegacy(res.stdout)
}

async function readDb({ container, run }) {
  const res = await run({ argv: dbArgv(container), stdin: DB_INVENTORY_SCRIPT })
  if (res.timedOut) return { status: 'unknown', reason: 'timeout' }
  // 🔒 A non-zero transport is a failure even if stdout looks like a result — a crashed process can
  // print a valid-looking line on its way down.
  if (res.code !== 0) return { status: 'error', reason: 'transport' }
  return sanitizeDbResult(parseDbResult(res.stdout))
}

/** Fold the per-site verdicts into fixed counts — the honest total, including unknown/ambiguous. */
export function aggregate(sites) {
  const bump = (o, k) => {
    o[k] = (o[k] ?? 0) + 1
  }
  const status = {}
  const classification = {}
  const compose = {}
  const custodyHostFile = {}
  const custodyMount = {}
  const legacy = {}
  const db = {}
  for (const s of sites) {
    bump(status, s.status)
    if (s.status !== 'ok') continue
    bump(classification, s.classification)
    bump(compose, s.compose ?? 'unknown')
    bump(custodyHostFile, s.custody?.hostFile ?? 'unknown')
    bump(custodyMount, s.custody?.mount ?? 'unknown')
    bump(legacy, s.legacy ?? 'unknown')
    bump(db, s.db?.status ?? 'unknown')
  }
  const emdash = sites.filter((s) => s.status === 'ok' && s.classification === 'emdash')
  // custodyReady and dbReadable are counted SEPARATELY and deliberately never AND-ed into one
  // "ready" number — that conflation is exactly what the disclaimer guards against.
  const custodyReady = emdash.filter((s) => s.custody?.hostFile === 'ok' && s.custody?.mount === 'ok').length
  const dbReadable = emdash.filter(
    (s) => s.db?.status === 'readable' && s.db?.agent === 'active-unique'
  ).length
  return {
    total: sites.length,
    status,
    emdash: emdash.length,
    classification,
    compose,
    custodyHostFile,
    custodyMount,
    legacy,
    db,
    emdashCustodyReady: custodyReady,
    emdashDbIdentityReadable: dbReadable
  }
}

// ── the management-host transport (run the reviewed source inside tracy-host) ────────────────────
//
// 🔒 WHY THIS EXISTS. The CI runner reaches the fleet through the Docker daemon, but it does NOT
// necessarily mount TRACY_PRIVATE_ROOT — so an inventory run directly there would `lstat` a root it
// cannot see and report every site `root-unsafe`. The fleet's OWN management container (Compose
// project `tracy`, service `tracy-host`) is where that root is bound at the IDENTICAL host path, so
// the reviewed inventory source is piped, UNMODIFIED, into that one container on stdin and run there.
// Everything below is validated BEFORE the exec (the descendant reads); a failure is one of a fixed
// set of sanitized tokens, never a path, a label, or a raw docker error.

/** The fleet management stack's Compose identity — NOT a site's `web` service. */
export const HOST_PROJECT = 'tracy'
export const HOST_SERVICE = 'tracy-host'

/** A full (untruncated) container id, exactly as `docker ps --no-trunc` / `inspect .Id` report it. */
export const FULL_ID = /^[0-9a-f]{64}$/

/**
 * The ceiling for the ONE outer `--via-host` exec. It runs the WHOLE inner inventory, which itself
 * makes many docker calls each STILL bounded by {@link RUN_TIMEOUT_MS} — so this single call is given
 * a larger ceiling (comfortably above 15s) so a fleet of sites is not cut off mid-roll-call. No
 * individual call bound changes; only this outer transport is widened.
 */
export const HOST_EXEC_TIMEOUT_MS = 120_000

/**
 * List the RUNNING containers that are EXACTLY the tracy-host service of the tracy project, as full
 * ids. Filtered by BOTH compose labels so a like-named container from another project is not caught.
 */
export function psHostArgv() {
  return [
    'ps',
    '--no-trunc',
    '--filter',
    `label=com.docker.compose.project=${HOST_PROJECT}`,
    '--filter',
    `label=com.docker.compose.service=${HOST_SERVICE}`,
    '--format',
    '{{.ID}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}'
  ]
}

/**
 * The full ids of rows that are BOTH the tracy project AND the tracy-host service AND a full id. The
 * daemon filter already narrows this, but the labels and id shape are RE-checked here so a malformed
 * or partially-labelled row is dropped, never trusted into an exec.
 */
export function parseHostPs(stdout) {
  const ids = []
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.trim()) continue
    const [id, project, service] = line.split('\t')
    const trimmed = String(id ?? '').trim()
    if (project === HOST_PROJECT && service === HOST_SERVICE && FULL_ID.test(trimmed)) ids.push(trimmed)
  }
  return ids
}

/** Inspect the host container for the minimal identity fields, one JSON primitive per line. */
export function inspectHostArgv(container) {
  const format = [
    '{{json .Id}}',
    '{{json .State.Running}}',
    '{{json .Config.Labels}}',
    '{{json .Config.Env}}',
    '{{json .Mounts}}'
  ].join('\n')
  return ['inspect', '--format', format, container]
}

/** Parse the five-line {@link inspectHostArgv} output; a malformed line becomes a safe empty value. */
export function parseHostInspect(stdout) {
  const lines = String(stdout ?? '').split('\n')
  const at = (i) => {
    try {
      return JSON.parse(lines[i])
    } catch {
      return null
    }
  }
  const id = at(0)
  const labels = at(2)
  const env = at(3)
  const mounts = at(4)
  return {
    id: typeof id === 'string' ? id : '',
    running: at(1) === true,
    labels: labels && typeof labels === 'object' ? labels : {},
    env: Array.isArray(env) ? env : [],
    mounts: Array.isArray(mounts) ? mounts : []
  }
}

/** The container's compose identity must be EXACTLY the tracy-host service of the tracy project. */
export function evaluateHostLabels(labels) {
  const l = labels && typeof labels === 'object' ? labels : {}
  if (l['com.docker.compose.project'] !== HOST_PROJECT) return 'project-mismatch'
  if (l['com.docker.compose.service'] !== HOST_SERVICE) return 'service-mismatch'
  return 'ok'
}

/**
 * Read TRACY_PRIVATE_ROOT out of a `.Config.Env` array (`KEY=value` strings). Returns null if it is
 * unset OR set more than once — a duplicated env entry is ambiguous (which one is authoritative?), so
 * it is refused rather than silently resolved to the first (or last) occurrence.
 */
export function privateRootFromEnv(env) {
  let value = null
  let count = 0
  for (const entry of Array.isArray(env) ? env : []) {
    if (typeof entry !== 'string') continue
    const eq = entry.indexOf('=')
    if (eq <= 0) continue
    if (entry.slice(0, eq) === 'TRACY_PRIVATE_ROOT') {
      value = entry.slice(eq + 1)
      count++
    }
  }
  return count === 1 ? value : null
}

/**
 * Return a configured private root ONLY if it is already the canonical, trustworthy path this
 * inventory will pin the inner run to, else null. It must be absolute, carry no control character
 * (NUL, newline, etc. — one could split a log line or a path), contain no empty / `.` / `..` segment
 * (a dot segment is REFUSED, never resolved/collapsed), NOT be the filesystem root `/` (a bind at `/`
 * would expose the whole host), AND the ORIGINAL string must already equal that canonical form — a
 * trailing or duplicate slash is rejected, not normalised away, so what is validated is what is used.
 */
export function normalizeRoot(root) {
  const s = String(root ?? '')
  if (!s.startsWith('/')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(s)) return null
  const parts = []
  for (const seg of s.split('/')) {
    if (seg === '') continue // an empty segment means a leading/trailing/duplicate slash
    if (seg === '.' || seg === '..') return null // no dot segments — the caller's path must be canonical
    parts.push(seg)
  }
  if (parts.length === 0) return null // that is `/` — refused (non-root required)
  const canonical = `/${parts.join('/')}`
  return s === canonical ? canonical : null // the original must ALREADY be normalized
}

/**
 * The host container must bind the private root at the IDENTICAL path (source === destination ===
 * root) as a real bind — the "same-source/destination" bind that makes the host path the docker
 * daemon reports for a site's mount equal to the path the inner run `lstat`s inside this container.
 * @returns {'ok'|'missing'|'not-bind'|'source-mismatch'}
 */
export function evaluateHostRootBind(mounts, root) {
  const m = (Array.isArray(mounts) ? mounts : []).find((x) => x && x.Destination === root)
  if (!m) return 'missing'
  if (m.Type !== 'bind') return 'not-bind'
  if (m.Source !== root) return 'source-mismatch'
  return 'ok'
}

/**
 * The docker sub-argv that runs the reviewed source (fed on stdin, `-`) inside the host container. No
 * shell, no `-u` override — the inner run inherits the container's own uid and env, and reads only.
 */
export function execHostArgv(container, innerArgs = []) {
  return ['exec', '-i', container, 'node', '--input-type=module', '-', ...innerArgs]
}

/** Only the fixed transport reasons survive to the shared log; anything else collapses to `host-error`. */
export function sanitizeHostReason(reason) {
  const known = [
    'host-ps-failed',
    'no-host-container',
    'ambiguous-host-container',
    'host-inspect-failed',
    'host-inspect-timeout',
    'host-id-mismatch',
    'host-not-running',
    'host-label-mismatch',
    'root-unsafe',
    'root-bind-unsafe',
    'source-unavailable',
    'host-exec-failed',
    'host-exec-timeout',
    'inner-unparseable'
  ]
  return known.includes(reason) ? reason : 'host-error'
}

/** A fixed-shape, path-free transport error the caller prints in place of a report. */
export function hostError(reason) {
  return {
    kind: 'emdash-token-inventory',
    version: 1,
    readOnly: true,
    transport: 'via-host',
    error: sanitizeHostReason(reason)
  }
}

/** Parse the inner run's stdout as the sanitized report it must be, or null if it is anything else. */
export function parseInnerReport(stdout) {
  const s = String(stdout ?? '').trim()
  if (!s) return null
  let obj
  try {
    obj = JSON.parse(s)
  } catch {
    return null
  }
  return obj && obj.kind === 'emdash-token-inventory' ? obj : null
}

/**
 * Locate the ONE running tracy-host container, validate its full id, compose labels, running state,
 * normalised non-root private root and identical-path root bind, and only THEN pipe the reviewed
 * inventory `source` into it on stdin and run it there (pinned to the validated root). Returns the
 * inner sanitized report tagged `transport: 'via-host'`, or a fixed-shape transport error. It never
 * throws for an expected failure and never emits a path, a label, or a raw docker error.
 *
 * @param {object} [config]
 * @param {(i: { argv: readonly string[], stdin?: string }) => Promise<{code: number|null, stdout: string, stderr: string, timedOut: boolean}>} [config.run]
 * @param {string} [config.source] - the reviewed checkout inventory source, fed UNMODIFIED on stdin
 * @param {boolean} [config.truncate]
 */
export async function runHostInventory({ run = defaultRun, source, truncate = false } = {}) {
  const psRes = await run({ argv: psHostArgv() })
  if (psRes.code !== 0 || psRes.timedOut) return hostError('host-ps-failed')
  const ids = parseHostPs(psRes.stdout)
  if (ids.length === 0) return hostError('no-host-container')
  // 🔒 A duplicate management container is an ambiguity to surface, never one to pick and exec into.
  if (ids.length > 1) return hostError('ambiguous-host-container')
  const id = ids[0]

  const insRes = await run({ argv: inspectHostArgv(id) })
  if (insRes.code !== 0 || insRes.timedOut)
    return hostError(insRes.timedOut ? 'host-inspect-timeout' : 'host-inspect-failed')
  const ins = parseHostInspect(insRes.stdout)
  // 🔒 Full-id agreement (the id we execed against is the id inspect reports), running, exact compose
  // labels, a trusted normalised non-root root, and the identical-path bind — ALL before the exec.
  if (ins.id !== id || !FULL_ID.test(ins.id)) return hostError('host-id-mismatch')
  if (!ins.running) return hostError('host-not-running')
  if (evaluateHostLabels(ins.labels) !== 'ok') return hostError('host-label-mismatch')
  const root = normalizeRoot(privateRootFromEnv(ins.env))
  if (!root) return hostError('root-unsafe')
  if (evaluateHostRootBind(ins.mounts, root) !== 'ok') return hostError('root-bind-unsafe')

  if (typeof source !== 'string' || source.length === 0) return hostError('source-unavailable')
  const innerArgs = ['--root', root]
  if (truncate) innerArgs.push('--truncate')
  const execRes = await run({
    argv: execHostArgv(id, innerArgs),
    stdin: source,
    timeoutMs: HOST_EXEC_TIMEOUT_MS
  })
  if (execRes.timedOut) return hostError('host-exec-timeout')
  // A non-zero transport is a failure even if stdout looks like a report — a crashed process can
  // print a valid-looking line on its way down.
  if (execRes.code !== 0) return hostError('host-exec-failed')
  const report = parseInnerReport(execRes.stdout)
  if (!report) return hostError('inner-unparseable')
  return { ...report, transport: 'via-host' }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

function parseCliArgs(argv) {
  let privateRoot = process.env.TRACY_PRIVATE_ROOT || DEFAULT_PRIVATE_ROOT
  let truncate = false
  let viaHost = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) privateRoot = argv[++i]
    else if (argv[i] === '--truncate') truncate = true
    else if (argv[i] === '--via-host') viaHost = true
    else return { error: 'bad-arguments' }
  }
  return { privateRoot, truncate, viaHost }
}

// The entry fires both when invoked as a file (`node …/inventory.mjs`) AND when the reviewed source
// is fed on stdin (`node --input-type=module -`, where argv[1] is `-`) — that stdin case is exactly
// how `--via-host` runs THIS source inside the tracy-host container. An `import` from a test leaves
// argv[1] as the test file, so neither branch fires there.
const entry = process.argv[1]
if ((entry && entry.endsWith('inventory.mjs')) || entry === '-') {
  const opts = parseCliArgs(process.argv.slice(2))
  if (opts.error) {
    // A fixed category only — never echo an argument, which could carry a path.
    process.stderr.write(
      'INVENTORY_ERROR bad-arguments (use: inventory.mjs [--root DIR] [--truncate] [--via-host])\n'
    )
    process.exitCode = 1
  } else if (opts.viaHost) {
    // The runner cannot see TRACY_PRIVATE_ROOT, so the reviewed source runs INSIDE the tracy-host
    // container (see runHostInventory). A report is ALWAYS produced — a transport failure is a fixed
    // `error` enum inside it, never a raw throw — so the workflow summary always renders.
    let report
    try {
      const source = readFileSync(fileURLToPath(import.meta.url), 'utf8')
      report = await runHostInventory({ truncate: opts.truncate, source })
    } catch {
      report = hostError('source-unavailable')
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    // The sanitized report is still emitted (the workflow tees it into the summary), but a transport
    // failure must make the step go red rather than pass silently on an empty roll-call.
    if (report.error) process.exitCode = 1
  } else {
    try {
      const report = await runInventory(opts)
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } catch {
      // runInventory itself is fail-closed per site; a top-level throw is a fixed category, never a
      // raw message that could carry a spawn/readdir path.
      process.stderr.write('INVENTORY_ERROR scan-failed\n')
      process.exitCode = 1
    }
  }
}
