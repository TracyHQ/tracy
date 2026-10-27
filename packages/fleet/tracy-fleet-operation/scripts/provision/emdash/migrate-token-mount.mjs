#!/usr/bin/env node
/**
 * migrate-token-mount — a BOUNDED, ONE-SITE migration that gives ONE existing EmDash site the #155
 * read-only agent-token bind mount it predates, and NOTHING more (ahead of PR #162). It is the
 * separately-reviewed APPLY the inventory (`inventory.mjs`) deliberately refuses to be.
 *
 * 🔒 SELF-CONTAINED ON PURPOSE. This file imports ONLY Node built-ins. It is run three ways — as a
 * file, and (for `--via-host`) piped into the tracy-host container on stdin as
 * `node --input-type=module -`. A stdin module has NO path, so a relative `import './inventory.mjs'`
 * would die `ERR_MODULE_NOT_FOUND` before it did anything (measured), and importing it would ALSO
 * fire the inventory's own CLI. So every reviewed dependency is INLINED here (parity-copied from
 * `inventory.mjs`), and nothing is fetched from, or written into, the running image.
 *
 * 🔒 WHAT THIS SCRIPT MUST NEVER DO: mint/rotate/finalize/delete a token, create a user, change the
 * database/schema/content, remove the legacy in-container copy, re-render the whole compose, weaken an
 * ownership/drift check, or auto-apply to more than one site. It inserts ONE list item — the exact
 * `./tracy-agent.token:/run/tracy-agent.token:ro` render-compose emits — into the web service's
 * `volumes:` block, proves via `docker compose config` that the resolved config differs by EXACTLY
 * that mount and nothing else, and recreates the web container only.
 *
 * 🔒 IT ALSO REBINDS A MOUNT THAT IS STALE — the second shape of "the reader has no usable token",
 * and the one `docker inspect` cannot see. A host token REPLACED rather than rewritten leaves the
 * container on the old inode behind a mount that inspects perfectly, which is exactly what the
 * staged recovery produces if the credential is written with `mv`. The mounted file is therefore
 * digested in the container and compared with the host token's digest (`MOUNT_DIGEST_SCRIPT`); a
 * mismatch is a planned `--force-recreate` of the web container, not a `noop-already-migrated`,
 * and the rebind is PROVEN by the same digest afterwards before the apply reports success. No
 * token bytes are written in either case.
 *
 * 🔒 THE TOKEN IS NEVER TOUCHED, NEVER LEAKED. Its bytes/inode/owner/mode are preserved; it is read
 * only through a privileged O_NOFOLLOW regular-file custody check; it reaches the container ONLY on
 * stdin; it appears in no argv/env/log and in no report field. After the apply its inode AND a hash of
 * its bytes are re-checked to be unchanged.
 *
 * 🔒 DRIFT IS PROVEN, NOT ASSUMED (the guards the DNS-alias migration established):
 *   - the running container is re-discovered by its Compose project+service labels (its ID changes on
 *     every recreate — a captured ID would inspect a dead container), pinned to a full CID, and its
 *     inspect .Id/ownership re-validated AFTER every recreate;
 *   - the IMMUTABLE image id (.Image) is validated; a mutable tag that now resolves elsewhere is
 *     refused (`--pull never` does not pin a running image);
 *   - the running `com.docker.compose.config-hash` must equal `docker compose config --hash web` of
 *     the file+env on disk (proves it was created from THIS config, not older/pending changes — #162),
 *     and the recreated container must carry the CANDIDATE hash;
 *   - all of file bytes/mode, resolved config-hash, image tag/ID, runtime identity and token
 *     inode/custody/hash are RE-validated under the lock immediately before the swap.
 *
 * 🔒 ROLLBACK IS DRIFT-AWARE AND HONEST. It checks the on-disk bytes are still the candidate it wrote
 * (never clobbering a concurrent edit), restores the ORIGINAL bytes+mode atomically from its OWN
 * backup, re-resolves the original config/image, re-discovers the CID, recreates, and re-proves the
 * original runtime + authenticated endpoint — or reports `rollback-incomplete` (never a false
 * success). A recreate that happened without a file patch is a real mutation, reported as such.
 *
 * 🔒 THE VIA-HOST TRANSPORT. `--via-host` locates the ONE running tracy-host container, validates it
 * (full id, compose labels, running, a normalised non-root private root, an identical-path root bind),
 * and pipes THIS reviewed source, UNMODIFIED, into it on stdin — pinned to that validated root. It
 * does NOT deploy the new dsh reader.
 *
 *   migrate-token-mount.mjs --selector <sha256hex> [--apply] [--root DIR] [--via-host]
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { fileURLToPath } from 'node:url'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
//  Inlined, parity-copied primitives (from inventory.mjs) — so the stdin transport carries everything.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** The private root's default — the same value `scripts/lib/roots.sh` pins (`TRACY_PRIVATE_ROOT`). */
export const DEFAULT_PRIVATE_ROOT = '/srv/tracy'

/** A fleet label, exactly as provision's `SAFE_LABEL` holds it before it reaches a path/container. */
export const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** The site's directory under the PRIVATE root — its compose working dir and the bind source root. */
export function siteDir(privateRoot, label) {
  return `${privateRoot}/${label}`
}
/** The site's token file, root-owned 0600, under the PRIVATE root. */
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
/** The site's compose file — the ONE file this migration ever writes. */
export function hostComposePath(privateRoot, label) {
  return `${privateRoot}/${label}/docker-compose.yml`
}

/** Where the token is bound READ-ONLY inside the web container (#155). */
export const CONTAINER_TOKEN_PATH = '/run/tracy-agent.token'
/** Where `./data` is bound inside the web container. */
export const CONTAINER_DATA_PATH = '/app/data'
/** The database path inside the web container. */
export const CONTAINER_DB_PATH = '/app/data/data.db'

/** The opaque per-site selector: sha256 of the label, never the label itself. */
export function selectorFor(label, { truncate = false } = {}) {
  const hex = createHash('sha256').update(String(label), 'utf8').digest('hex')
  return truncate ? hex.slice(0, 32) : hex
}

/** A selector is sha256(label), full (64 hex) or truncated (32 hex) — nothing else is even resolved. */
export const SELECTOR_RE = /^[0-9a-f]{32}$|^[0-9a-f]{64}$/

/** The PAT shape the reader accepts — the same `^ec_pat_…$` the in-container MCP script enforces. */
export const PAT_RE = /^ec_pat_[A-Za-z0-9_-]{16,}$/

/** A full (untruncated) container id, exactly as `docker ps --no-trunc` / `inspect .Id` report it. */
export const FULL_ID = /^[0-9a-f]{64}$/

export const RUN_TIMEOUT_MS = 15_000
export const RUN_MAX_BUFFER = 1 << 20

/** The fleet management stack's Compose identity. */
export const HOST_PROJECT = 'tracy'
export const HOST_SERVICE = 'tracy-host'

// 🔒 THE WHOLE INNER NODE IS BOUNDED IN-CONTAINER, not just the docker client. `docker exec`'s client
// timeout only kills the CLIENT — the exec'd process keeps running in the container. So the inner node
// is wrapped in GNU `timeout` INSIDE tracy-host: TERM after {@link HOST_INNER_TERM_S} (the inner CLI's
// SIGTERM handler flips its abort flag → a checkpointed drift-aware rollback), then, if it has not
// exited within {@link HOST_INNER_KILL_S} of grace, KILL.
//   ⚠ HONEST LIMITATION: a KILL (grace exceeded) or a host SIGKILL cannot be trapped — that hard-kill
//     window may leave a half-applied swap for the next run to detect. AND a daemon-side `docker compose
//     up` the inner node already dispatched runs in the DAEMON, not as the node's child, so neither the
//     TERM nor the client timeout cancels compose work already in flight; the next run's under-lock
//     revalidation is what catches the resulting drift.
export const HOST_INNER_TERM_S = 240
// 🔒 THE KILL GRACE MUST OUTLAST A FULL ROLLBACK. After TERM the inner run does a drift-aware rollback
// that runs its OWN `docker compose up` (bounded by {@link RECREATE_TIMEOUT_MS}) plus a readiness wait,
// so a grace shorter than that would KILL a legitimate rollback mid-recreate. Kept comfortably above one
// recreate (300s ≫ RECREATE_TIMEOUT_MS/1000 = 120s).
export const HOST_INNER_KILL_S = 300
// The outer client bound must outlast TERM + the rollback grace so the in-container timeout fires FIRST
// and the inner run gets to roll back before the client gives up.
export const HOST_EXEC_TIMEOUT_MS = (HOST_INNER_TERM_S + HOST_INNER_KILL_S + 60) * 1000

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

/** Classify a site POSITIVELY, and refuse to guess (image tag + a `data/data.db` on the host). */
export function classify({ image = '', hasDataDb = false } = {}) {
  const cls = imageClass(image)
  const emdashSignal = cls === 'emdash' || hasDataDb
  const phpSignal = cls === 'php'
  if (emdashSignal && phpSignal) return 'ambiguous'
  if (emdashSignal) return 'emdash'
  if (phpSignal) return 'not-emdash'
  return 'unknown'
}

/** Tie a container to the site it claims to be — Compose labels only. */
export function evaluateComposeIdentity(labels, label, privateRoot) {
  const l = labels && typeof labels === 'object' ? labels : {}
  if (l['com.docker.compose.project'] !== label) return 'project-mismatch'
  if (l['com.docker.compose.service'] !== 'web') return 'service-mismatch'
  if (l['com.docker.compose.project.working_dir'] !== siteDir(privateRoot, label)) return 'workdir-mismatch'
  const expected = `${siteDir(privateRoot, label)}/docker-compose.yml`
  const parts = String(l['com.docker.compose.project.config_files'] ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length !== 1 || parts[0] !== expected) return 'configfiles-mismatch'
  return 'ok'
}

/** Judge the container's token bind from `.Mounts`, against the host source #155 expects. */
export function evaluateMount(mounts, expectedSource) {
  const m = (Array.isArray(mounts) ? mounts : []).find((x) => x && x.Destination === CONTAINER_TOKEN_PATH)
  if (!m) return 'missing'
  if (m.Type !== 'bind') return 'not-bind'
  if (m.Source !== expectedSource) return 'source-mismatch'
  if (m.RW !== false) return 'not-readonly'
  return 'ok'
}

/** Confirm the container's `/app/data` is a bind of THIS site's data directory. */
export function evaluateDataSource(mounts, expectedSource) {
  const m = (Array.isArray(mounts) ? mounts : []).find((x) => x && x.Destination === CONTAINER_DATA_PATH)
  if (!m) return 'missing'
  if (m.Type !== 'bind') return 'not-bind'
  if (m.Source !== expectedSource) return 'source-mismatch'
  return 'ok'
}

/** Read TRACY_PRIVATE_ROOT out of a `.Config.Env` array; null when unset OR set more than once. */
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

/** Accept ONLY an already-canonical absolute non-root path with no control character. */
export function normalizeRoot(root) {
  const s = String(root ?? '')
  if (!s.startsWith('/')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(s)) return null
  const parts = []
  for (const seg of s.split('/')) {
    if (seg === '') continue
    if (seg === '.' || seg === '..') return null
    parts.push(seg)
  }
  if (parts.length === 0) return null
  const canonical = `/${parts.join('/')}`
  return s === canonical ? canonical : null
}

/** The host container must bind the private root at the IDENTICAL path (source===destination===root). */
export function evaluateHostRootBind(mounts, root) {
  const m = (Array.isArray(mounts) ? mounts : []).find((x) => x && x.Destination === root)
  if (!m) return 'missing'
  if (m.Type !== 'bind') return 'not-bind'
  if (m.Source !== root) return 'source-mismatch'
  return 'ok'
}

export function evaluateHostLabels(labels) {
  const l = labels && typeof labels === 'object' ? labels : {}
  if (l['com.docker.compose.project'] !== HOST_PROJECT) return 'project-mismatch'
  if (l['com.docker.compose.service'] !== HOST_SERVICE) return 'service-mismatch'
  return 'ok'
}

// ── the READ-ONLY DB reader (parity-copied; runs as www-data inside the site container) ────────────

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

export function dbArgv(container) {
  return ['exec', '-i', '-u', 'www-data', container, 'node', '--input-type=module', '-', CONTAINER_DB_PATH]
}
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
export function sanitizeDbReason(reason) {
  const known = ['no-sqlite', 'open-failed', 'query-failed', 'unparseable', 'no-output', 'transport']
  return known.includes(reason) ? reason : 'read-failed'
}
export function sanitizeDbResult(parsed) {
  if (!parsed || !parsed.ok) return { status: 'error', reason: sanitizeDbReason(parsed?.reason) }
  if (parsed.schema === 'incomplete') return { status: 'schema-incomplete' }
  if (parsed.schema !== 'ok') return { status: 'error', reason: 'unparseable' }
  const agentEnum = ['active-unique', 'ambiguous', 'missing', 'disabled', 'not-admin']
  return { status: 'readable', agent: agentEnum.includes(parsed.agent) ? parsed.agent : 'unknown' }
}
/** The unique-active-admin verdict, folded to a fixed enum. */
export function adminVerdict(dbResult) {
  const clean = sanitizeDbResult(dbResult)
  return clean.status === 'readable' ? clean.agent : clean.status
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
//  Migration-specific constants + argv builders (pure)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export const KIND = 'emdash-token-mount-migrate'
export const DEFAULT_TOKEN_SOURCE = './tracy-agent.token'
export const TOKEN_MOUNT_ITEM = `- ${DEFAULT_TOKEN_SOURCE}:${CONTAINER_TOKEN_PATH}:ro`
export const EMDASH_MCP_LOOPBACK = 'http://127.0.0.1:4321/_emdash/api/mcp'
export const AUTH_FETCH_ABORT_MS = 30_000
export const AUTH_EXEC_TIMEOUT_MS = 45_000
export const RECREATE_TIMEOUT_MS = 120_000
export const CONFIG_TIMEOUT_MS = 60_000
export const READY_ATTEMPTS = 60
export const READY_SLEEP_MS = 2000

// 🔒 The in-container MCP auth source — fixed code, argv for the (non-secret) mode keyword only. It
// reads the token from STDIN (`stdin` mode, before the mount exists) or from the read-only mount with
// O_NOFOLLOW+fstat (`mount` mode, after recreation), POSTs `tools/list` with redirects REFUSED, and
// writes only a sanitized status line — never the token, never the body, never a raw error. It bounds
// its OWN fetch (killing the docker client does not stop this remote process).
export const AUTH_SCRIPT =
  'const fs=require("fs");const mode=process.argv[1]||"mount";' +
  'const RE=/^ec_pat_[A-Za-z0-9_-]{16,}$/;' +
  'function fromMount(){let fd;try{fd=fs.openSync(' +
  JSON.stringify(CONTAINER_TOKEN_PATH) +
  ',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)}catch(e){return null}' +
  'try{const st=fs.fstatSync(fd);if(!st.isFile())return null;return fs.readFileSync(fd,"utf8").trim()}' +
  'catch(e){return null}finally{try{fs.closeSync(fd)}catch(e){}}}' +
  'function go(tok){if(!RE.test(tok||"")){process.stdout.write("TRACY_TMAUTH_ERR NO_TOKEN\\n");process.exit(0)}' +
  'var body=JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list",params:{}});' +
  'fetch(' +
  JSON.stringify(EMDASH_MCP_LOOPBACK) +
  ',{method:"POST",redirect:"error",signal:AbortSignal.timeout(' +
  AUTH_FETCH_ABORT_MS +
  '),headers:{authorization:"Bearer "+tok,"content-type":"application/json",' +
  'accept:"application/json, text/event-stream","X-EmDash-Request":"1"},body:body})' +
  '.then(function(r){return r.text().then(function(x){var v="bad-body";' +
  'var ls=String(x).split(/\\r?\\n/).filter(function(l){return l.indexOf("data:")===0})' +
  '.map(function(l){return l.slice(5).trim()}).filter(Boolean);' +
  'var p=ls.length?ls[ls.length-1]:String(x).trim();' +
  'try{var j=JSON.parse(p);v=(j&&j.result&&!j.error)?"ok":"rpc-error"}catch(e){v="bad-body"}' +
  'process.stdout.write("TRACY_TMAUTH "+r.status+" "+v+"\\n")})})' +
  '.catch(function(){process.stdout.write("TRACY_TMAUTH_ERR SITE transport\\n")})}' +
  'if(mode==="stdin"){var b="";process.stdin.on("data",function(d){b+=d});process.stdin.on("end",function(){go(b.trim())})}' +
  'else{go(fromMount())}'

export function authArgv({ container, mode }) {
  const argv = ['exec']
  if (mode === 'stdin') argv.push('-i')
  argv.push('-u', '0', container, 'node', '-e', AUTH_SCRIPT, mode)
  return argv
}

/**
 * Fold an auth exec result. 🔒 REQUIRES a clean transport (exit 0, no timeout): a valid-looking
 * stdout from a process that then crashed is NOT proof. `authenticated` needs HTTP 200 + ok.
 */
export function readAuthResult(res) {
  if (!res || res.timedOut) return { authenticated: false, verdict: 'timeout' }
  if (res.code !== 0) return { authenticated: false, verdict: 'exec-failed' }
  const s = String(res.stdout ?? '').trim()
  if (s.startsWith('TRACY_TMAUTH_ERR ')) {
    const raw = s.slice('TRACY_TMAUTH_ERR '.length).trim()
    return { authenticated: false, verdict: raw.startsWith('NO_TOKEN') ? 'no-token' : 'transport' }
  }
  if (s.startsWith('TRACY_TMAUTH ')) {
    const parts = s.slice('TRACY_TMAUTH '.length).trim().split(/\s+/)
    const status = Number(parts[0])
    const verdict = parts[1] ?? ''
    return {
      authenticated: status === 200 && verdict === 'ok',
      verdict:
        status === 200 && verdict === 'ok'
          ? 'authenticated'
          : `status-${Number.isFinite(status) ? status : 0}`
    }
  }
  return { authenticated: false, verdict: 'unparseable' }
}

/**
 * 🔒 WHICH CREDENTIAL THE MOUNT ACTUALLY HOLDS — the question `authMounted` cannot answer.
 *
 * Docker resolves a bind source ONCE, at container create time, to an inode. A host token replaced
 * rather than rewritten (`mv`, or delete-and-recreate — what `mint-agent-token.sh` does outside the
 * protected path, and what a hurried hand-repair does) leaves the container holding the OLD inode
 * while `docker inspect` still reports the right source path, the right destination and `ro`. The
 * mount looks perfect and the reader is reading a different secret.
 *
 * That gap is not academic — it is exactly the staged-recovery sequence: stage a new credential,
 * write the host file, run this tool. If the old credential is already revoked the run dies at
 * `mounted-auth-failed` with no hint that a rebind is what is missing; if the old one is still
 * live, BOTH auth probes pass with TWO DIFFERENT tokens, the tool reports `noop-already-migrated`,
 * and `finalize` then revokes the one the reader is really using. Silent, and after the fact.
 *
 * So the mounted file is digested IN the container and compared with a digest of the host token.
 * A digest, not the value: the comparison is exact and nothing secret crosses the exec boundary in
 * either direction. Fixed code, no argv, one sanitized line out, and O_NOFOLLOW+fstat like the
 * auth reader — a symlink or non-regular file at the mount path is `no-token`, never followed.
 */
export const MOUNT_DIGEST_SCRIPT =
  'const fs=require("fs"),c=require("crypto");let fd;' +
  'try{fd=fs.openSync(' +
  JSON.stringify(CONTAINER_TOKEN_PATH) +
  ',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)}' +
  'catch(e){process.stdout.write("TRACY_TMDIGEST_ERR no-token\\n");process.exit(0)}' +
  'try{const st=fs.fstatSync(fd);' +
  'if(!st.isFile()){process.stdout.write("TRACY_TMDIGEST_ERR no-token\\n");process.exit(0)}' +
  'const v=fs.readFileSync(fd,"utf8").trim();' +
  'if(!v){process.stdout.write("TRACY_TMDIGEST_ERR no-token\\n");process.exit(0)}' +
  'process.stdout.write("TRACY_TMDIGEST "+c.createHash("sha256").update(v).digest("hex")+"\\n")}' +
  'catch(e){process.stdout.write("TRACY_TMDIGEST_ERR read-error\\n")}' +
  'finally{try{fs.closeSync(fd)}catch(e){}}'

export function mountDigestArgv(container) {
  return ['exec', '-u', '0', container, 'node', '-e', MOUNT_DIGEST_SCRIPT]
}

/** The digest of the credential a HOST token read names — the same input the container digests. */
export function tokenDigest(token) {
  return createHash('sha256')
    .update(String(token ?? ''))
    .digest('hex')
}

/**
 * Fold a digest exec. Like `readAuthResult`, a clean transport is required: stdout that looks right
 * from a process that then crashed proves nothing about the file it claims to have read.
 */
export function readDigestResult(res) {
  if (!res || res.timedOut) return { ok: false, reason: 'timeout' }
  if (res.code !== 0) return { ok: false, reason: 'exec-failed' }
  const s = String(res.stdout ?? '').trim()
  if (s.startsWith('TRACY_TMDIGEST_ERR ')) {
    const raw = s.slice('TRACY_TMDIGEST_ERR '.length).trim()
    return { ok: false, reason: raw === 'no-token' ? 'no-token' : 'read-error' }
  }
  const m = /^TRACY_TMDIGEST ([0-9a-f]{64})$/.exec(s)
  return m ? { ok: true, digest: m[1] } : { ok: false, reason: 'unparseable' }
}

/** Re-discover the ONE web container for a project by its compose labels (its ID changes on recreate). */
export function discoverWebArgv(project, service = 'web') {
  return [
    'ps',
    '--no-trunc',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--filter',
    `label=com.docker.compose.service=${service}`,
    '--format',
    '{{.ID}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}'
  ]
}
export function parseWebPs(stdout, project, service = 'web') {
  const ids = []
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.trim()) continue
    const [id, p, s] = line.split('\t')
    const t = String(id ?? '').trim()
    if (p === project && s === service && FULL_ID.test(t)) ids.push(t)
  }
  return ids
}

/** Inspect the web container for the fields the migration pins, one JSON primitive per line. */
export function webInspectArgv(container) {
  const format = [
    '{{json .Id}}',
    '{{json .Image}}', // the IMMUTABLE image id
    '{{json .Config.Image}}', // the mutable tag/ref
    '{{json .State.Running}}',
    // No healthcheck → no Health key. `index` yields null for a missing key; a field access (even
    // inside `if`) fails the whole inspect on the Docker CLI 27.x inside tracy-host (measured 24/09).
    '{{json (index .State "Health")}}',
    '{{json .Config.Labels}}',
    '{{json .Mounts}}'
  ].join('\n')
  return ['inspect', '--format', format, container]
}
export function parseWebInspect(stdout) {
  const lines = String(stdout ?? '').split('\n')
  const at = (i) => {
    try {
      return JSON.parse(lines[i])
    } catch {
      return null
    }
  }
  const id = at(0)
  const imageId = at(1)
  const imageRef = at(2)
  const labels = at(5)
  const mounts = at(6)
  return {
    id: typeof id === 'string' ? id : '',
    imageId: typeof imageId === 'string' ? imageId : '',
    imageRef: typeof imageRef === 'string' ? imageRef : '',
    running: at(3) === true,
    health: at(4),
    labels: labels && typeof labels === 'object' ? labels : {},
    mounts: Array.isArray(mounts) ? mounts : []
  }
}
export function containerConfigHash(labels) {
  const l = labels && typeof labels === 'object' ? labels : {}
  return typeof l['com.docker.compose.config-hash'] === 'string' ? l['com.docker.compose.config-hash'] : ''
}
export function healthOk(inspect) {
  if (!inspect.running) return false
  const h = inspect.health && typeof inspect.health === 'object' ? inspect.health.Status : null
  return h === 'healthy' || h === undefined || h === null || h === 'none'
}

/** The `docker compose` base argv for the site's stack — explicit project dir/file/name. */
function composeBaseArgv({ projectDir, composeFile, project }) {
  return ['compose', '--project-directory', projectDir, '-f', composeFile, '--project-name', project]
}
/** Resolved config JSON (holds secrets — NEVER logged/written; parsed in memory only). */
export function composeConfigJsonArgv(opts) {
  return [...composeBaseArgv(opts), 'config', '--format', 'json']
}
/** The compose config-hash of one service — the same value compose stamps on the container. */
export function composeConfigHashArgv(opts) {
  return [...composeBaseArgv(opts), 'config', '--hash', opts.service ?? 'web']
}
export function parseConfigHash(stdout, service = 'web') {
  for (const line of String(stdout ?? '').split('\n')) {
    const [s, h] = line.trim().split(/\s+/)
    if (s === service && h) return h
  }
  return ''
}
/** Resolve a mutable image reference to its immutable local image id. */
export function imageIdArgv(ref) {
  return ['image', 'inspect', ref, '--format', '{{.Id}}']
}
/** The web-only recreate: no-deps, no-build, pull never, explicit project dir + file. */
export function composeUpArgv({ projectDir, composeFile, project, service = 'web', force = false }) {
  return [
    ...composeBaseArgv({ projectDir, composeFile, project }),
    'up',
    '-d',
    '--no-deps',
    '--no-build',
    '--pull',
    'never',
    // 🔒 `--force-recreate` ONLY for a rebind, and it is the whole mechanism there. When the compose
    // file gains the mount, its config hash changes and compose recreates on its own; when the file
    // is already correct and the RUNNING container merely holds a stale token inode, the config is
    // identical — so a plain `up -d` is a no-op and the bind would never be resolved again.
    ...(force ? ['--force-recreate'] : []),
    service
  ]
}

// ── the resolved-config token classification + candidate diff (structural, not regex) ─────────────

export function resolveSrc(src, siteDirPath) {
  let s = String(src ?? '').trim()
  if (s.startsWith('/')) return s.replace(/\/+$/, '')
  if (s.startsWith('./')) s = s.slice(2)
  return `${siteDirPath}/${s}`.replace(/\/+$/, '')
}

/** The web service's resolved volumes that target the token path (compose normalises to objects). */
export function tokenVolumesOf(configJson, service) {
  const vols = configJson?.services?.[service]?.volumes
  const hits = []
  for (const v of Array.isArray(vols) ? vols : []) {
    if (v && v.target === CONTAINER_TOKEN_PATH) {
      hits.push({ type: v.type, source: String(v.source ?? ''), readOnly: v.read_only === true })
    }
  }
  return hits
}

/**
 * Classify the token mount from the RESOLVED config (structural, never a regex guess). A duplicate
 * destination or a long-form mapping with the wrong source/mode is a `conflict`, not weakened away.
 * @returns {'absent'|'equivalent'|'conflict'}
 */
export function classifyConfigToken(configJson, service, siteDirPath, expectedHostToken) {
  const hits = tokenVolumesOf(configJson, service)
  if (hits.length === 0) return 'absent'
  if (hits.length > 1) return 'conflict'
  const h = hits[0]
  return h.type === 'bind' && resolveSrc(h.source, siteDirPath) === expectedHostToken && h.readOnly
    ? 'equivalent'
    : 'conflict'
}

/** Recursively sort object keys so two structurally-equal documents stringify identically. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key])
    return out
  }
  return value
}

/**
 * Prove the candidate resolved config differs from the original by EXACTLY the one added token bind
 * and nothing else. Returns { ok: true } or { ok: false, reason }.
 */
export function diffOnlyTokenMount(originalCfg, candidateCfg, service, siteDirPath, expectedHostToken) {
  const before = tokenVolumesOf(originalCfg, service)
  const after = tokenVolumesOf(candidateCfg, service)
  if (before.length !== 0) return { ok: false, reason: 'original-already-has-token' }
  if (after.length !== 1) return { ok: false, reason: 'candidate-token-count' }
  const h = after[0]
  if (!(h.type === 'bind' && resolveSrc(h.source, siteDirPath) === expectedHostToken && h.readOnly))
    return { ok: false, reason: 'candidate-token-not-equivalent' }
  const strip = (cfg) => {
    const c = structuredClone(cfg)
    const vols = c?.services?.[service]?.volumes
    if (Array.isArray(vols))
      c.services[service].volumes = vols.filter((v) => !(v && v.target === CONTAINER_TOKEN_PATH))
    return c
  }
  const a = JSON.stringify(canonical(strip(originalCfg)))
  const b = JSON.stringify(canonical(strip(candidateCfg)))
  return a === b ? { ok: true } : { ok: false, reason: 'candidate-differs-elsewhere' }
}

// ── the compose TEXT patch (line insertion only; validated afterwards by `docker compose config`) ──

function indentOf(line) {
  return line.length - line.trimStart().length
}
/**
 * Locate the web service's `volumes:` list, scoped so the top-level `volumes:` is never mistaken for
 * it. Returns { itemIndent, lastItemIndex } or null (an unknown shape — the caller refuses).
 */
export function findWebVolumes(lines) {
  let i = 0
  while (i < lines.length && !/^services:\s*$/.test(lines[i])) i++
  if (i >= lines.length) return null
  let webStart = -1
  for (i += 1; i < lines.length; i++) {
    const ln = lines[i]
    if (ln.trim() === '') continue
    const ind = indentOf(ln)
    if (ind === 0) break
    if (ind === 2 && /^\s{2}web:\s*$/.test(ln)) {
      webStart = i
      break
    }
  }
  if (webStart < 0) return null
  let volIndex = -1
  for (i = webStart + 1; i < lines.length; i++) {
    const ln = lines[i]
    if (ln.trim() === '') continue
    const ind = indentOf(ln)
    if (ind <= 2) break
    if (ind === 4 && /^\s{4}volumes:\s*$/.test(ln)) {
      volIndex = i
      break
    }
  }
  if (volIndex < 0) return null
  let itemIndent = 6
  let lastItemIndex = volIndex
  for (i = volIndex + 1; i < lines.length; i++) {
    const ln = lines[i]
    if (ln.trim() === '') continue
    const ind = indentOf(ln)
    if (ind <= 4) break
    if (!/^\s*-\s*/.test(ln)) break
    itemIndent = ind
    lastItemIndex = i
  }
  return { itemIndent, lastItemIndex }
}
/** Build the candidate text by inserting the ONE token item, or null on an unknown shape. */
export function buildCandidateText(text) {
  const lines = String(text ?? '').split('\n')
  const region = findWebVolumes(lines)
  if (!region) return null
  lines.splice(region.lastItemIndex + 1, 0, `${' '.repeat(region.itemIndent)}${TOKEN_MOUNT_ITEM}`)
  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
//  Impure seams
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** The one docker runner: no shell, bounded timeout+buffer, optional stdin. Replaced in tests. */
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
 * The filesystem seam. Every read of the token or the compose file uses O_NOFOLLOW (a symlinked final
 * component is refused, atomically). Temp files are created O_EXCL|O_NOFOLLOW with an explicit mode and
 * cleaned up. The token bytes are returned to the caller in memory and NEVER placed in a reason.
 */
export const defaultMigrateFs = {
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
      return readdirSync(path, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.isSymbolicLink())
        .map((d) => d.name)
    } catch {
      return null
    }
  },

  /** Read the protected host token via an atomic O_NOFOLLOW custody check. Returns bytes + inode + hash. */
  readHostToken(path) {
    let fd
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if (error && error.code === 'ELOOP') return { ok: false, reason: 'symlink' }
      if (error && error.code === 'ENOENT') return { ok: false, reason: 'missing' }
      return { ok: false, reason: 'open-error' }
    }
    try {
      const st = fstatSync(fd)
      if (!st.isFile()) return { ok: false, reason: 'not-regular' }
      if (st.uid !== 0) return { ok: false, reason: 'bad-owner' }
      if ((st.mode & 0o777) !== 0o600) return { ok: false, reason: 'bad-mode' }
      const buf = Buffer.alloc(st.size)
      let off = 0
      while (off < st.size) {
        const n = readSync(fd, buf, off, st.size - off, off)
        if (n <= 0) break
        off += n
      }
      const bytes = buf.subarray(0, off)
      const token = bytes.toString('utf8').trim()
      if (!PAT_RE.test(token)) return { ok: false, reason: 'bad-shape' }
      return { ok: true, token, inode: st.ino, hash: createHash('sha256').update(bytes).digest('hex') }
    } catch {
      return { ok: false, reason: 'read-error' }
    } finally {
      try {
        closeSync(fd)
      } catch {
        // closing a read descriptor cannot change the result.
      }
    }
  },

  /** Read the compose file through O_NOFOLLOW (reject a symlink / non-regular file); return bytes+mode. */
  readCompose(path) {
    let fd
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if (error && error.code === 'ELOOP') return { ok: false, reason: 'symlink' }
      if (error && error.code === 'ENOENT') return { ok: false, reason: 'missing' }
      return { ok: false, reason: 'open-error' }
    }
    try {
      const st = fstatSync(fd)
      if (!st.isFile()) return { ok: false, reason: 'not-regular' }
      const buf = Buffer.alloc(st.size)
      let off = 0
      while (off < st.size) {
        const n = readSync(fd, buf, off, st.size - off, off)
        if (n <= 0) break
        off += n
      }
      const text = buf.subarray(0, off).toString('utf8')
      return {
        ok: true,
        text,
        mode: st.mode & 0o777,
        hash: createHash('sha256').update(buf.subarray(0, off)).digest('hex')
      }
    } catch {
      return { ok: false, reason: 'read-error' }
    } finally {
      try {
        closeSync(fd)
      } catch {
        // no-op
      }
    }
  },

  /** A content hash of the file on disk (drift check), or '' if it cannot be read. */
  fileHash(path) {
    const r = this.readCompose(path)
    return r.ok ? r.hash : ''
  },

  /** Create an exclusive, no-follow temp file with an explicit mode, write text, close. */
  writeTemp(path, text, mode) {
    const fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      mode
    )
    try {
      writeSync(fd, text)
    } finally {
      closeSync(fd)
    }
  },

  /** Back the compose up exclusively (never clobber an existing backup), preserving nothing but 0600. */
  backup(src, dst) {
    copyFileSync(src, dst, constants.COPYFILE_EXCL)
  },

  /** Atomic swap within the directory (rename) — the caller has already staged the temp with its mode. */
  rename(src, dst) {
    renameSync(src, dst)
  },

  /**
   * Restore ORIGINAL bytes atomically from OUR backup, applying the ORIGINAL mode (the backup is 0600,
   * so it is not the mode reference). Stage exclusively, chmod, rename over the destination. Returns
   * true on success; the caller reports an incomplete rollback on false rather than throwing.
   */
  restoreCompose(backupPath, dst, mode, staged) {
    try {
      copyFileSync(backupPath, staged, constants.COPYFILE_EXCL)
      if (typeof mode === 'number') chmodSync(staged, mode)
      renameSync(staged, dst)
      return true
    } catch {
      this.remove(staged)
      return false
    }
  },

  remove(path) {
    try {
      unlinkSync(path)
    } catch {
      // a temp/lock already gone is not our problem to report.
    }
  },

  statMode(path) {
    try {
      return statSync(path).mode & 0o777
    } catch {
      return null
    }
  },

  acquireLock(path) {
    try {
      closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600))
      return true
    } catch {
      return false
    }
  },
  releaseLock(path) {
    this.remove(path)
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
//  helpers that fold docker calls into the checks the migration needs
// ══════════════════════════════════════════════════════════════════════════════════════════════════

class Aborted extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Re-discover the ONE running web container for this site, freshly (its ID changes on recreate). */
async function discoverWeb({ run, label }) {
  const res = await run({ argv: discoverWebArgv(label) })
  if (res.code !== 0 || res.timedOut) return { ok: false, reason: 'discover-failed' }
  const ids = parseWebPs(res.stdout, label)
  if (ids.length === 0) return { ok: false, reason: 'web-not-running' }
  if (ids.length > 1) return { ok: false, reason: 'ambiguous-container' }
  return { ok: true, id: ids[0] }
}

/** Inspect a web container by id and re-validate its full identity + ownership. */
async function inspectWeb({ run, id, privateRoot, label }) {
  const res = await run({ argv: webInspectArgv(id) })
  if (res.code !== 0 || res.timedOut)
    return { ok: false, reason: res.timedOut ? 'inspect-timeout' : 'inspect-failed' }
  const ins = parseWebInspect(res.stdout)
  if (ins.id !== id || !FULL_ID.test(ins.id)) return { ok: false, reason: 'id-mismatch' }
  if (!ins.running) return { ok: false, reason: 'web-not-running' }
  if (evaluateComposeIdentity(ins.labels, label, privateRoot) !== 'ok')
    return { ok: false, reason: 'compose-drift' }
  if (evaluateDataSource(ins.mounts, hostDataDir(privateRoot, label)) !== 'ok')
    return { ok: false, reason: 'data-bind-drift' }
  return { ok: true, ins }
}

/** Resolve the config's web image ref to a local id and require it equals the running image id. */
async function pinImage({ run, imageRef, runningImageId }) {
  if (!imageRef) return { ok: false, reason: 'no-image-ref' }
  const res = await run({ argv: imageIdArgv(imageRef) })
  if (res.code !== 0 || res.timedOut) return { ok: false, reason: 'image-absent' }
  const resolved = String(res.stdout ?? '').trim()
  if (!resolved) return { ok: false, reason: 'image-absent' }
  if (resolved !== runningImageId) return { ok: false, reason: 'image-drift' }
  return { ok: true, id: resolved }
}

/** The resolved config-hash of a compose file (never logs the resolved config). */
async function configHashOf({ run, projectDir, composeFile, project }) {
  const res = await run({
    argv: composeConfigHashArgv({ projectDir, composeFile, project, service: 'web' }),
    timeoutMs: CONFIG_TIMEOUT_MS
  })
  if (res.code !== 0 || res.timedOut) return ''
  return parseConfigHash(res.stdout, 'web')
}

/** The resolved config JSON of a compose file, parsed in memory only (holds secrets — never logged). */
async function configJsonOf({ run, projectDir, composeFile, project }) {
  const res = await run({
    argv: composeConfigJsonArgv({ projectDir, composeFile, project }),
    timeoutMs: CONFIG_TIMEOUT_MS
  })
  if (res.code !== 0 || res.timedOut) return null
  try {
    return JSON.parse(res.stdout)
  } catch {
    return null
  }
}

async function waitWebReady({ run, id, attempts, sleepMs, ckpt }) {
  for (let i = 0; i < attempts; i++) {
    // 🔒 A graceful TERM must be honoured DURING the readiness wait, so an abort cannot be papered over
    // and reported `applied`. In the forward path `ckpt` throws Aborted; the rollback path passes none.
    if (ckpt) await ckpt('readiness-wait')
    const res = await run({ argv: webInspectArgv(id) })
    if (res.code === 0 && !res.timedOut) {
      const ins = parseWebInspect(res.stdout)
      if (ins.running && healthOk(ins)) return { ok: true, ins }
      const h = ins.health && typeof ins.health === 'object' ? ins.health.Status : null
      if (h === 'unhealthy') return { ok: false, reason: 'unhealthy' }
    }
    if (i < attempts - 1 && sleepMs > 0) await sleep(sleepMs)
  }
  return { ok: false, reason: 'not-ready' }
}

/** Authenticate the mounted reader (mount mode, no stdin). Requires a clean transport. */
async function authMounted({ run, id }) {
  const res = await run({ argv: authArgv({ container: id, mode: 'mount' }), timeoutMs: AUTH_EXEC_TIMEOUT_MS })
  return readAuthResult(res)
}

/**
 * Is the mounted file the SAME credential as the host token? See `MOUNT_DIGEST_SCRIPT`.
 * Returns `'matches-host'`, `'stale-inode'`, or the sanitized reason the digest could not be read.
 */
async function mountedTokenVerdict({ run, id, token }) {
  const res = await run({ argv: mountDigestArgv(id), timeoutMs: AUTH_EXEC_TIMEOUT_MS })
  const dg = readDigestResult(res)
  if (!dg.ok) return dg.reason
  return dg.digest === tokenDigest(token) ? 'matches-host' : 'stale-inode'
}

/**
 * Authenticate the site via the protected host token piped on STDIN — works whether or not the mount
 * exists, so it proves the ORIGINAL (pre-mount) authenticated behaviour after a rollback. The PAT never
 * touches argv/env/log; a clean transport (exit 0 / no timeout / HTTP 200 valid RPC) is required.
 */
async function authWithHostToken({ run, id, token }) {
  const res = await run({
    argv: authArgv({ container: id, mode: 'stdin' }),
    stdin: token,
    timeoutMs: AUTH_EXEC_TIMEOUT_MS
  })
  return readAuthResult(res)
}

/**
 * Build the candidate and PROVE it is safe: it resolves through `docker compose config`, differs from
 * the original by EXACTLY the token mount, and yields a config-hash. The candidate is written to an
 * exclusive, no-follow temp file that is ALWAYS removed (so a dry run stays read-only for the real
 * compose/token/data). Returns { ok, candText, candHash } or { ok:false, reason }.
 */
async function validateCandidate({ run, fs, read, siteDirPath, project, origConfig, expectedToken, rand }) {
  // 🔒 PRESERVE THE ORIGINAL BYTES EXACTLY, apart from the one inserted mount. `buildCandidateText`
  // keeps the file's trailing-newline state (present OR absent), so no final newline is added. A CR
  // (CRLF/CR) file is REFUSED rather than normalised: an LF-only inserted line among CR lines would be a
  // second, silent byte change. `diff.reason` is already prefixed where appropriate — pass it through
  // unchanged (no second `candidate-`).
  if (/\r/.test(read.text)) return { ok: false, reason: 'unsupported-line-endings' }
  const candText = buildCandidateText(read.text)
  if (candText === null) return { ok: false, reason: 'no-web-volumes' }
  const candidatePath = `${siteDirPath}/.docker-compose.token-mount.candidate.${rand}`
  try {
    fs.writeTemp(candidatePath, candText, 0o600)
  } catch {
    return { ok: false, reason: 'candidate-write-failed' }
  }
  try {
    const candConfig = await configJsonOf({
      run,
      projectDir: siteDirPath,
      composeFile: candidatePath,
      project
    })
    if (!candConfig) return { ok: false, reason: 'candidate-invalid' }
    const diff = diffOnlyTokenMount(origConfig, candConfig, 'web', siteDirPath, expectedToken)
    if (!diff.ok) return { ok: false, reason: diff.reason }
    const candHash = await configHashOf({ run, projectDir: siteDirPath, composeFile: candidatePath, project })
    if (!candHash) return { ok: false, reason: 'candidate-hash-unresolved' }
    return { ok: true, candText, candHash }
  } finally {
    fs.remove(candidatePath)
  }
}

/**
 * The fast drift gate, re-run immediately before every mutation: file bytes AND mode, resolved
 * config-hash, runtime identity, immutable image, and token custody (inode+hash) must ALL still match
 * the preflight baseline. Returns { ok } or { ok:false, reason, token? }.
 */
async function revalidate({
  run,
  fs,
  composePath,
  origHash,
  origMode,
  siteDirPath,
  project,
  fileConfigHash,
  webId,
  snapshot,
  runConfigHash,
  privateRoot,
  label,
  expectedToken,
  tokenRead
}) {
  if (fs.fileHash(composePath) !== origHash) return { ok: false, reason: 'compose-changed-since-preflight' }
  if ((fs.statMode(composePath) ?? -1) !== origMode) return { ok: false, reason: 'compose-mode-changed' }
  const reHash = await configHashOf({ run, projectDir: siteDirPath, composeFile: composePath, project })
  if (reHash !== fileConfigHash) return { ok: false, reason: 'config-changed-since-preflight' }
  const reFound = await discoverWeb({ run, label })
  if (!reFound.ok || reFound.id !== webId) return { ok: false, reason: 'container-changed-since-preflight' }
  const reIns = await inspectWeb({ run, id: webId, privateRoot, label })
  if (
    !reIns.ok ||
    reIns.ins.imageId !== snapshot.imageId ||
    containerConfigHash(reIns.ins.labels) !== runConfigHash
  )
    return { ok: false, reason: 'runtime-changed-since-preflight' }
  const rePin = await pinImage({ run, imageRef: snapshot.imageRef, runningImageId: snapshot.imageId })
  if (!rePin.ok) return { ok: false, reason: `image-${rePin.reason}-since-preflight` }
  const reToken = fs.readHostToken(expectedToken)
  if (!reToken.ok || reToken.inode !== tokenRead.inode || reToken.hash !== tokenRead.hash)
    return { ok: false, reason: 'token-changed-since-preflight', token: true }
  return { ok: true }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
//  the migration itself
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Migrate ONE site (named by its opaque sha256 selector) to the #155 token mount, or report exactly
 * why it will not. Dry-run by default. Returns a fixed-shape, path-free, secret-free report.
 *
 * @param {object} config
 * @param {string} config.selector
 * @param {boolean} [config.apply]
 * @param {string} [config.privateRoot]
 * @param {Function} [config.run]
 * @param {typeof defaultMigrateFs} [config.fs]
 * @param {() => string} [config.stamp]
 * @param {number} [config.readyAttempts]
 * @param {number} [config.readySleepMs]
 * @param {{ aborted: boolean }} [config.signal] - a graceful-TERM flag checked at each checkpoint.
 * @param {(phase: string) => Promise<void>|void} [config.checkpoint] - test seam for TERM injection.
 */
export async function runMigration(config = {}) {
  const {
    selector,
    apply = false,
    privateRoot = DEFAULT_PRIVATE_ROOT,
    run = defaultRun,
    fs = defaultMigrateFs,
    stamp = () => new Date().toISOString().replace(/[:.]/g, '-'),
    readyAttempts = READY_ATTEMPTS,
    readySleepMs = READY_SLEEP_MS,
    signal = { aborted: false },
    checkpoint
  } = config
  const sel = String(selector ?? '')
  // 🔒 The selector is included in the report ONLY once it is validated — an unvalidated value is never
  // echoed (it could carry a path/label a caller mistyped).
  const validSel = SELECTOR_RE.test(sel)
  const base = {
    kind: KIND,
    version: 1,
    mode: apply ? 'apply' : 'dry-run',
    ...(validSel ? { selector: sel } : {})
  }
  const refuse = (reason, extra = {}) => ({ ...base, status: 'refused', reason, ...extra })
  const errorOut = (reason, extra = {}) => ({ ...base, status: 'error', reason, ...extra })

  if (!validSel) return errorOut('bad-selector')

  // 1. root safe
  const rootStat = fs.lstat(privateRoot)
  if (!(rootStat && rootStat.exists && !rootStat.error && rootStat.isDirectory && !rootStat.isSymbolicLink))
    return errorOut('root-unsafe')

  // 2. resolve the selector to EXACTLY one label
  const listed = fs.readdir(privateRoot)
  if (!Array.isArray(listed)) return errorOut('root-not-enumerated')
  const matches = listed.filter(
    (n) => SAFE_LABEL.test(n) && (selectorFor(n) === sel || selectorFor(n, { truncate: true }) === sel)
  )
  if (matches.length === 0) return errorOut('no-match')
  if (matches.length > 1) return errorOut('ambiguous-selector')
  const label = matches[0]

  const dirState = fs.lstat(siteDir(privateRoot, label))
  if (!dirState || dirState.error || dirState.isSymbolicLink || dirState.isDirectory === false)
    return errorOut('site-dir-unsafe')

  const composePath = hostComposePath(privateRoot, label)
  const siteDirPath = siteDir(privateRoot, label)
  const expectedToken = hostTokenPath(privateRoot, label)
  const project = label

  // 3. discover + inspect the ONE running web container (fresh, by labels)
  const found = await discoverWeb({ run, label })
  if (!found.ok) return found.reason === 'discover-failed' ? errorOut('ps-failed') : refuse(found.reason)
  let webId = found.id
  const insRes = await inspectWeb({ run, id: webId, privateRoot, label })
  if (!insRes.ok)
    return insRes.reason.endsWith('failed') || insRes.reason.endsWith('timeout')
      ? errorOut(insRes.reason)
      : refuse(insRes.reason)
  let ins = insRes.ins

  const checks = {}
  // classification (positive; refuse to guess)
  const hasDataDb = Boolean(
    (() => {
      const st = fs.lstat(hostDbPath(privateRoot, label))
      return st && st.exists && st.isFile !== false
    })()
  )
  const classification = classify({ image: ins.imageRef, hasDataDb })
  checks.classification = classification
  if (classification !== 'emdash') return refuse('not-emdash', { checks })

  // 4. read the compose file (O_NOFOLLOW), resolve its config + config-hash, prove #162 provenance
  const read = fs.readCompose(composePath)
  if (!read.ok) return errorOut(`compose-${read.reason}`, { checks })
  const origMode = read.mode
  const origHash = read.hash

  const runConfigHash = containerConfigHash(ins.labels)
  const fileConfigHash = await configHashOf({
    run,
    projectDir: siteDirPath,
    composeFile: composePath,
    project
  })
  checks.configHash =
    fileConfigHash && runConfigHash && fileConfigHash === runConfigHash ? 'match' : 'mismatch'
  if (!fileConfigHash) return errorOut('config-hash-unresolved', { checks })
  if (!runConfigHash) return refuse('no-config-hash', { checks })
  if (fileConfigHash !== runConfigHash) return refuse('config-drift', { checks })

  // 5. pin the image: the tag must resolve to the running immutable image id (no moved tag)
  const origConfig = await configJsonOf({ run, projectDir: siteDirPath, composeFile: composePath, project })
  if (!origConfig) return errorOut('config-unresolved', { checks })
  const imageRefFromConfig = origConfig?.services?.web?.image ?? ins.imageRef
  const pin = await pinImage({ run, imageRef: imageRefFromConfig, runningImageId: ins.imageId })
  checks.image = pin.ok ? 'pinned' : pin.reason
  if (!pin.ok) return refuse(pin.reason, { checks })

  // 6. how the RESOLVED config + runtime already relate to the token mount (structural, not regex)
  const configToken = classifyConfigToken(origConfig, 'web', siteDirPath, expectedToken)
  const runtimeMount = evaluateMount(ins.mounts, expectedToken)
  checks.configToken = configToken
  checks.runtimeMount = runtimeMount
  if (configToken === 'conflict') return refuse('compose-token-conflict', { checks })
  if (runtimeMount !== 'ok' && runtimeMount !== 'missing') return refuse('mount-drift', { checks })

  const patchNeeded = configToken === 'absent'
  let recreateNeeded = runtimeMount !== 'ok'

  // 7. admin + custody + auth are required for EVERY outcome, INCLUDING a no-op (they gate readiness).
  const dbRes = await run({ argv: dbArgv(webId), stdin: DB_INVENTORY_SCRIPT })
  const admin = dbRes.timedOut || dbRes.code !== 0 ? 'error' : adminVerdict(parseDbResult(dbRes.stdout))
  checks.admin = admin
  if (admin !== 'active-unique') return refuse('admin-not-unique', { checks })

  const tokenRead = fs.readHostToken(expectedToken)
  checks.custody = tokenRead.ok ? 'ok' : tokenRead.reason
  if (!tokenRead.ok)
    return { ...base, status: 'recovery-required', reason: `custody-${tokenRead.reason}`, checks }

  // pre-mount auth: the PAT rides stdin only; a clean transport (exit 0/no timeout) is required.
  const authBeforeRes = await run({
    argv: authArgv({ container: webId, mode: 'stdin' }),
    stdin: tokenRead.token,
    timeoutMs: AUTH_EXEC_TIMEOUT_MS
  })
  const authBefore = readAuthResult(authBeforeRes)
  checks.authBefore = authBefore.verdict
  if (!authBefore.authenticated)
    return { ...base, status: 'recovery-required', reason: 'auth-failed', checks }

  // 🔒 A MOUNT THAT INSPECTS PERFECTLY MAY STILL HOLD A DIFFERENT SECRET — see
  // `MOUNT_DIGEST_SCRIPT`. Asked BEFORE the no-op decision, because "the bind is stale" is the one
  // state that looks identical to "already migrated" from `docker inspect` alone, and the repair
  // for it is a rebind, not a report of success. A digest that cannot be read at all is a refusal:
  // this tool does not claim readiness for a mount it could not look inside.
  if (runtimeMount === 'ok') {
    const verdict = await mountedTokenVerdict({ run, id: webId, token: tokenRead.token })
    checks.mountedToken = verdict
    if (verdict !== 'matches-host' && verdict !== 'stale-inode')
      return refuse(`mounted-token-${verdict}`, { checks })
    // The container is holding an inode the host file no longer has. Recreating the web container
    // makes Docker resolve the bind again, against the file that is there now.
    if (verdict === 'stale-inode') recreateNeeded = true
  }

  // A no-op still proves the MOUNTED reader authenticates before it claims "already migrated".
  if (!patchNeeded && !recreateNeeded) {
    const authMount = await authMounted({ run, id: webId })
    checks.authAfter = authMount.verdict
    if (!authMount.authenticated)
      return { ...base, status: 'recovery-required', reason: 'mounted-auth-failed', checks }
    return { ...base, status: 'noop-already-migrated', checks }
  }

  const rand0 = createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12)
  if (!apply) {
    // 🔒 A dry run PROVES the actual candidate is safe — it resolves through `docker compose config`
    // and differs from the original by exactly the token mount — while staying read-only: the only
    // write is the exclusive temp file `validateCandidate` always removes. Nothing else is touched.
    if (patchNeeded) {
      const cand = await validateCandidate({
        run,
        fs,
        read,
        siteDirPath,
        project,
        origConfig,
        expectedToken,
        rand: rand0
      })
      checks.candidate = cand.ok ? 'validated' : cand.reason
      if (!cand.ok) return refuse(cand.reason, { checks })
    }
    return {
      ...base,
      status: 'would-apply',
      checks,
      plan: { patch: patchNeeded, recreate: recreateNeeded },
      note:
        checks.mountedToken === 'stale-inode'
          ? 'preflight passed; the running container holds a token inode the host file no longer has — re-run with --apply to force-recreate the web container so the bind resolves the current file. The token bytes are not touched.'
          : 'preflight passed and the candidate is proven safe; re-run with --apply to insert the read-only token mount and recreate the web container'
    }
  }

  // ── ACTING ──
  // 🔒 Signal cleanup spans the WHOLE mutating phase: a graceful TERM/INT sets signal.aborted, which the
  // checkpoints below turn into a drift-aware rollback with the lock held throughout. A SIGKILL (or a
  // KILL after the in-container grace) cannot be trapped — that hard-kill window is the one case a
  // rollback may not run, and is documented, not papered over. ⚠ A `docker compose up` already
  // dispatched runs in the DAEMON, not as a child of this process, so neither TERM nor a client timeout
  // cancels compose work already in flight; the next run's under-lock revalidation catches any drift.
  const lockPath = `${siteDirPath}/.tracy-token-mount.lock`
  if (!fs.acquireLock(lockPath)) return refuse('locked', { checks })

  const snapshot = { imageId: ins.imageId, configHash: runConfigHash, imageRef: imageRefFromConfig }
  // The ORIGINAL runtime mount state to restore on rollback — may be `missing` OR a valid existing mount.
  const originalMount = runtimeMount
  const backupPath = `${composePath}.pre-token-mount.${stamp()}`
  const rand = createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12)
  let phase = 'preparing' // preparing | swapped | recreated
  let candHash = runConfigHash
  let swappedHash = ''
  let swappedMode = origMode

  const ckpt = async (name) => {
    if (checkpoint) await checkpoint(name)
    if (signal.aborted) throw new Aborted(name)
  }
  const reArgs = () => ({
    run,
    fs,
    composePath,
    origHash,
    origMode,
    siteDirPath,
    project,
    fileConfigHash,
    webId,
    snapshot,
    runConfigHash,
    privateRoot,
    label,
    expectedToken,
    tokenRead
  })
  const rbCtx = () => ({
    run,
    fs,
    privateRoot,
    label,
    composePath,
    backupPath,
    origMode,
    snapshot,
    phase,
    swappedHash,
    swappedMode,
    originalMount,
    expectedToken,
    tokenRead,
    readyAttempts,
    readySleepMs
  })
  const bail = async (reason) => {
    const rb = await rollback(rbCtx()).catch(() => ({ status: 'rollback-incomplete', rollback: 'threw' }))
    fs.releaseLock(lockPath)
    return { ...base, ...rb, reason, checks }
  }
  const revalFail = (rv) => {
    fs.releaseLock(lockPath)
    return rv.token
      ? { ...base, status: 'recovery-required', reason: rv.reason, checks }
      : refuse(rv.reason, { checks })
  }

  try {
    // 🔒 REVALIDATE #1 the moment the lock is taken: file bytes+mode, resolved config-hash, runtime
    // identity, immutable image, token custody must ALL still match preflight.
    let rv = await revalidate(reArgs())
    if (!rv.ok) return revalFail(rv)

    await ckpt('under-lock')

    // 8. build + PROVE the candidate (only when the file needs the mount added). validateCandidate
    //    resolves it through `docker compose config`, proves it differs by exactly the token mount, and
    //    always removes its own exclusive temp.
    let candText = ''
    if (patchNeeded) {
      const cand = await validateCandidate({
        run,
        fs,
        read,
        siteDirPath,
        project,
        origConfig,
        expectedToken,
        rand
      })
      if (!cand.ok) {
        fs.releaseLock(lockPath)
        return refuse(cand.reason, { checks })
      }
      candText = cand.candText
      candHash = cand.candHash
    }

    // 🔒 REVALIDATE #2 immediately before the mutation — candidate resolution ran `docker compose
    // config` (a drift window), so nothing may have moved between the gate and the swap/recreate.
    rv = await revalidate(reArgs())
    if (!rv.ok) return revalFail(rv)

    if (patchNeeded) {
      // back up the original (0600) and swap the candidate in atomically, preserving the ORIGINAL mode.
      fs.backup(composePath, backupPath)
      const staged = `${siteDirPath}/.docker-compose.token-mount.staged.${rand}`
      let renamed = false
      try {
        fs.writeTemp(staged, candText, origMode)
        swappedHash = fs.fileHash(staged)
        swappedMode = fs.statMode(staged) ?? origMode
        fs.rename(staged, composePath)
        renamed = true
        phase = 'swapped'
      } finally {
        if (!renamed) fs.remove(staged) // a throw before rename must leave no staged temp behind
      }
    }
    // (recreate-only — no file change — is still a real mutation; the recreate below is that mutation.)

    await ckpt('before-recreate')

    // 9. recreate ONLY web
    const up = await run({
      argv: composeUpArgv({
        projectDir: siteDirPath,
        composeFile: composePath,
        project,
        force: checks.mountedToken === 'stale-inode'
      }),
      timeoutMs: RECREATE_TIMEOUT_MS
    })
    phase = 'recreated'
    if (up.code !== 0 || up.timedOut) return await bail('recreate-failed')

    await ckpt('after-recreate')

    // 10. re-discover the NEW container (its id changed), re-inspect identity/ownership/image/config-hash/bind
    const nf = await discoverWeb({ run, label })
    if (!nf.ok) return await bail(`post-recreate-${nf.reason}`)
    webId = nf.id
    const ready = await waitWebReady({ run, id: webId, attempts: readyAttempts, sleepMs: readySleepMs, ckpt })
    if (!ready.ok) return await bail(`not-ready-${ready.reason}`)
    ins = ready.ins

    const newInspect = await inspectWeb({ run, id: webId, privateRoot, label })
    if (!newInspect.ok) return await bail(`post-recreate-${newInspect.reason}`)
    const nIns = newInspect.ins
    // 🔒 The NEW container must run the pinned immutable image, carry the CANDIDATE config-hash, and
    // present the EXACT read-only bind — before we trust it enough to authenticate.
    checks.imageAfter = nIns.imageId === snapshot.imageId ? 'pinned' : 'moved'
    checks.configHashAfter = containerConfigHash(nIns.labels) === candHash ? 'candidate' : 'unexpected'
    checks.tokenMountAfter = evaluateMount(nIns.mounts, expectedToken)
    if (
      nIns.imageId !== snapshot.imageId ||
      containerConfigHash(nIns.labels) !== candHash ||
      checks.tokenMountAfter !== 'ok'
    )
      return await bail('verify-failed')

    // 11. the mounted reader must authenticate (clean transport), and the token must be UNCHANGED.
    //
    // 🔒 AND THE NEW CONTAINER MUST BE READING THIS HOST FILE, not the inode the old one held. A
    // successful `tools/list` alone does not prove that: a stale credential that has not been
    // revoked yet authenticates perfectly, which is the whole reason the digest exists. Anything
    // but `matches-host` here — including a digest that could not be read — fails the apply and
    // rolls back, rather than reporting a rebind that did not happen.
    const mountedAfter = await mountedTokenVerdict({ run, id: webId, token: tokenRead.token })
    checks.mountedTokenAfter = mountedAfter
    if (mountedAfter !== 'matches-host') return await bail('mounted-token-not-rebound')

    const authAfter = await authMounted({ run, id: webId })
    checks.authAfter = authAfter.verdict
    const afterToken = fs.readHostToken(expectedToken)
    checks.tokenUnchanged =
      afterToken.ok && afterToken.inode === tokenRead.inode && afterToken.hash === tokenRead.hash
        ? 'yes'
        : 'no'
    if (!authAfter.authenticated || checks.tokenUnchanged !== 'yes')
      return await bail(authAfter.authenticated ? 'token-mutated' : 'auth-after-failed')

    // 🔒 One last checkpoint: a graceful TERM arriving here must NOT be reported as `applied`.
    await ckpt('before-success')
    fs.releaseLock(lockPath)
    return {
      ...base,
      status: 'applied',
      checks,
      backup: 'kept',
      note: 'the read-only token mount was inserted and the web container recreated; the token file was not touched'
    }
  } catch (error) {
    const aborted = error instanceof Aborted
    const rb = await rollback(rbCtx()).catch(() => ({ status: 'rollback-incomplete', rollback: 'threw' }))
    fs.releaseLock(lockPath)
    return { ...base, ...rb, reason: aborted ? 'aborted' : 'apply-threw', checks }
  }
}

/**
 * Undo an apply that began to mutate. 🔒 CHECK BEFORE OVERWRITING: only restore the compose if it is
 * still EXACTLY the candidate we swapped in (never clobber a concurrent post-swap edit). Restore the
 * ORIGINAL bytes+mode atomically from OUR backup, re-resolve the original config/image, re-discover the
 * CID, recreate, and re-prove the ORIGINAL runtime + authenticated endpoint — or report
 * `rollback-incomplete`. A recreate that happened without a file patch is a real mutation, reported so.
 */
async function rollback({
  run,
  fs,
  privateRoot,
  label,
  composePath,
  backupPath,
  origMode,
  snapshot,
  phase,
  swappedHash,
  swappedMode,
  originalMount,
  expectedToken,
  tokenRead,
  readyAttempts,
  readySleepMs
}) {
  const siteDirPath = siteDir(privateRoot, label)
  const project = label

  if (phase === 'preparing') return { status: 'rolled-back', rollback: 'nothing-to-undo' }

  // If we swapped the file, put the ORIGINAL bytes back — but only over OUR candidate. Check BOTH the
  // bytes AND the mode still match what we wrote, so a concurrent post-swap edit (of either) is never
  // clobbered.
  if (swappedHash) {
    if (fs.fileHash(composePath) !== swappedHash)
      return { status: 'rollback-incomplete', rollback: 'concurrent-edit-not-clobbered' }
    if ((fs.statMode(composePath) ?? -1) !== swappedMode)
      return { status: 'rollback-incomplete', rollback: 'concurrent-mode-change-not-clobbered' }
    const staged = `${composePath}.rollback.${createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12)}`
    if (!fs.restoreCompose(backupPath, composePath, origMode, staged))
      return { status: 'rollback-incomplete', rollback: 'restore-failed' }
  }

  // Re-resolve the original config/image before recreating (refuse to boot a known-wrong runtime).
  const restoredHash = await configHashOf({ run, projectDir: siteDirPath, composeFile: composePath, project })
  if (restoredHash !== snapshot.configHash)
    return { status: 'rollback-incomplete', rollback: 'restored-config-drift' }
  const restoredCfg = await configJsonOf({ run, projectDir: siteDirPath, composeFile: composePath, project })
  const ref = restoredCfg?.services?.web?.image ?? snapshot.imageRef
  const rePin = await pinImage({ run, imageRef: ref, runningImageId: snapshot.imageId })
  if (!rePin.ok) return { status: 'rollback-incomplete', rollback: `image-${rePin.reason}` }

  const up = await run({
    argv: composeUpArgv({ projectDir: siteDirPath, composeFile: composePath, project }),
    timeoutMs: RECREATE_TIMEOUT_MS
  })
  if (up.code !== 0 || up.timedOut) return { status: 'rollback-incomplete', rollback: 'recreate-failed' }

  const nf = await discoverWeb({ run, label })
  if (!nf.ok) return { status: 'rollback-incomplete', rollback: 'rediscover-failed' }
  const ready = await waitWebReady({ run, id: nf.id, attempts: readyAttempts, sleepMs: readySleepMs })
  if (!ready.ok) return { status: 'rollback-incomplete', rollback: 'not-ready' }
  const ins = await inspectWeb({ run, id: nf.id, privateRoot, label })
  if (
    !ins.ok ||
    ins.ins.imageId !== snapshot.imageId ||
    containerConfigHash(ins.ins.labels) !== snapshot.configHash
  )
    return { status: 'rollback-incomplete', rollback: 'restored-runtime-drift' }
  // 🔒 Restore the ORIGINAL runtime mount STATE — which may be `missing` (a pre-#155 site) OR a valid
  // existing mount — not unconditionally `missing`.
  if (evaluateMount(ins.ins.mounts, expectedToken) !== originalMount)
    return { status: 'rollback-incomplete', rollback: 'restored-mount-unexpected' }
  // 🔒 Prove the ORIGINAL authenticated behaviour, and that the token is untouched: re-read the host
  // token through the O_NOFOLLOW custody check (inode+hash must match preflight), then authenticate it
  // against the site over stdin — requiring a clean transport + HTTP 200 valid RPC. This works whether
  // or not the mount exists, so it proves the endpoint, not merely reachability.
  const reToken = fs.readHostToken(expectedToken)
  if (!reToken.ok || reToken.inode !== tokenRead.inode || reToken.hash !== tokenRead.hash)
    return { status: 'rollback-incomplete', rollback: 'token-custody-drift' }
  const auth = await authWithHostToken({ run, id: nf.id, token: reToken.token })
  if (!auth.authenticated) return { status: 'rollback-incomplete', rollback: 'endpoint-unconfirmed' }
  return { status: 'rolled-back', rollback: 'complete' }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
//  the via-host transport
// ══════════════════════════════════════════════════════════════════════════════════════════════════

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

/** A fixed-shape, path-free transport error (our own kind). The selector is echoed only if valid. */
export function hostError(reason, { apply = false, selector = '' } = {}) {
  const validSel = SELECTOR_RE.test(String(selector ?? ''))
  return {
    kind: KIND,
    version: 1,
    mode: apply ? 'apply' : 'dry-run',
    ...(validSel ? { selector } : {}),
    transport: 'via-host',
    error: sanitizeHostReason(reason)
  }
}

export function innerArgs({ root, selector, apply }) {
  const args = ['--root', root, '--selector', selector]
  if (apply) args.push('--apply')
  return args
}

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
/**
 * Run the reviewed source inside tracy-host, wrapped in GNU `timeout` so the WHOLE inner node is
 * bounded in-container (see {@link HOST_INNER_TERM_S}). `-s TERM` lets the inner CLI catch it and roll
 * back gracefully; `-k` KILLs after the grace. All three numeric args are constants (no injection).
 */
export function execHostArgv(
  container,
  innerArgv = [],
  { termS = HOST_INNER_TERM_S, killS = HOST_INNER_KILL_S } = {}
) {
  return [
    'exec',
    '-i',
    container,
    'timeout',
    '-k',
    String(killS),
    '-s',
    'TERM',
    String(termS),
    'node',
    '--input-type=module',
    '-',
    ...innerArgv
  ]
}
/** The report statuses the inner run may legitimately emit. */
export const INNER_STATUSES = [
  'noop-already-migrated',
  'would-apply',
  'applied',
  'refused',
  'recovery-required',
  'error',
  'rolled-back',
  'rollback-incomplete'
]

/**
 * The statuses that mean the inner run FINISHED the job. Everything else in INNER_STATUSES is a
 * failure the operator has to read. This list is the CLI's exit code and the via-host transport's
 * trust boundary at once, so it lives in one place.
 */
export const SUCCESS_STATUSES = ['noop-already-migrated', 'would-apply', 'applied']

/**
 * Parse AND validate the inner run's stdout as OUR report. It must be JSON of the exact kind, version
 * and (when known) mode; a `selector` it carries must be valid hex and equal to the one we asked for;
 * and it must be either a sanitized transport `error` string OR a known `status`. Anything malformed,
 * mismatched, or of the wrong kind is rejected (null) so a legitimate failure report is preserved but a
 * confused/foreign payload is not trusted.
 * @param {string} stdout
 * @param {{ selector?: string, apply?: boolean }} [expect]
 */
export function parseInnerReport(stdout, { selector, apply } = {}) {
  const s = String(stdout ?? '').trim()
  if (!s) return null
  let obj
  try {
    obj = JSON.parse(s)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  if (obj.kind !== KIND || obj.version !== 1) return null
  if (apply !== undefined && obj.mode !== (apply ? 'apply' : 'dry-run')) return null
  if ('selector' in obj) {
    if (!SELECTOR_RE.test(String(obj.selector))) return null
    if (selector !== undefined && obj.selector !== selector) return null
  }
  const hasError = typeof obj.error === 'string' && obj.error.length > 0
  const hasStatus = INNER_STATUSES.includes(obj.status)
  if (!hasError && !hasStatus) return null
  return obj
}

export async function runHostMigration({ run = defaultRun, source, selector, apply = false } = {}) {
  const sel = String(selector ?? '')
  const fail = (reason) => hostError(reason, { apply, selector: sel })
  if (!SELECTOR_RE.test(sel))
    return {
      kind: KIND,
      version: 1,
      mode: apply ? 'apply' : 'dry-run',
      transport: 'via-host',
      error: 'bad-selector'
    }

  const psRes = await run({ argv: psHostArgv() })
  if (psRes.code !== 0 || psRes.timedOut) return fail('host-ps-failed')
  const ids = parseHostPs(psRes.stdout)
  if (ids.length === 0) return fail('no-host-container')
  if (ids.length > 1) return fail('ambiguous-host-container')
  const id = ids[0]

  const insRes = await run({ argv: inspectHostArgv(id) })
  if (insRes.code !== 0 || insRes.timedOut)
    return fail(insRes.timedOut ? 'host-inspect-timeout' : 'host-inspect-failed')
  const ins = parseHostInspect(insRes.stdout)
  if (ins.id !== id || !FULL_ID.test(ins.id)) return fail('host-id-mismatch')
  if (!ins.running) return fail('host-not-running')
  if (evaluateHostLabels(ins.labels) !== 'ok') return fail('host-label-mismatch')
  const root = normalizeRoot(privateRootFromEnv(ins.env))
  if (!root) return fail('root-unsafe')
  if (evaluateHostRootBind(ins.mounts, root) !== 'ok') return fail('root-bind-unsafe')

  if (typeof source !== 'string' || source.length === 0) return fail('source-unavailable')
  const execRes = await run({
    argv: execHostArgv(id, innerArgs({ root, selector: sel, apply })),
    stdin: source,
    timeoutMs: HOST_EXEC_TIMEOUT_MS
  })
  if (execRes.timedOut) return fail('host-exec-timeout')
  // 🔒 A NONZERO INNER EXIT STILL CARRIES A VALID SANITIZED REPORT (a refusal, a recovery-required, a
  // rolled-back): parse+validate it and preserve its detail rather than flattening it to a fixed
  // transport error. But SUCCESS is the transport's to confirm, not the payload's — a report saying
  // applied/would-apply/noop under exit 1, 124 or null (killed, OOM, a timeout INSIDE the container,
  // which never sets the client-side timedOut flag) would otherwise be read as done by isFailure()
  // and turn the CLI and the workflow green over a migration nobody watched finish.
  const report = parseInnerReport(execRes.stdout, { selector: sel, apply })
  const exitedOk = execRes.code === 0
  if (report && (exitedOk || !SUCCESS_STATUSES.includes(report.status)))
    return { ...report, transport: 'via-host' }
  if (!exitedOk) return fail('host-exec-failed')
  return fail('inner-unparseable')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
//  CLI
// ══════════════════════════════════════════════════════════════════════════════════════════════════

function parseCliArgs(argv) {
  let privateRoot = process.env.TRACY_PRIVATE_ROOT || DEFAULT_PRIVATE_ROOT
  let selector = ''
  let apply = false
  let viaHost = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) privateRoot = argv[++i]
    else if (argv[i] === '--selector' && argv[i + 1]) selector = argv[++i]
    else if (argv[i] === '--apply') apply = true
    else if (argv[i] === '--via-host') viaHost = true
    else return { error: 'bad-arguments' }
  }
  if (!selector) return { error: 'bad-arguments' }
  return { privateRoot, selector, apply, viaHost }
}

function isFailure(report) {
  if (report.error) return true
  return !SUCCESS_STATUSES.includes(report.status)
}

const entry = process.argv[1]
if ((entry && entry.endsWith('migrate-token-mount.mjs')) || entry === '-') {
  const opts = parseCliArgs(process.argv.slice(2))
  if (opts.error) {
    process.stderr.write(
      'MIGRATE_ERROR bad-arguments (use: migrate-token-mount.mjs --selector <sha256hex> [--apply] [--root DIR] [--via-host])\n'
    )
    process.exitCode = 1
  } else if (opts.viaHost) {
    let report
    try {
      const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
      report = await runHostMigration({ source: src, selector: opts.selector, apply: opts.apply })
    } catch {
      report = hostError('source-unavailable', { apply: opts.apply, selector: opts.selector })
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (isFailure(report)) process.exitCode = 1
  } else {
    // 🔒 Graceful TERM/INT during the mutating phase: flip the shared flag so the next checkpoint runs a
    // drift-aware rollback with the lock still held. SIGKILL cannot be trapped (documented).
    const signal = { aborted: false }
    const arm = () => {
      signal.aborted = true
    }
    process.on('SIGTERM', arm)
    process.on('SIGINT', arm)
    let report
    try {
      report = await runMigration({ ...opts, signal })
    } catch {
      // 🔒 Omit an unvalidated selector even here — never echo a value that failed the hex gate.
      report = {
        kind: KIND,
        version: 1,
        mode: opts.apply ? 'apply' : 'dry-run',
        ...(SELECTOR_RE.test(opts.selector) ? { selector: opts.selector } : {}),
        status: 'error',
        reason: 'scan-failed'
      }
    }
    process.off('SIGTERM', arm)
    process.off('SIGINT', arm)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (isFailure(report)) process.exitCode = 1
  }
}
