/**
 * A read of an imported site's LIVE site, for "Sync from live" (`webroot/webroot-sync.sh`, plan
 * tasks/ke-hoach-dong-bo-tu-live.md §3.6): its database and its webroot, through the Claude Cowork
 * engine installed on it at import, straight onto this host's disk — the store never holds it.
 *
 *   node live-pull.mjs <dir>      env TRACY_SYNC_ENDPOINT, TRACY_SYNC_TOKEN
 *   TRACY_SYNC_CHECK_ONLY=1       only whether the live site moved since TRACY_SYNC_FINGERPRINT_IN
 *                                 (`unchanged: 'fingerprint'` or null): nothing is read
 * Nothing is left to merge either (`unchanged`) when the fingerprint equals the last applied read's
 * (`'fingerprint'`), when only tables with rows the site rewrites by itself moved and they still hold
 * that read's rows (`'rows'`, TRACY_SYNC_DB_BASE: `compared` names them), or, with no fingerprint, when
 * the read brought nothing new (`'compare'`).
 *
 * Leaves in `<dir>/live/`:
 *   db.sql.gz        the live database, read TWICE and taken only when both reads agree table by
 *                    table, byte for byte (a write anywhere during the read window shows as a
 *                    difference — an edit in place included). Tables that move on their own
 *                    (TRACY_SYNC_VOLATILE, default `session`; TRACY_SYNC_IGNORED_TABLES) and rows
 *                    that do (TRACY_SYNC_VOLATILE_ROWS) are left out of the comparison; a read that
 *                    kept changing names what did (TRACY_SYNC_ROW_NAMES: the rows' names).
 *   tree/            the whole webroot (a first sync), unpacked and checked file by file against
 *                    the site's own `files.list` sha1s; or, when TRACY_SYNC_MANIFEST_IN names the
 *                    manifest of the last read,
 *   changes/ + deleted.json   only what changed since that read, each file checked by its sha1.
 *   manifest.json    `{path: sha1}` of the read, listed again after reading: a file that moved
 *                    while the read ran is read again, and one that keeps moving stops the read.
 * The last stdout line is the answer: `{ok, mode, tables, rows, files, bytes, …}` or
 * `{ok: false, code, detail}` — with LIVE_BUSY, `moved: {tables?: [{table, rows, names?, …}], files?}`.
 *
 * The protocol and its guards are the import's (`packages/site/tracy-add-site/src/host/export.ts`),
 * kept in step by hand because that half runs inside dsh and this one on the fleet host:
 *   - `db.dump` pages by KEY when the engine answers `next_cursor`, by offset only when it does not
 *     (an old engine ignores `cursor`, and sending it forever dumps the first page forever);
 *   - a page the site cannot serve (429/5xx) is retried, and the page size halves down to 50;
 *   - `files.pack` asks for its part INLINE: this side writes it, so no store and no presigned URL
 *     are involved, and the declared `size` of a file cut across parts is handed back unchanged;
 *   - Joomla's front door may be gated (offline, coming soon, a firewall): the administrator door
 *     answers the same engine (`doors.mjs`).
 * And one guard of its own: every `db.dump` page says the table's row count, and a table whose count
 * moved between its first and last page was written while it was read — it is read again (up to
 * TABLE_READS times), and a table that keeps moving stops the read (`LIVE_BUSY`) rather than hand
 * the merge a table half of one moment and half of another. A count cannot see a row edited in
 * place; a sync that must be exact asks the customer to pause writes (plan §6).
 * 🔒 The token arrives in the environment and goes only into request bodies: never on a command line,
 * into a file, a log line or an answer.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { request } from 'node:http'
import { dirname, join } from 'node:path'
import { createGunzip, createGzip, gunzipSync } from 'node:zlib'

const USER_AGENT = 'Mozilla/5.0 (compatible; TracyBot/1.0; +https://tracy.ai)'
const REQUEST_TIMEOUT_MS = 120_000
const DB_CHUNK_LIMIT = 2000
const MIN_DB_CHUNK_LIMIT = 50
const TARGET_PART_BYTES = 8 * 1024 * 1024
const MAX_PARTS = 10_000
const TRIES = 4
/** How many times one table is read again when it moved while it was read. */
const TABLE_READS = 3
/** Two whole reads of the database that must agree; more rounds when they do not. */
const DB_ROUNDS = 3
/** `files.list` lot size (the engine's ceiling is 500). */
const LIST_LIMIT = 500
/**
 * The smallest lot `files.list` is asked for once a site's time limit stops a lot: the engine
 * hashes every file of a lot in one request, so a lot of big files on a slow host runs past PHP's
 * max_execution_time (a 500 there) or this side's timeout (measured on the stand, 20/10/2026).
 */
const MIN_LIST_LIMIT = 10
/**
 * Tracy's own files on a live site — the Claude Cowork engine and its plugins, Tracy's sign-in — which
 * the merge never takes from it (`live_sync.py` tracy_owned, `export-package.py` TRACY_ONLY: the same
 * list, kept in step by hand). They are not listed, read or counted as deleted: the engine updating
 * itself on the live site brought 705 contract files that a sync read one by one for minutes, to
 * keep none of them (measured 22/10/2026).
 */
const TRACY_PATHS = [
  'components/com_claudecowork/',
  'administrator/components/com_claudecowork/',
  'plugins/system/claudecoworkapi/',
  'plugins/system/claudecoworkupdate/',
  'plugins/system/tracyaccess/',
  'wp-content/plugins/claude-cowork/',
  'wp-content/mu-plugins/tracy-access.php'
]
const isTracyPath = (path) => TRACY_PATHS.some((t) => (t.endsWith('/') ? path.startsWith(t) : path === t))
/**
 * Tracy's copies of a site's tables in its database — a `db.snapshot` (`_tracy_snap_*`) or a table
 * `db.cleanup` moved to the trash (`_tracy_trash_*`) — which `db.tables` lists with the site's own:
 * not read, and not compared between two checks (the merge never takes them either, `live_sync.py`
 * TRACY_COPY_TABLE). A whole-database snapshot on the live site doubled what a read carried (#1649).
 */
const isTracyCopy = (table) => /^_tracy_(snap|trash)_/.test(table)
/** How many files are read at once when many changed: one request each, so one at a time is slow. */
const READ_CONCURRENCY = 4
/** The largest file `file.read` hands back (the engine's MAX_READ_BYTES). */
const MAX_READ_BYTES = 8 * 1024 * 1024
/** Rounds of reading again what moved between two listings. */
const FILE_ROUNDS = 3
/**
 * Columns a Joomla site moves on its own — a page view (`hits`), a login (`lastvisitDate`), an edit
 * lock, a scheduled run, an update check — left out of each table's checksum (claude-cowork
 * `site.fingerprint {skip_columns}`, version 2), so a live site with visitors can still read as
 * unchanged. live_sync.py's `volatileColumns`, without the ones only a real edit moves (`modified`).
 */
const SKIP_COLUMNS = [
  'hits',
  'checked_out',
  'checked_out_time',
  'lastvisitDate',
  'lastResetTime',
  'resetCount',
  'last_execution',
  'next_execution',
  'times_executed',
  'times_failed',
  'last_exit_code',
  'locked',
  'last_check_timestamp'
]
/**
 * Tables only the site's own running writes (its logs, its list of available updates): read when they
 * moved, never a reason to call the live site changed (measured: a login and the lazy scheduler
 * moved `action_logs` and `scheduler_logs` between two syncs with no edit at all, 22/10/2026).
 */
const NOISE_TABLES = ['scheduler_logs', 'action_logs', 'updates']
/** The dumper's first line for a table (`DbDumper::dumpChunkFrom`): values never hold a raw newline. */
const TABLE_MARKER = Buffer.from('-- table `')

class PullFailed extends Error {
  /** `moved`: on LIVE_BUSY, what kept changing (`{tables?, files?}`) — names, never a value of the site. */
  constructor(code, detail, moved = null) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
    this.detail = detail
    this.moved = moved
  }
}

/** A failure worth asking again: the site's 429/5xx, or the network. */
class Transient extends Error {}

/** Failures no other door, call or retry can change: the run stops on them at once. */
const STOP_NOW = ['TOKEN_REFUSED', 'LIVE_PASSWORD_PROTECTED', 'LIVE_RATE_LIMITED', 'LIVE_PHP_TOO_OLD']

/**
 * An engine refusing to run on the site's PHP (claude-cowork 0.24.73: `{ok: false, error:
 * 'php_too_old', php, min}` on both doors, HTTP 200): LIVE_PHP_TOO_OLD with both versions, so the
 * owner is told to have PHP upgraded rather than that the site could not be reached.
 */
function phpTooOld(reply) {
  const version = (value) => (/^\d+(\.\d+){0,3}$/.test(String(value ?? '')) ? String(value) : null)
  const error = new PullFailed('LIVE_PHP_TOO_OLD')
  error.php = version(reply.php)
  error.min = version(reply.min)
  return error
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The engine's reply out of a raw body, or null when something else answered (`doors.mjs`). */
function engineReply(text) {
  const read = (body) => {
    try {
      const value = JSON.parse(body)
      return value && typeof value === 'object' && !Array.isArray(value) && typeof value.ok === 'boolean'
        ? value
        : null
    } catch {
      return null
    }
  }
  const whole = read(text)
  if (whole !== null) return whole
  // PHP's notices printed ahead of the engine's JSON by a host that shows its errors (PHP 8.5
  // deprecates the engine uploader's `curl_close()`): whole notice lines are taken off, and what
  // remains must be an engine answer — the same rule as tracy-add-site `doors.mjs` `afterPhpNotices`.
  const lines = String(text).split(/\r?\n/)
  let k = 0
  let notices = 0
  while (k < lines.length) {
    const line = lines[k].trim()
    if (line === '' || /^<br\s*\/?>$/i.test(line)) k += 1
    else if (PHP_NOTICE_LINE.test(line)) {
      notices += 1
      k += 1
    } else break
  }
  return notices > 0 && k < lines.length ? read(lines.slice(k).join('\n')) : null
}

/** One line of PHP's report of a problem it survived, as `display_errors` prints it (`doors.mjs`). */
const PHP_NOTICE_LINE =
  /^(?:<br\s*\/?>)?\s*(?:PHP\s+)?(?:<b>)?(?:Deprecated|Notice|Warning|Strict Standards|User Deprecated|User Notice|User Warning)(?:<\/b>)?:\s.*\bon line\b/i

/**
 * Where to connect for `endpoint`. On a stand on one machine (deploy/compose.macos.yml) a test
 * site's name, `<label>.tracy.test`, answers only through tracy-web: `TRACY_SYNC_CONNECT_VIA`
 * (`tracy-web:51710`) names that door and the site's own name rides in the Host header, the way
 * `curl --connect-to` does it. Only `.tracy.test` names are ever rerouted: a customer's live site
 * is always reached at its own address.
 */
function route(endpoint) {
  const via = process.env.TRACY_SYNC_CONNECT_VIA ?? ''
  const url = new URL(endpoint)
  if (!via || !url.hostname.endsWith('.tracy.test') || url.protocol !== 'http:') return null
  const [hostname, port] = via.split(':')
  return { hostname, port: Number(port || 80), path: url.pathname + url.search, host: url.host }
}

/** POST through `route`'s door with the site's name in Host: `fetch` does not let Host be set. */
function viaPost(target, body, headers) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.path,
        method: 'POST',
        headers: { ...headers, host: target.host },
        timeout: REQUEST_TIMEOUT_MS
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            text: Buffer.concat(chunks).toString('utf8'),
            retryAfter: res.headers['retry-after']
          })
        )
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end(body)
  })
}

async function call(endpoint, token, action, params = {}) {
  let response
  let text
  let retryAfter
  const target = route(endpoint)
  const body = JSON.stringify({ token, action, params })
  const headers = { 'content-type': 'application/json', 'user-agent': USER_AGENT }
  try {
    if (target) {
      ;({ status: response, text, retryAfter } = await viaPost(target, body, headers))
      response = { status: response }
    } else {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error'
      })
      retryAfter = response.headers.get('retry-after')
      text = await response.text()
    }
  } catch (error) {
    throw new Transient(`${action}: ${error.cause?.code ?? error.code ?? error.message ?? error.name}`)
  }
  const reply = engineReply(text)
  if (reply && !reply.ok && ['unauthorized', 'forbidden', 'bad_token'].includes(reply.error))
    throw new PullFailed('TOKEN_REFUSED')
  if (response.status === 401) throw new PullFailed('LIVE_PASSWORD_PROTECTED')
  if (response.status === 403) throw new PullFailed('LIVE_BLOCKED')
  if (response.status === 429) {
    const error = new Transient(`${action} answered 429`)
    error.code = 'LIVE_RATE_LIMITED'
    const seconds = /^\s*\d+\s*$/.test(String(retryAfter ?? '')) ? Number(retryAfter) : null
    const date = seconds === null ? Date.parse(String(retryAfter ?? '')) : NaN
    error.retryAfterMs =
      seconds !== null ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0
    throw error
  }
  if (reply === null) {
    if (response.status >= 500) throw new Transient(`${action} answered ${response.status}`)
    throw new PullFailed(
      response.status === 200 ? 'LIVE_BLOCKED' : 'NOT_THE_ENGINE',
      `${action} answered ${response.status}`
    )
  }
  if (!reply.ok) {
    if (reply.error === 'unauthorized' || reply.error === 'forbidden' || reply.error === 'bad_token') {
      throw new PullFailed('TOKEN_REFUSED')
    }
    if (reply.error === 'php_too_old') throw phpTooOld(reply)
    throw new PullFailed('ENGINE_REFUSED', `${action}: ${String(reply.error ?? '').slice(0, 80)}`)
  }
  return reply
}

/** `fn` again on a Transient failure, with a growing pause; `onTransient` may shrink the request. */
async function retried(fn, onTransient = () => {}, tries = TRIES) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof Transient)) throw error
      if (attempt >= tries) throw new PullFailed(error.code ?? 'SITE_RESOURCE_LIMIT', error.message)
      onTransient()
      // A long Retry-After is a refusal, never permission to retry sooner. Avoid timer overflow.
      if (error.retryAfterMs > 2_147_483_647) throw new PullFailed('LIVE_RATE_LIMITED')
      await sleep(Math.max(500 * 2 ** attempt, error.retryAfterMs ?? 0))
    }
  }
}

/** The endpoint that answers like the engine: the one given, else Joomla's other door. */
async function door(endpoint, token) {
  const doors = [endpoint]
  const admin = endpoint.replace(/\/index\.php\?/, '/administrator/index.php?')
  const front = endpoint.replace(/\/administrator\/index\.php\?/, '/index.php?')
  for (const other of [admin, front]) if (!doors.includes(other)) doors.push(other)
  let last
  let blocked
  for (const candidate of doors) {
    try {
      await retried(() => call(candidate, token, 'core.manifest'))
      return candidate
    } catch (error) {
      last = error
      if (error.code === 'LIVE_BLOCKED') blocked = error
      if (STOP_NOW.includes(error.code)) throw error
    }
  }
  if (blocked) throw blocked
  throw last instanceof PullFailed ? last : new PullFailed('UNREACHABLE')
}

/**
 * What the site's engine can answer beyond the old calls, from `info`: `db.dump_many` (many tables a
 * request), the three cheap questions of claude-cowork 0.24.51 — `site.fingerprint`,
 * `files.list {hash: false}` and `files.hash` — and 0.24.54's `files.pack {paths}`. An engine that
 * names none reads as before.
 */
async function abilities(endpoint, token) {
  let info = {}
  try {
    info = (await retried(() => call(endpoint, token, 'info'))).info ?? {}
  } catch (error) {
    if (STOP_NOW.includes(error.code)) throw error
  }
  const many = info.db_dump_many
  const maxFiles = Number(info.site_fingerprint?.max_files)
  return {
    dumpMany: many ? Math.max(1, Math.min(5000, Math.floor(Number(many.max_tables) || 5000))) : 0,
    fingerprint:
      Number(info.site_fingerprint?.version) >= 1
        ? {
            maxFiles: Math.max(1000, Math.min(50_000, Math.floor(maxFiles || 20_000))),
            // Version 2 checksums a table's substance: what SKIP_COLUMNS leaves out does not count.
            skip: Number(info.site_fingerprint.version) >= 2 ? SKIP_COLUMNS : []
          }
        : null,
    stat:
      info.files_list?.stat === true && Number(info.files_hash?.max_paths) > 0
        ? {
            limit: Math.max(100, Math.min(5000, Math.floor(Number(info.files_list.max_stat_limit) || 1000))),
            hashPaths: Math.max(1, Math.min(500, Math.floor(Number(info.files_hash.max_paths))))
          }
        : null,
    // Checksums of a table's rows range by range, and one range read again (claude-cowork `db.range_checksums`).
    ranges:
      Number(info.db_range_checksums?.version) >= 1 && Number(info.db_range_checksums.max_starts) > 0
        ? {
            maxStarts: Math.max(1, Math.min(5000, Math.floor(Number(info.db_range_checksums.max_starts)))),
            maxLimit: Math.max(
              50,
              Math.min(5000, Math.floor(Number(info.db_range_checksums.max_limit) || 2000))
            )
          }
        : null,
    // How many named files one pack may carry: the changed files file.read will not serve.
    packPaths:
      Number(info.files_pack?.max_paths) > 0
        ? Math.max(1, Math.min(2000, Math.floor(Number(info.files_pack.max_paths))))
        : 0
  }
}

/**
 * A dump stream cut back into its tables: `sinkFor(table)` gets every byte from that table's
 * `-- table` line to the next one. A value never holds a raw newline (`SqlValue` writes `\n`), so a
 * line that starts with the marker is always the dumper's own.
 */
function tableSplitter(sinkFor) {
  let carry = Buffer.alloc(0)
  let sink = null
  const markerAt = (data, from) => {
    for (let at = data.indexOf(TABLE_MARKER, from); at >= 0; at = data.indexOf(TABLE_MARKER, at + 1))
      if (at === 0 || data[at - 1] === 10) return at
    return -1
  }
  const nameAt = (data, at) => {
    const end = data.indexOf(10, at)
    const line = data.subarray(at + TABLE_MARKER.length, end).toString('utf8')
    if (!line.endsWith('`')) throw new PullFailed('BAD_DUMP', 'a table line the dumper does not write')
    return line.slice(0, -1).replace(/``/g, '`')
  }
  const emit = async (data, from, to) => {
    if (to <= from) return
    if (!sink) throw new PullFailed('BAD_DUMP', 'rows before any table')
    await sink.write(data.subarray(from, to))
  }
  return {
    async write(chunk) {
      const data = carry.length ? Buffer.concat([carry, chunk]) : chunk
      // Only whole lines are cut: a marker split across two chunks is read once both have come.
      const whole = data.lastIndexOf(10) + 1
      let from = 0
      for (let at = markerAt(data, 0); at >= 0 && at < whole; at = markerAt(data, at + 1)) {
        await emit(data, from, at)
        sink = await sinkFor(nameAt(data, at))
        from = at
      }
      await emit(data, from, whole)
      carry = Buffer.from(data.subarray(whole))
    },
    async end() {
      await emit(carry, 0, carry.length)
      carry = Buffer.alloc(0)
    }
  }
}

/**
 * Rows a running site rewrites by itself inside a table of substance — WordPress's transients and
 * WP-Cron in `options`, its login sessions in `usermeta`, the auto-drafts wp-admin makes in `posts` —
 * as `{table: pattern over the row's dumped tuple}` (TRACY_SYNC_VOLATILE_ROWS, from webroot-sync.sh:
 * `live_sync_wordpress.py volatile-rows`). Left out of every digest, as the volatile tables are left
 * out of the comparison: a visit that runs WP-Cron while the site is read does not make two reads
 * disagree.
 */
const tableRules = (env) => {
  try {
    return Object.entries(JSON.parse(process.env[env] || '{}'))
  } catch {
    return []
  }
}
const ruleOf = (rules, table) => rules.find(([t]) => table === t || table.endsWith(`_${t}`))?.[1] ?? null
const volatileRows = tableRules('TRACY_SYNC_VOLATILE_ROWS').map(([table, pattern]) => [
  table,
  new RegExp(pattern)
])
const rowSkip = (table) => ruleOf(volatileRows, table)
/**
 * The column that names a row, by its place in the dumped tuple (TRACY_SYNC_ROW_NAMES,
 * `live_sync_wordpress.py row-names`: `option_name`, `meta_key`): how a read that kept changing says
 * WHICH rows moved — by name, never by value.
 */
const rowNames = tableRules('TRACY_SYNC_ROW_NAMES').filter(
  ([, place]) => Number.isInteger(place) && place >= 0
)
const nameAt = (table) => ruleOf(rowNames, table)

/**
 * Every row tuple of a table's dump, and every other statement as written: `onTuple(tuple)` gets the
 * bytes `(…)` of one row, `onOther(bytes)` everything outside the INSERTs.
 */
function rowScanner({ onTuple, onOther }) {
  const INSERT = Buffer.from('INSERT INTO ')
  // `null` at the start of a line, `false` inside any other statement, `true` inside an INSERT.
  let inInsert = null
  let pending = null
  let tupleFrom = -1
  let tupleParts = []
  let depth = 0
  let quoted = false
  let escaped = false
  return {
    write(input) {
      const chunk = pending ? Buffer.concat([pending, input]) : input
      pending = null
      for (let i = 0; i < chunk.length; ) {
        if (inInsert === null) {
          // Too few bytes left to tell an INSERT: wait for the next chunk.
          if (chunk.length - i < INSERT.length && chunk.indexOf(10, i) < 0) {
            pending = Buffer.from(chunk.subarray(i))
            return
          }
          inInsert = chunk.subarray(i, i + INSERT.length).equals(INSERT)
        }
        if (!inInsert) {
          const nl = chunk.indexOf(10, i)
          const to = nl < 0 ? chunk.length : nl + 1
          onOther(chunk.subarray(i, to))
          if (nl >= 0) inInsert = null
          i = to
          continue
        }
        const b = chunk[i]
        if (quoted) {
          if (escaped) escaped = false
          else if (b === 92) escaped = true
          else if (b === 39) quoted = false
        } else if (b === 39 && depth > 0) quoted = true
        else if (b === 40) {
          if (depth++ === 0) tupleFrom = i
        } else if (b === 41 && depth > 0) {
          if (--depth === 0) {
            tupleParts.push(chunk.subarray(tupleFrom, i + 1))
            onTuple(Buffer.concat(tupleParts))
            tupleParts = []
            tupleFrom = -1
          }
        } else if (b === 10 && depth === 0) inInsert = null
        i++
      }
      // A tuple still open at the chunk's end continues in the next one.
      if (depth > 0 && tupleFrom >= 0) {
        tupleParts.push(Buffer.from(chunk.subarray(tupleFrom)))
        tupleFrom = 0
      }
    },
    end() {
      if (pending) onOther(pending)
      pending = null
    }
  }
}

/**
 * A digest of one table's dump that does not depend on how its rows were cut into INSERTs: every
 * statement but the INSERTs as written, then each row tuple on its own. `db.dump_many` cuts a table
 * by bytes and time, so two reads of the same rows rarely group them alike. `skip`: the rows
 * (`rowSkip`) left out.
 */
function rowDigest(skip = null) {
  const hash = createHash('sha256')
  const other = otherLines((line) => hash.update(line))
  const scan = rowScanner({
    onOther: other.write,
    onTuple: (tuple) => {
      if (skip?.test(tuple.toString('utf8'))) return
      hash.update(tuple)
      hash.update('\n')
    }
  })
  return {
    write: (input) => scan.write(input),
    end() {
      scan.end()
      other.end()
      return hash.digest('hex')
    }
  }
}

/**
 * A dump's lines outside its rows, whole, each as the table is rather than as its counter stands:
 * `CREATE TABLE … AUTO_INCREMENT=98679` moves with every row the site inserts — a transient WP-Cron
 * sets, a row skipped as housekeeping — so with it in, two reads of a WordPress site with nothing new
 * never had the same digest, and every sync read and merged for a minute (dev, 27/10/2026).
 */
const AUTO_INCREMENT = /\sAUTO_INCREMENT=\d+/g
function otherLines(onLine) {
  let parts = []
  const flush = () => {
    if (!parts.length) return
    onLine(Buffer.concat(parts).toString('utf8').replace(AUTO_INCREMENT, ''))
    parts = []
  }
  return {
    // A line can come in two pieces (a chunk ends inside it): held until its newline.
    write: (bytes) => {
      parts.push(Buffer.from(bytes))
      if (bytes[bytes.length - 1] === 10) flush()
    },
    end: flush
  }
}

/**
 * The first `count` values of a dumped row tuple `(…)`, each as its text (a quoted string unescaped
 * the way the dumper escaped it, `SqlValue`; NULL as null; a bare number as written).
 */
function tupleValues(tuple, count) {
  const out = []
  let i = 1
  const unescape = { 0: '\0', n: '\n', r: '\r', Z: '\x1a' }
  while (out.length < count && i < tuple.length) {
    if (tuple[i] === "'") {
      let value = ''
      for (i++; i < tuple.length && tuple[i] !== "'"; i++) {
        if (tuple[i] === '\\') {
          i++
          value += unescape[tuple[i]] ?? tuple[i]
        } else value += tuple[i]
      }
      out.push(value)
      i++
    } else {
      const end = tuple.indexOf(',', i)
      const raw = tuple.slice(i, end < 0 ? tuple.length - 1 : end)
      out.push(raw === 'NULL' ? null : raw)
      i = end < 0 ? tuple.length : end
    }
    if (tuple[i] !== ',') break
    i++
  }
  return out
}

/** The most rows of one table compared row by row to name what moved; past it, only the count. */
const MAX_ROWS_NAMED = 300_000
/** How many row names one table's entry carries. */
const NAMES_PER_TABLE = 8

/**
 * A row name of a site's own housekeeping that its list does not name yet — a lock, a cron or
 * scheduler mark, a transient-like cache, a session, a timestamp, a counter, a heartbeat, a ping: a
 * read that kept changing only in such rows is read once more before it is called busy (`pullDatabase`).
 * Only ever ONE more read: it never turns a busy site into a read one.
 */
const HOUSEKEEPING_NAME =
  /(^|[_\-.])(lock|locks|locked|cron|crons|schedule|scheduled|scheduler|transient|transients|cache|cached|session|sessions|heartbeat|nonce|nonces|timestamp|time|last|count|counter|counts|stats|queue|ping|pings|pinged|doing|running|health|check|checked|expire|expires|expiry|temp|tmp|log|logs|rate|throttle|visits|views|hits)([_\-.]|$)/i

/**
 * What differs between two reads of one table (its part files): `{table, rows, names?, schema?,
 * housekeeping}` — how many rows (by their key, the tuple's first value) were added, deleted or
 * changed, the names of those rows where the table has a naming column (`nameAt`), and whether every
 * one of them looks like housekeeping (`HOUSEKEEPING_NAME`). The rows `rowSkip` names are not
 * counted. Never a value of the site.
 */
function rowsMoved(table, pathA, pathB) {
  const skip = rowSkip(table)
  const place = nameAt(table)
  const rowsOf = (path) => {
    const rows = new Map()
    const other = createHash('sha256')
    const lines = otherLines((line) => other.update(line))
    let tooMany = false
    const scan = rowScanner({
      onOther: lines.write,
      onTuple: (tuple) => {
        if (tooMany) return
        const text = tuple.toString('utf8')
        if (skip?.test(text)) return
        const values = tupleValues(text, place === null ? 1 : Math.max(1, place + 1))
        rows.set(values[0] ?? '', {
          digest: createHash('sha1').update(tuple).digest('hex'),
          name: place === null ? null : (values[place] ?? null)
        })
        if (rows.size > MAX_ROWS_NAMED) tooMany = true
      }
    })
    scan.write(readFileSync(path))
    scan.end()
    lines.end()
    return { rows: tooMany ? null : rows, other: other.digest('hex') }
  }
  const a = rowsOf(pathA)
  const b = rowsOf(pathB)
  const out = { table, rows: null, housekeeping: false }
  if (a.other !== b.other) out.schema = true
  if (!a.rows || !b.rows) return out
  const names = new Set()
  let rows = 0
  let named = 0
  for (const [key, row] of b.rows) {
    const was = a.rows.get(key)
    a.rows.delete(key)
    if (was?.digest === row.digest) continue
    rows++
    const name = row.name ?? was?.name
    if (name != null) {
      named++
      names.add(name)
    }
  }
  for (const row of a.rows.values()) {
    rows++
    if (row.name != null) {
      named++
      names.add(row.name)
    }
  }
  out.rows = rows
  if (names.size)
    out.names = [...names]
      .sort()
      .slice(0, NAMES_PER_TABLE)
      .map((n) => n.slice(0, 80))
  out.housekeeping =
    !out.schema && rows > 0 && named === rows && [...names].every((n) => HOUSEKEEPING_NAME.test(n))
  return out
}

/** A table's entry of `rowsMoved` in a line: `wp_options (cron_x, _foo_lock)`, `wp_posts (2 rows)`. */
const movedLine = (m) =>
  m.names?.length
    ? `${m.table} (${m.names.slice(0, 3).join(', ')}${m.names.length > 3 || m.rows > m.names.length ? ', …' : ''})`
    : m.rows != null
      ? `${m.table} (${m.rows} row${m.rows === 1 ? '' : 's'})`
      : m.table

/** Each table's `rowDigest` in a gzipped dump (the last read's, kept as the next base); `only`: just those. */
async function dumpDigests(gzPath, only = null) {
  const digests = new Map()
  let current = null
  const skip = { write: async () => {} }
  const split = tableSplitter(async (table) => {
    if (current) digests.set(current.table, current.d.end())
    current = null
    if (only && !only.has(table)) return skip
    current = { table, d: rowDigest(rowSkip(table)) }
    return { write: async (b) => current.d.write(b) }
  })
  for await (const chunk of createReadStream(gzPath).pipe(createGunzip())) await split.write(chunk)
  await split.end()
  if (current) digests.set(current.table, current.d.end())
  return digests
}

function writer(path, gzip) {
  const file = createWriteStream(path, { mode: 0o600 })
  const sink = gzip ? createGzip({ level: 6 }) : null
  if (sink) sink.pipe(file)
  const target = sink ?? file
  return {
    write: (chunk) =>
      new Promise((resolve, reject) => target.write(chunk, (e) => (e ? reject(e) : resolve()))),
    close: () =>
      new Promise((resolve, reject) => {
        file.on('finish', resolve)
        file.on('error', reject)
        target.end()
      })
  }
}

/** One table into its own file: answers the rows read and whether its count held still. */
async function pullTable(endpoint, token, table, path, limits) {
  const out = writer(path, false)
  let cursor = ''
  let offset = 0
  let byOffset = false
  let rows = 0
  let first = null
  let last = null
  for (;;) {
    const chunk = await retried(
      () =>
        call(endpoint, token, 'db.dump', {
          table,
          limit: limits.value,
          ...(byOffset ? { offset } : { cursor })
        }),
      () => (limits.value = Math.max(MIN_DB_CHUNK_LIMIT, Math.floor(limits.value / 2)))
    )
    await out.write(Buffer.from(chunk.sql_b64, 'base64'))
    rows += chunk.rows ?? 0
    if (typeof chunk.total === 'number') {
      first ??= chunk.total
      last = chunk.total
    }
    if (typeof chunk.next_cursor === 'string') cursor = chunk.next_cursor
    else {
      byOffset = true
      offset = chunk.next_offset ?? offset + (chunk.rows ?? 0)
    }
    if (chunk.done) break
  }
  await out.close()
  return { rows, still: first === last && (last === null || last === rows) }
}

/**
 * `tables` through `db.dump_many`, `maxTables` a request, cut back into a file per table
 * (`fileOf(table)`). Answers, per table, the rows read and whether its count held still.
 */
async function pullMany(endpoint, token, tables, fileOf, limits, maxTables) {
  const seen = new Map()
  for (let start = 0; start < tables.length; start += maxTables) {
    const batch = tables.slice(start, start + maxTables)
    const outs = new Map()
    const split = tableSplitter(async (table) => {
      if (!batch.includes(table)) throw new PullFailed('BAD_DUMP', `a table not asked for: ${table}`)
      if (!outs.has(table)) outs.set(table, writer(fileOf(table), false))
      return outs.get(table)
    })
    let cursor = null
    let lastError = null
    for (;;) {
      const chunk = await retried(
        () => call(endpoint, token, 'db.dump_many', { tables: batch, cursor, limit: limits.value }),
        () => (limits.value = Math.max(MIN_DB_CHUNK_LIMIT, Math.floor(limits.value / 2)))
      )
      await split.write(Buffer.from(chunk.sql_b64 ?? '', 'base64'))
      for (const p of chunk.progress ?? []) {
        const s = seen.get(p.table) ?? { rows: 0, first: p.total, last: p.total }
        s.rows += p.rows ?? 0
        s.last = p.total
        seen.set(p.table, s)
      }
      if (chunk.done) break
      const key = JSON.stringify(chunk.next_cursor ?? null)
      if (!chunk.next_cursor) throw new PullFailed('BAD_DUMP', 'db.dump_many stopped without a cursor')
      // A table the site could not read at a row: a smaller page once, then it is the site's answer.
      if (chunk.stopped === 'error') {
        if (lastError === key) throw new PullFailed('ENGINE_REFUSED', `db.dump_many: stopped at ${key}`)
        lastError = key
        limits.value = Math.max(MIN_DB_CHUNK_LIMIT, Math.floor(limits.value / 2))
      } else lastError = null
      cursor = chunk.next_cursor
    }
    await split.end()
    for (const out of outs.values()) await out.close()
    for (const table of batch) {
      // A table with no rows still has its CREATE; one the stream never named was not dumped.
      if (!outs.has(table)) throw new PullFailed('BAD_DUMP', `db.dump_many never named ${table}`)
    }
  }
  return new Map(
    tables.map((table) => {
      const s = seen.get(table) ?? { rows: 0, first: null, last: null }
      return [table, { rows: s.rows, still: s.first === s.last && (s.last === null || s.last === s.rows) }]
    })
  )
}

/** A part file's `rowDigest`. */
function digestOf(path, table) {
  const d = rowDigest(rowSkip(table))
  d.write(readFileSync(path))
  return d.end()
}

/**
 * One read of the database, a file per table: `{tables, rows, reread, parts: [{table, path, digest}]}`.
 * `only` reads just those tables (into the same files), keeping `previous` for the others; `partial`:
 * those tables are all that is wanted (`sameRows`). `ranges` (`{kept, dump, skip}`, an engine that
 * answers `db.range_checksums`): a table with ranges `kept` beside the last read `dump` is read range
 * by range (`spliceRanges`), and a big one read whole has its ranges taken (`takeRanges`).
 */
async function readDatabase(
  endpoint,
  token,
  scratch,
  ability,
  { only = null, previous = null, reuse = null, partial = false, seeded = null, ranges = null } = {}
) {
  const { tables: listed } = await retried(() => call(endpoint, token, 'db.tables'))
  const all = listed.filter((t) => !isTracyCopy(t))
  // Parts already read for this read (`seeded`: the row comparison's, moments ago): not asked again.
  const have = new Map((seeded ?? []).map((p) => [p.table, p]))
  const tables = only ? all.filter((t) => only.has(t)) : all.filter((t) => !reuse?.has(t) && !have.has(t))
  const limits = { value: DB_CHUNK_LIMIT }
  const fileOf = (table) => join(scratch, `t${all.indexOf(table)}.sql`)
  let reread = 0
  const reads = new Map()
  mkdirSync(scratch, { recursive: true, mode: 0o700 })
  const counted = (table) => !rowsMove(table)
  const countBusy = (table) =>
    new PullFailed('LIVE_BUSY', `${table} kept changing while it was read`, {
      tables: [{ table, rows: null, count: true, housekeeping: false }]
    })
  const began = Date.now()
  // A table that moved since the last read and kept its ranges: only the ranges that moved are asked for.
  const spliced = new Map()
  const index = ranges?.kept && ability.ranges ? readIndex(ranges.dump) : null
  for (const table of index ? tables : []) {
    const was = ranges.kept.get(table)
    const at = index.get(table)
    if (!was || !at || isVolatile(table)) continue
    try {
      const member = { file: ranges.dump, offset: at.offset, length: at.length }
      const got = await spliceRanges(
        endpoint,
        token,
        table,
        was,
        member,
        ranges.skip,
        ability,
        join(scratch, 'ranges')
      )
      if (got.part) spliced.set(table, got.part)
      note(
        got.part
          ? `database: ${table}: ${got.moved} of ${got.of} range(s) moved, ${got.rows} row(s) read`
          : `database: ${table}: read whole (${got.whole})`
      )
    } catch (error) {
      if (STOP_NOW.includes(error.code)) throw error
      note(`database: ${table}: ranges not answered (${error.code ?? 'error'}); read whole`)
    }
  }
  const whole = tables.filter((table) => !spliced.has(table))
  if (ability.dumpMany) {
    let pending = whole
    for (let attempt = 1; pending.length; attempt++) {
      const got = await pullMany(endpoint, token, pending, fileOf, limits, ability.dumpMany)
      for (const [table, read] of got) reads.set(table, read)
      pending = pending.filter((t) => !got.get(t).still && counted(t))
      if (pending.length && attempt >= TABLE_READS) throw countBusy(pending[0])
      reread += pending.length
      if (pending.length) note(`database: ${pending.slice(0, 5).join(', ')} moved while read; again`)
    }
  } else
    for (const table of whole) {
      for (let attempt = 1; ; attempt++) {
        const read = await pullTable(endpoint, token, table, fileOf(table), limits)
        reads.set(table, read)
        if (read.still || !counted(table)) break
        if (attempt >= TABLE_READS) throw countBusy(table)
        reread++
        note(`database: ${table} moved while it was read; reading it again`)
      }
    }
  // What this read asked the site for and how long it took, the largest tables by rows named: which
  // table a slow read spends its time on (names and counts only).
  if (reads.size) {
    const largest = [...reads]
      .sort((a, b) => (b[1].rows ?? 0) - (a[1].rows ?? 0))
      .slice(0, 3)
      .map(([table, r]) => `${table} ${r.rows ?? 0}`)
    note(
      `database: ${reads.size} table(s) asked for in ${Math.round((Date.now() - began) / 100) / 10}s (rows: ${largest.join(', ')})`
    )
  }
  // The ranges of each big table just read whole, for the next read to compare with.
  const ranged = new Map()
  for (const table of ranges && ability.ranges ? reads.keys() : []) {
    try {
      const taken = await takeRanges(endpoint, token, { table, path: fileOf(table) }, ranges.skip, ability)
      if (taken) ranged.set(table, taken)
    } catch (error) {
      if (STOP_NOW.includes(error.code)) throw error
    }
  }
  const kept = new Map([
    ...(reuse ?? new Map()),
    ...have,
    ...(previous?.parts ?? []).map((p) => [p.table, p]),
    ...spliced
  ])
  const parts = all
    .filter((table) => reads.has(table) || kept.has(table))
    .map((table) =>
      reads.has(table)
        ? {
            table,
            path: fileOf(table),
            digest: digestOf(fileOf(table), table),
            rows: reads.get(table).rows,
            ...(ranged.has(table) ? { ranges: ranged.get(table) } : {})
          }
        : kept.get(table)
    )
  if (!partial && parts.length !== all.length)
    throw new PullFailed('LIVE_BUSY', 'the list of tables changed while it was read', {
      tables: all
        .filter((t) => !reads.has(t) && !kept.has(t))
        .slice(0, 10)
        .map((table) => ({ table, rows: null, housekeeping: false }))
    })
  return {
    tables: all.length,
    rows: parts.reduce((n, p) => n + (p.rows ?? 0), 0),
    reread,
    parts,
    tablesRead: (previous?.tablesRead ?? 0) + tables.length + have.size
  }
}

/**
 * The tables of the last applied read (`last.dump`) whose checksum now is still the one taken before
 * it (`last.tables`): that read's rows are the site's rows, so they are taken from it and not asked
 * for again. A file per table under `dir`: `Map<table, {table, path, digest, rows}>`.
 */
async function reusableTables(last, now, dir) {
  // A table the merge never takes from the live site (`isIgnored`: Tracy's own, sessions, logs) is
  // the last read's whatever its checksum says: read again, it changes nothing the copy holds.
  // A table whose definition moved (a charset, a collation, a column) holds the same rows and the same
  // checksum, yet is no longer the last read's: read again (#120). Unknown on either side: as before.
  const sameDefinition = (t) =>
    !last.definitions ||
    !last.definitionsNow ||
    last.definitions[t] == null ||
    last.definitionsNow[t] == null ||
    last.definitions[t] === last.definitionsNow[t]
  let same = new Set(
    Object.keys(now).filter(
      (t) =>
        now[t] != null &&
        last.tables?.[t] != null &&
        ((now[t] === last.tables[t] && sameDefinition(t)) || isIgnored(t))
    )
  )
  const out = new Map()
  if (same.size === 0) return out
  // Written with its index: each unmoved table is its member, taken as it is — nothing unpacked.
  const index = readIndex(last.dump)
  if (index) {
    for (const table of same) {
      const at = index.get(table)
      if (at)
        out.set(table, {
          table,
          member: { file: last.dump, offset: at.offset, length: at.length },
          digest: at.digest,
          rows: null,
          reused: true
        })
    }
    same = new Set([...same].filter((t) => !out.has(t)))
    if (same.size === 0) return out
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  let n = 0
  const open = new Map()
  const discard = { write: async () => {}, close: async () => {} }
  const split = tableSplitter(async (table) => {
    if (!same.has(table) || open.has(table)) return discard
    const path = join(dir, `b${n++}.sql`)
    const w = writer(path, false)
    open.set(table, { w, path })
    return w
  })
  for await (const chunk of createReadStream(last.dump).pipe(createGunzip())) await split.write(chunk)
  await split.end()
  for (const [table, { w, path }] of open) {
    await w.close()
    out.set(table, { table, path, digest: digestOf(path, table), rows: null, reused: true })
  }
  return out
}

/** The tables named, each in a file of its own under `dir`, out of a gzipped dump: `Map<table, path>`. */
async function tablesOf(gzPath, tables, dir) {
  const out = new Map()
  if (!tables.size) return out
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const open = new Map()
  const discard = { write: async () => {}, close: async () => {} }
  const split = tableSplitter(async (table) => {
    if (!tables.has(table) || open.has(table)) return discard
    const path = join(dir, `t${open.size}.sql`)
    const w = writer(path, false)
    open.set(table, { w, path })
    return w
  })
  for await (const chunk of createReadStream(gzPath).pipe(createGunzip())) await split.write(chunk)
  await split.end()
  for (const [table, { w, path }] of open) {
    await w.close()
    out.set(table, path)
  }
  return out
}

const volatile = (process.env.TRACY_SYNC_VOLATILE ?? 'session')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)
/**
 * Tables the merge never takes from the live site (TRACY_SYNC_IGNORED_TABLES, `live_sync_wordpress.py
 * ignored-tables`: `{prefix, names, patterns}` over the name without the site's prefix) — a plugin's
 * logs, queues, caches and sessions, which its WP-Cron rewrites on every tick.
 */
const ignored = (() => {
  try {
    const rule = JSON.parse(process.env.TRACY_SYNC_IGNORED_TABLES || '{}')
    if (typeof rule.prefix !== 'string' || !rule.prefix) return null
    return {
      prefix: rule.prefix,
      names: new Set(rule.names ?? []),
      patterns: (rule.patterns ?? []).map((p) => new RegExp(p)),
      guessed: (rule.guessed ?? []).map((p) => new RegExp(p))
    }
  } catch {
    return null
  }
})()
/** A table left out only by the shape of its name (`…_log`): a site's own table may look like that. */
const isGuessed = (table) =>
  Boolean(ignored?.guessed?.length) &&
  table.startsWith(ignored.prefix) &&
  ignored.guessed.some((p) => p.test(table.slice(ignored.prefix.length)))
const isIgnored = (table) => {
  if (!ignored || !table.startsWith(ignored.prefix)) return false
  const bare = table.slice(ignored.prefix.length)
  return ignored.names.has(bare) || ignored.patterns.some((p) => p.test(bare))
}
const isVolatile = (table) => volatile.some((v) => table === v || table.endsWith(`_${v}`)) || isIgnored(table)
/**
 * A table whose row count says nothing on its own: one left out of the comparison, or one holding
 * rows the site rewrites by itself (`rowSkip`: a transient set or expired, an auto-draft made or
 * swept). Its count moving while it is read is not read again on the spot: the comparison of two
 * reads (or of the table checksums around one) is what says whether anything else moved.
 */
const rowsMove = (table) => isVolatile(table) || rowSkip(table) !== null
const isNoise = (table) =>
  isVolatile(table) || NOISE_TABLES.some((v) => table === v || table.endsWith(`_${v}`))

/** Every table's `CHECKSUM TABLE`, from `site.fingerprint` without its files. */
async function tableChecksums(endpoint, token, skip = []) {
  const { fingerprint } = await retried(() =>
    call(endpoint, token, 'site.fingerprint', {
      files: false,
      checksums: true,
      ...(skip.length ? { skip_columns: skip } : {})
    })
  )
  return fingerprint?.tables ?? null
}

/** The tables whose checksum is not the same in `a` and `b`, `ignored` ones aside; null when one cannot tell. */
function movedTables(a, b, ignored = isVolatile) {
  if (!a || !b) return null
  const names = new Set([...Object.keys(a), ...Object.keys(b)])
  const moved = []
  for (const table of names) {
    if (ignored(table) || isTracyCopy(table)) continue
    if (a[table] == null || b[table] == null) return null
    if (a[table] !== b[table]) moved.push(table)
  }
  return moved
}

/**
 * The read's dump: one gzip member a table, in the order read, and beside it `<dump>.index.json` —
 * where each table's member lies and its digest. A table the next read finds unmoved is that
 * member's bytes as they are: a WordPress read that took one small table spent 15 s unpacking and
 * packing again the 60 MB of the others (dev, 27/10/2026). Every reader of a gzip file (gzip -dc,
 * Python, this module) reads the members one after the other as one dump.
 */
async function writeDump(path, parts, scratch) {
  const file = createWriteStream(path, { mode: 0o600 })
  const put = async (chunk) => {
    if (!file.write(chunk)) await once(file, 'drain')
  }
  const entries = []
  let offset = 0
  for (const part of parts) {
    let length = 0
    if (part.member && !part.path) {
      const { file: from, offset: start, length: size } = part.member
      for await (const chunk of createReadStream(from, { start, end: start + size - 1 })) {
        length += chunk.length
        await put(chunk)
      }
    } else {
      const gz = createGzip({ level: 6 })
      const feeding = (async () => {
        for await (const chunk of createReadStream(part.path)) if (!gz.write(chunk)) await once(gz, 'drain')
        gz.end()
      })()
      for await (const chunk of gz) {
        length += chunk.length
        await put(chunk)
      }
      await feeding
    }
    entries.push({ table: part.table, offset, length, digest: part.digest })
    offset += length
  }
  await new Promise((resolve, reject) => {
    file.on('finish', resolve)
    file.on('error', reject)
    file.end()
  })
  writeFileSync(
    indexOf(path),
    JSON.stringify({ version: INDEX_VERSION, rules: DIGEST_RULES, bytes: offset, parts: entries }),
    { mode: 0o600 }
  )
  const digests = Object.fromEntries(parts.map((p) => [p.table, p.digest]))
  rmSync(scratch, { recursive: true, force: true })
  return digests
}

/** The dump's index (`writeDump`); its version moves with `rowDigest`, whose digests it holds. */
const INDEX_VERSION = 1
const indexOf = (dump) => `${dump}.index.json`
/** The rules a digest leaves rows out by: an index written under others holds digests of other rows. */
const DIGEST_RULES = createHash('sha1')
  .update(JSON.stringify([process.env.TRACY_SYNC_VOLATILE_ROWS ?? '', process.env.TRACY_SYNC_VOLATILE ?? '']))
  .digest('hex')
/** `Map<table, {offset, length, digest}>` of a dump written with its index, or null: none, another
 * version, or a dump that is not the one indexed (its size says). */
function readIndex(dump) {
  try {
    const index = JSON.parse(readFileSync(indexOf(dump), 'utf8'))
    if (index?.version !== INDEX_VERSION || index.rules !== DIGEST_RULES || !Array.isArray(index.parts))
      return null
    if (index.bytes !== statSync(dump).size) return null
    return new Map(index.parts.map((p) => [p.table, p]))
  } catch {
    return null
  }
}
/** A part's rows in a file of its own: a member kept from the last read is unpacked when asked. */
function partPath(part, dir) {
  if (part.path) return part.path
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const bytes = Buffer.alloc(part.member.length)
  const fd = openSync(part.member.file, 'r')
  try {
    readSync(fd, bytes, 0, bytes.length, part.member.offset)
  } finally {
    closeSync(fd)
  }
  part.path = join(dir, `m${part.member.offset}.sql`)
  writeFileSync(part.path, gunzipSync(bytes), { mode: 0o600 })
  return part.path
}

/**
 * Ranges of a big table. A table of RANGE_MIN_BYTES of dump and more, read whole, is cut into ranges
 * of its rows by its one integer key — about RANGE_BYTES of dump, at most RANGE_ROWS rows, each — and
 * the site's checksum of each range (claude-cowork's `db.range_checksums`) is kept beside the read
 * (`<dump>.ranges.json`). When the table moves, the next read asks for the same ranges, reads again
 * only those whose checksum moved (`db.dump_after`) and keeps the last read's rows for the others: a
 * WordPress sync read the 135 000 rows of `wp_postmeta` again, 15 s, for one edited title (dev,
 * 27/10/2026). Anything that does not add up — a count, a key out of its range, a refusal — reads
 * the table whole, as before.
 */
const RANGE_BYTES = Number(process.env.TRACY_SYNC_RANGE_BYTES) || 512 * 1024
const RANGE_ROWS = 2000
const RANGE_MIN_BYTES = Number(process.env.TRACY_SYNC_RANGE_MIN_BYTES) || 2 * 1024 * 1024
const RANGES_VERSION = 1
const rangesOf = (dump) => `${dump}.ranges.json`
const countOf = (range) => Number(String(range).split(':')[0])

/** The table's one integer key column and its place in a row, from its CREATE TABLE; null when it has none. */
function rangeKey(head) {
  const create = head.slice(head.indexOf('CREATE TABLE'))
  const primary = /^\s*PRIMARY KEY \(`((?:[^`]|``)+)`\)/m.exec(create)
  if (!primary) return null
  const columns = [...create.matchAll(/^ {2}`((?:[^`]|``)+)` (\S+)/gm)]
  const pos = columns.findIndex((column) => column[1] === primary[1])
  if (pos < 0 || !/^(tiny|small|medium|big)?int\b/i.test(columns[pos][2])) return null
  return { key: primary[1].replace(/``/g, '`'), pos }
}

/** A table's dump cut into its lines before the rows and each row with its key (`pos` in the tuple). */
function keyedRows(bytes, pos) {
  const head = []
  const rows = []
  const scan = rowScanner({
    onOther: (b) => {
      if (!rows.length) head.push(Buffer.from(b))
    },
    onTuple: (tuple) => rows.push({ key: BigInt(tupleValues(tuple.toString('latin1'), pos + 1)[pos]), tuple })
  })
  scan.write(bytes)
  scan.end()
  return { head: Buffer.concat(head).toString('utf8'), rows }
}

/** INTERVAL(): how many of the ascending `starts` are at or below `key` — the range it is in. */
function rangeOf(key, starts) {
  let lo = 0
  let hi = starts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= key) lo = mid + 1
    else hi = mid
  }
  return lo
}

const SAFE = BigInt(Number.MAX_SAFE_INTEGER)
/** Each range's rows counted, `starts` cutting them: what `db.range_checksums` counts. */
const countsOf = (rows, starts) => {
  const counts = Array.from({ length: starts.length + 1 }, () => 0)
  for (const row of rows) counts[rangeOf(row.key, starts)]++
  return counts
}

/**
 * The ranges of a table this read took whole (`part.path`), as `{key, pos, starts, ranges}`, or null:
 * not big enough, no one integer key, or the site's counts are not the rows read (it moved since).
 */
async function takeRanges(endpoint, token, part, skip, ability) {
  if (!ability.ranges || isVolatile(part.table) || statSync(part.path).size < RANGE_MIN_BYTES) return null
  const bytes = readFileSync(part.path)
  const at = bytes.indexOf('INSERT INTO ')
  const found = rangeKey(bytes.subarray(0, at < 0 ? bytes.length : at).toString('utf8'))
  if (!found) return null
  const { rows } = keyedRows(bytes, found.pos)
  let starts = []
  let size = 0
  let count = 0
  for (const row of rows) {
    if (count && (size >= RANGE_BYTES || count >= RANGE_ROWS)) {
      starts.push(row.key)
      size = 0
      count = 0
    }
    size += row.tuple.length
    count++
  }
  if (starts.length > ability.ranges.maxStarts) {
    const step = Math.ceil(starts.length / ability.ranges.maxStarts)
    starts = starts.filter((_, i) => i % step === step - 1)
  }
  if (starts.some((start) => start > SAFE || start < -SAFE)) return null
  const { ranges } = await retried(() =>
    call(endpoint, token, 'db.range_checksums', {
      table: part.table,
      key: found.key,
      starts: starts.map(Number),
      skip_columns: skip
    })
  )
  if (!Array.isArray(ranges) || ranges.length !== starts.length + 1) return null
  const counts = countsOf(rows, starts)
  if (ranges.some((range, i) => countOf(range) !== counts[i])) return null
  return { key: found.key, pos: found.pos, starts: starts.map(Number), ranges }
}

/**
 * A table that moved, from the last read's rows (`member`) and its kept ranges (`was`): the ranges
 * whose checksum moved read again, the others kept. `{part, rows, moved, of}` — the part as a whole
 * read now would write it (the site's CREATE TABLE now, the rows in key order), the rows read and
 * how many ranges moved of how many — or `{whole: why}`: the table is read whole.
 */
async function spliceRanges(endpoint, token, table, was, member, skip, ability, dir) {
  const now = await retried(() =>
    call(endpoint, token, 'db.range_checksums', {
      table,
      key: was.key,
      starts: was.starts,
      skip_columns: skip
    })
  )
  if (!Array.isArray(now.ranges) || now.ranges.length !== was.ranges.length || typeof now.create !== 'string')
    return { whole: 'an answer of another shape' }
  const moved = now.ranges.flatMap((range, i) => (range === was.ranges[i] ? [] : [i]))
  // None moved though the table's checksum did: a write between the two questions. Most moved: one
  // whole read costs less than many range reads.
  if (!moved.length) return { whole: 'no range moved' }
  if (moved.length * 2 > now.ranges.length)
    return { whole: `${moved.length} of ${now.ranges.length} ranges moved` }
  const starts = was.starts.map(BigInt)
  const kept = Array.from({ length: now.ranges.length }, () => [])
  for (const row of keyedRows(readFileSync(partPath({ member }, dir)), was.pos).rows)
    kept[rangeOf(row.key, starts)].push(row)
  // The last read's rows are the ones its ranges were taken over.
  if (kept.some((rows, i) => rows.length !== countOf(was.ranges[i])))
    return { whole: 'the last read is not what its ranges counted' }
  let read = 0
  for (const i of moved) {
    const want = countOf(now.ranges[i])
    const got = []
    let after = i === 0 ? null : Number(starts[i - 1] - 1n)
    while (got.length < want) {
      const chunk = await retried(() =>
        call(endpoint, token, 'db.dump_after', {
          table,
          key: was.key,
          after,
          limit: Math.min(want - got.length, ability.ranges.maxLimit)
        })
      )
      const { rows } = keyedRows(Buffer.from(chunk.sql_b64 ?? '', 'base64'), was.pos)
      if (!rows.length) break
      got.push(...rows)
      const last = rows.at(-1).key
      if (last > SAFE) return { whole: 'a key past what JSON carries' }
      after = Number(last)
    }
    if (got.length !== want || got.some((row) => rangeOf(row.key, starts) !== i))
      return { whole: 'a range read again is not what its checksum counted' }
    kept[i] = got
    read += got.length
  }
  // As DbDumper heads a table, then the rows in key order: range by range.
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, `s${member.offset}.sql`)
  const out = writer(path, false)
  const name = table.replace(/`/g, '``')
  await out.write(
    `-- table \`${table}\`\nDROP TABLE IF EXISTS \`${name}\`;\n${now.create ? `${now.create};\n` : ''}`
  )
  const insert = `INSERT INTO \`${name}\` VALUES `
  let batch = []
  let size = 0
  const flush = async () => {
    if (!batch.length) return
    await out.write(
      Buffer.concat([Buffer.from(insert), ...batch.flatMap((t, i) => (i ? [COMMA, t] : [t])), END])
    )
    batch = []
    size = 0
  }
  let rows = 0
  for (const range of kept)
    for (const row of range) {
      batch.push(row.tuple)
      size += row.tuple.length
      rows++
      if (size >= 1024 * 1024) await flush()
    }
  await flush()
  await out.close()
  return {
    part: {
      table,
      path,
      digest: digestOf(path, table),
      rows,
      ranges: { key: was.key, pos: was.pos, starts: was.starts, ranges: now.ranges }
    },
    rows: read,
    moved: moved.length,
    of: now.ranges.length
  }
}
const COMMA = Buffer.from(',')
const END = Buffer.from(';\n')

/** The ranges kept beside a read (`writeRanges`) as `Map<table, {key, pos, starts, ranges}>`, or null:
 * none, taken another way, or not that dump's (its size says, as its index's does). */
function readRanges(dump, skip) {
  try {
    const kept = JSON.parse(readFileSync(rangesOf(dump), 'utf8'))
    if (kept?.version !== RANGES_VERSION || kept.rules !== DIGEST_RULES) return null
    if (JSON.stringify(kept.skip) !== JSON.stringify(skip) || kept.bytes !== statSync(dump).size) return null
    if (!readIndex(dump)) return null
    return new Map(Object.entries(kept.tables ?? {}))
  } catch {
    return null
  }
}

/** The ranges of the parts that have them, beside the dump just written; none at all, no file. */
function writeRanges(dump, parts, skip) {
  const tables = Object.fromEntries(parts.filter((p) => p.ranges).map((p) => [p.table, p.ranges]))
  if (!Object.keys(tables).length) return rmSync(rangesOf(dump), { force: true })
  writeFileSync(
    rangesOf(dump),
    JSON.stringify({
      version: RANGES_VERSION,
      rules: DIGEST_RULES,
      skip,
      bytes: statSync(dump).size,
      tables
    }),
    { mode: 0o600 }
  )
}

/**
 * The database as it stood still. With the site's table checksums (claude-cowork 0.24.51): ONE read,
 * kept when no table's checksum moved across it — the tables that did are read again, alone, and a
 * table whose two reads in a row agree row for row (`rowDigest`, the rows the site rewrites by itself
 * left out) stood still between them whatever its checksum says. Else two whole reads that must
 * agree row for row on every table but the volatile ones. Either way the read is one moment of the
 * site. `checksumsBefore` is the quick check's, when taken.
 */
async function pullDatabase(
  endpoint,
  token,
  path,
  scratch,
  ability,
  checksumsBefore = null,
  last = null,
  seeded = null
) {
  if (ability.fingerprint) {
    const skip = ability.fingerprint.skip
    let before = checksumsBefore ?? (await tableChecksums(endpoint, token, skip))
    // Only the tables that moved since the last applied read are read; the others are that read's.
    const reuse = last && before ? await reusableTables(last, before, join(scratch, 'base')) : null
    // The ranges kept beside that read: an unmoved table keeps its own, a moved one is read by them.
    const kept = ability.ranges && last ? readRanges(last.dump, skip) : null
    for (const [table, part] of reuse ?? []) if (kept?.has(table)) part.ranges = kept.get(table)
    const ranges = ability.ranges ? { kept, dump: last?.dump, skip } : null
    let read = await readDatabase(endpoint, token, join(scratch, 'a'), ability, { reuse, seeded, ranges })
    // A checksum covers every row: WordPress's `wp_options` moves with each WP-Cron tick (`cron`, the
    // transients), so its checksum never holds still on a site with visitors, and comparing checksums
    // alone made every read of it busy (dev, 24/10/2026). Its two reads compared row by row decide.
    const settled = new Set()
    // The rows that differed between the last two reads of each table read again (`rowsMoved`).
    const differed = new Map()
    let rounds = DB_ROUNDS
    for (let round = 1; ; round++) {
      const after = await tableChecksums(endpoint, token, skip)
      const moved = movedTables(before, after, (table) => isVolatile(table) || settled.has(table))
      if (moved === null) break // A table the server gives no checksum for: the two-read way below.
      if (moved.length === 0) {
        const digests = await writeDump(path, read.parts, scratch)
        // A table settled by two reads that agree still moves (its rows the site rewrites by itself):
        // its ranges may not be its rows. It is read whole next time and its ranges taken then.
        writeRanges(
          path,
          read.parts.filter((p) => !settled.has(p.table)),
          skip
        )
        return {
          tables: read.tables,
          tablesRead: read.tablesRead,
          reread: read.reread,
          dbRounds: round,
          dbCheck: reuse ? 'checksum-incremental' : 'checksum',
          digests
        }
      }
      note(`database: ${moved.slice(0, 5).join(', ')} changed while read; again`)
      const what = moved.map((table) => differed.get(table) ?? { table, rows: null, housekeeping: false })
      // As with two reads: one more when all that kept moving looks like the site's own housekeeping.
      if (round >= rounds && rounds === DB_ROUNDS && what.every((m) => m.housekeeping)) {
        rounds++
        note("database: only the site's own housekeeping moved; once more")
      }
      if (round >= rounds) throw dbBusy(what)
      const was = new Map(read.parts.map((p) => [p.table, p]))
      // Each round in a folder of its own: the read before stays, to be compared with.
      read = await readDatabase(endpoint, token, join(scratch, `r${round}`), ability, {
        only: new Set(moved),
        previous: read,
        ranges: ranges && { kept: null, skip }
      })
      for (const part of read.parts) {
        const prior = was.get(part.table)
        if (!moved.includes(part.table) || !prior) continue
        if (prior.digest === part.digest) {
          settled.add(part.table)
          differed.delete(part.table)
        } else
          differed.set(part.table, rowsMoved(part.table, partPath(prior, join(scratch, 'kept')), part.path))
      }
      before = after
    }
  }
  let before = await readDatabase(endpoint, token, join(scratch, 'a'), ability)
  // One read more than DB_ROUNDS when the last two differed only in rows that look like the site's
  // own housekeeping (`rowsMoved`): a WP-Cron tick between two reads is not a busy site.
  let rounds = DB_ROUNDS
  for (let round = 1; ; round++) {
    const after = await readDatabase(endpoint, token, join(scratch, round % 2 ? 'b' : 'a2'), ability)
    const partOf = new Map(before.parts.map((p) => [p.table, p]))
    const now = new Set(after.parts.map((p) => p.table))
    const moved = [
      ...after.parts.filter((p) => !isVolatile(p.table) && partOf.get(p.table)?.digest !== p.digest),
      ...before.parts.filter((p) => !now.has(p.table))
    ].map((p) => p.table)
    if (moved.length === 0 && after.tables === before.tables) {
      const digests = await writeDump(path, after.parts, scratch)
      return {
        tables: after.tables,
        rows: after.rows,
        reread: before.reread + after.reread,
        dbRounds: round + 1,
        dbCheck: 'two-reads',
        digests
      }
    }
    // What moved, row by row where the two reads' files can say (`rowsMoved`): named in the job's
    // output, and in the answer when the read stops.
    const what = moved.map((table) =>
      partOf.has(table) && now.has(table)
        ? rowsMoved(table, partOf.get(table).path, after.parts.find((p) => p.table === table).path)
        : { table, rows: null, housekeeping: false }
    )
    note(
      `database: changed between two reads (${what.slice(0, 5).map(movedLine).join('; ') || 'the list of tables'}); reading again`
    )
    if (round >= rounds && rounds === DB_ROUNDS && what.length && what.every((m) => m.housekeeping)) {
      rounds++
      note("database: only the site's own housekeeping moved; once more")
    }
    if (round >= rounds) throw dbBusy(what)
    before = after
  }
}

/** LIVE_BUSY for a database that kept changing, naming the tables (and rows, where known) that did. */
function dbBusy(what) {
  return new PullFailed(
    'LIVE_BUSY',
    `the database kept changing (${what.slice(0, 5).map(movedLine).join('; ')})`,
    {
      tables: what.slice(0, 10)
    }
  )
}

async function pullFiles(endpoint, token, path, paths = null) {
  const out = writer(path, false)
  let cursor = { path: '', offset: 0, size: 0 }
  // Cut to the files named (claude-cowork 0.24.54): the same bytes a whole pack carries for them.
  const cut = paths ? { paths } : {}
  let files = 0
  let bytes = 0
  for (let part = 1; ; part++) {
    if (part > MAX_PARTS) throw new PullFailed('TOO_MANY_PARTS')
    const packed = await retried(() =>
      call(endpoint, token, 'files.pack', {
        inline: true,
        target_bytes: TARGET_PART_BYTES,
        ...cut,
        ...cursor
      })
    )
    if (typeof packed.part_b64 !== 'string')
      throw new PullFailed('NO_INLINE_PACK', 'the engine predates inline parts')
    await out.write(Buffer.from(packed.part_b64, 'base64'))
    files += packed.files ?? 0
    bytes += packed.bytes ?? 0
    cursor = { path: packed.next_path, offset: packed.next_offset, size: packed.next_size ?? 0 }
    if (part % 10 === 0) note(`files: ${files} files, ${bytes} bytes`)
    if (packed.done) break
  }
  await out.close()
  return { files, bytes }
}

/**
 * The lot `files.list` is asked for: halved on every lot the site could not finish, and kept for
 * the rest of this read — the second listing walks the same files.
 */
let listLimit = LIST_LIMIT

/** The whole webroot as the site lists it: `Map<path, {size, sha1}>`. */
async function listAll(endpoint, token) {
  const files = new Map()
  let after = ''
  for (;;) {
    const lot = await retried(
      () => call(endpoint, token, 'files.list', { after, limit: listLimit }),
      () => (listLimit = Math.max(MIN_LIST_LIMIT, Math.floor(listLimit / 2))),
      // Room to halve from LIST_LIMIT down to MIN_LIST_LIMIT, and then still ask again.
      TRIES + Math.ceil(Math.log2(LIST_LIMIT / MIN_LIST_LIMIT))
    )
    for (const f of lot.files ?? [])
      if (!isTracyPath(f.path)) files.set(f.path, { size: f.size, sha1: f.sha1 })
    if (lot.done || !lot.next_cursor) break
    after = lot.next_cursor
  }
  return files
}

/** The whole webroot by size and mtime only (`files.list {hash: false}`): `Map<path, {size, mtime}>`. */
async function listStat(endpoint, token, limit) {
  const files = new Map()
  let after = ''
  for (;;) {
    const lot = await retried(() => call(endpoint, token, 'files.list', { after, limit, hash: false }))
    for (const f of lot.files ?? [])
      if (!isTracyPath(f.path)) files.set(f.path, { size: f.size, mtime: f.mtime })
    if (lot.done || !lot.next_cursor) break
    after = lot.next_cursor
  }
  return files
}

/**
 * The sha1 the site gives each of `paths` (`files.hash`), `per` a request. Null is "not handed out":
 * gone since it was listed, or a file the engine never hashes one by one (configuration.php, `.env`).
 */
async function hashPaths(endpoint, token, paths, per) {
  const out = new Map()
  for (let i = 0; i < paths.length; i += per) {
    const { hashes = {} } = await retried(() =>
      call(endpoint, token, 'files.hash', { paths: paths.slice(i, i + per) })
    )
    for (const p of paths.slice(i, i + per)) out.set(p, typeof hashes[p] === 'string' ? hashes[p] : null)
  }
  return out
}

/** A manifest entry as `{sha1, size?, mtime?}`: a manifest written before 0.24.51 holds the sha1 alone. */
const entryOf = (value) =>
  typeof value === 'string' ? { sha1: value } : value && typeof value === 'object' ? value : null

/**
 * The webroot listed with every sha1, asking the site to hash only what may have moved: a file whose
 * size and mtime are those of the last read keeps that read's sha1 (`files.list {hash: false}` +
 * `files.hash`). Without a last read, every file is hashed here after the whole tree came (`full`).
 */
async function listCheap(endpoint, token, ability, base) {
  const listing = await listStat(endpoint, token, ability.stat.limit)
  if (!base) return { listing, hashed: 0 }
  const ask = [...listing]
    .filter(([p, f]) => {
      const was = entryOf(base[p])
      return !was?.sha1 || was.moved || was.size !== f.size || was.mtime !== f.mtime
    })
    .map(([p]) => p)
  const hashes = await hashPaths(endpoint, token, ask, ability.stat.hashPaths)
  for (const [p, f] of listing) {
    if (!hashes.has(p)) f.sha1 = entryOf(base[p]).sha1
    // Listed but not hashed (protected): its sha1 is unknown, so it is read with the whole tree.
    else if (hashes.get(p) === null) f.unknown = true
    else f.sha1 = hashes.get(p)
  }
  return { listing, hashed: ask.length }
}

/**
 * A manifest's `git:<oid>` sha1: a file the live site had not moved since the read whose tree holds
 * it, named by that tree's blob (webroot-sync.sh builds such a manifest when a sync read no file).
 * Compared as a name, never as the bytes' sha1: a file hashed again reads as changed.
 */
const isTreeSha = (sha1) => typeof sha1 === 'string' && sha1.startsWith('git:')

/** A path the site named, as a place under `root`: never absolute, never `..`. */
function under(root, rel) {
  const parts = String(rel).split('/')
  if (rel.startsWith('/') || parts.some((p) => p === '..' || p === ''))
    throw new PullFailed('BAD_PATH', 'a listed path leaves the webroot')
  return join(root, ...parts)
}

/** One file through `file.read`, its bytes checked against the sha1 it was listed with. */
async function readOne(endpoint, token, path, sha1, root) {
  const got = await retried(() => call(endpoint, token, 'file.read', { path }))
  const bytes = Buffer.from(got.content_b64, 'base64')
  const real = createHash('sha1').update(bytes).digest('hex')
  const file = under(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  return real === sha1
}

const sha1File = (file) => createHash('sha1').update(readFileSync(file)).digest('hex')

/** Every regular file under `root`, relative path → sha1. */
function walk(root, base = root, out = new Map()) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, entry.name)
    if (entry.isDirectory()) walk(abs, base, out)
    else if (entry.isFile())
      out.set(
        abs
          .slice(base.length + 1)
          .split('\\')
          .join('/'),
        sha1File(abs)
      )
  }
  return out
}

/**
 * The webroot: only what changed since the last read when its manifest is given and every changed
 * file can be read one by one (not protected, not over MAX_READ_BYTES), else the whole tree
 * through `files.pack`. Then listed again: what moved during the read is read again.
 */
async function pullWebroot(endpoint, token, live, ability, steady = null) {
  const manifestIn = process.env.TRACY_SYNC_MANIFEST_IN ?? ''
  const base = manifestIn && existsSync(manifestIn) ? JSON.parse(readFileSync(manifestIn, 'utf8')) : null
  const cheap = Boolean(ability.stat)
  // Listed with sha1s: cheaply (sizes and mtimes, then the site hashes what moved), or the old way.
  const list = async (last) =>
    cheap ? (await listCheap(endpoint, token, ability, last)).listing : listAll(endpoint, token)
  const listing = await list(base)
  const baseSha = (p) => entryOf(base?.[p])?.sha1
  let mode = 'full'
  let root = join(live, 'tree')
  let read = 0
  // `unknown` is a file the site was asked to hash (it moved, or the manifest named it without a
  // sha1) and would not: changed, whatever the manifest says. Compared by sha1 alone, a manifest
  // entry without one (`stat-manifest` names configuration.php by size and mtime: the tree holds the
  // copy's own) read as "none then, none now", and every later Global Configuration edit on the live
  // site was left out of every sync without a word (Site Name, dev, 24/10/2026).
  const changed = base
    ? [...listing].filter(([p, f]) => f.unknown || baseSha(p) !== f.sha1).map(([p]) => p)
    : []
  // Which files moved, by path (the first few): a WordPress read with nothing new went on to merge
  // for a file that brought nothing, and nothing said which (dev, 27/10/2026).
  if (changed.length)
    note(
      `files: ${changed.length} changed (${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ', …' : ''})`
    )
  // What file.read will not serve — a protected file (configuration.php: no sha1 either, the site
  // will not hash it) or one too large — comes in a pack cut to those files where the engine can
  // cut one; else the whole tree is read. A changed Global Configuration alone made a sync read
  // the customer's whole 578 MB site for one file (22/10/2026).
  const alone = (p) => listing.get(p).size <= MAX_READ_BYTES && !listing.get(p).unknown
  const packed = changed.filter((p) => !alone(p))
  if (base && (packed.length === 0 || ability.packPaths > 0)) {
    mode = 'incremental'
    root = join(live, 'changes')
    mkdirSync(root, { recursive: true, mode: 0o700 })
    // A few at a time: each file is its own request, and a self-update of a theme brings hundreds.
    const queue = changed.filter(alone)
    let refused = false
    const worker = async () => {
      for (let path = queue.shift(); path !== undefined && !refused; path = queue.shift()) {
        try {
          read++
          if (!(await readOne(endpoint, token, path, listing.get(path).sha1, root)))
            listing.set(path, { ...listing.get(path), moved: true })
        } catch (error) {
          // A protected file is never handed back one by one: in the pack, or the whole tree.
          if (error.code !== 'ENGINE_REFUSED') throw error
          if (ability.packPaths > 0) packed.push(path)
          else refused = true
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, queue.length) }, worker))
    for (let i = 0; !refused && i < packed.length; i += ability.packPaths) {
      const lot = packed.slice(i, i + ability.packPaths)
      const tar = join(live, 'cut.tar')
      await pullFiles(endpoint, token, tar, lot)
      const untar = spawnSync('tar', ['-xf', tar, '-C', root], { encoding: 'utf8' })
      if (untar.status !== 0) throw new PullFailed('BAD_ARCHIVE', untar.stderr.slice(0, 200))
      rmSync(tar, { force: true })
      for (const path of lot) {
        read++
        const f = listing.get(path)
        const file = under(root, path)
        if (!existsSync(file)) {
          // Gone since it was listed: the listing after the read says so.
          listing.set(path, { ...f, moved: true })
          continue
        }
        const sha1 = sha1File(file)
        // A protected file is listed without a sha1: the bytes packed are its own, checked by size.
        if (f.sha1 === undefined) {
          const { unknown: _unknown, ...known } = f
          listing.set(path, statSync(file).size === f.size ? { ...known, sha1 } : { ...f, moved: true })
        } else if (sha1 !== f.sha1) listing.set(path, { ...f, moved: true })
      }
      note(`files: ${lot.length} file(s) file.read does not serve, in one cut pack`)
    }
    if (refused) {
      mode = 'full'
      rmSync(root, { recursive: true, force: true })
      root = join(live, 'tree')
    }
  }
  if (mode === 'full') {
    const tar = join(live, 'webroot.tar')
    await pullFiles(endpoint, token, tar)
    mkdirSync(root, { recursive: true, mode: 0o700 })
    const untar = spawnSync('tar', ['-xf', tar, '-C', root], { encoding: 'utf8' })
    if (untar.status !== 0) throw new PullFailed('BAD_ARCHIVE', untar.stderr.slice(0, 200))
    rmSync(tar, { force: true })
    const got = walk(root)
    for (const [path, f] of listing) {
      // A cheap listing of a first read names no sha1: the tree's own is taken, checked by size;
      // the listing after the read says what moved while it ran. Listed and not in the tree is
      // moved even with no sha1 to compare (a protected file): read again below, or the read stops
      // naming it — never kept as the last read's.
      if ((f.sha1 === undefined || isTreeSha(f.sha1)) && got.has(path)) {
        const size = statSync(under(root, path)).size
        const { unknown: _unknown, ...known } = f
        listing.set(path, size === f.size ? { ...known, sha1: got.get(path) } : { ...f, moved: true })
      } else if (!got.has(path) || got.get(path) !== f.sha1) listing.set(path, { ...f, moved: true })
    }
    read = listing.size
  }

  // Listed again: a file whose sha1 moved (or that came or went) changed while the read ran. Unless
  // the files' fingerprint, asked again, is the one taken before the listing: then nothing came, went
  // or moved since (one request, where listing 42 000 files again took 15 s on the customer's site).
  const listedAgain = [...listing.values()].some((f) => f.moved) || !(steady && (await steady()))
  const refused = new Set()
  for (let round = 1; listedAgain; round++) {
    const again = await list(Object.fromEntries(listing))
    const moved = new Set(
      [...listing].filter(([p, f]) => f.moved || again.get(p)?.sha1 !== f.sha1).map(([p]) => p)
    )
    for (const p of again.keys()) if (!listing.has(p)) moved.add(p)
    for (const p of moved) {
      const now = again.get(p)
      if (!now) {
        listing.delete(p)
        if (mode === 'full') rmSync(under(root, p), { force: true })
        continue
      }
      if (now.size > MAX_READ_BYTES) throw filesBusy([p], `${p} changed while the site was read`)
      read++
      const same = await readOne(endpoint, token, p, now.sha1, root).catch((error) => {
        if (error.code !== 'ENGINE_REFUSED') throw error
        // Refused once: most often a file the site deleted since it listed it (a log rotated, a
        // temporary file). The next listing says so; a file still listed and refused again is busy.
        if (refused.has(p)) throw filesBusy([p], `${p} changed while the site was read`)
        refused.add(p)
        return false
      })
      listing.set(p, { ...now, moved: !same })
    }
    if (moved.size === 0) break
    if (round >= FILE_ROUNDS)
      throw filesBusy([...moved], `files kept changing (${[...moved].slice(0, 3).join(', ')})`)
    note(`files: ${moved.size} changed while they were read; read again`)
  }

  // With the cheap listing, each file's size and mtime too: the next read hashes only what moved.
  const manifest = Object.fromEntries(
    [...listing].map(([p, f]) => [p, cheap ? { sha1: f.sha1, size: f.size, mtime: f.mtime } : f.sha1])
  )
  writeFileSync(join(live, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 })
  if (mode === 'incremental') {
    const deleted = Object.keys(base).filter((p) => !listing.has(p) && !isTracyPath(p))
    writeFileSync(join(live, 'deleted.json'), JSON.stringify(deleted), { mode: 0o600 })
    return {
      mode,
      list: cheap ? 'stat' : 'sha1',
      listedAgain,
      files: listing.size,
      changed: changed.length,
      read,
      deleted: deleted.length
    }
  }
  return {
    mode,
    list: cheap ? 'stat' : 'sha1',
    listedAgain,
    files: listing.size,
    read,
    bytes: [...listing.values()].reduce((n, f) => n + (f.size ?? 0), 0)
  }
}

/** LIVE_BUSY for files that kept changing, naming a few of them (their paths, never their bytes). */
function filesBusy(paths, detail) {
  return new PullFailed('LIVE_BUSY', detail, { files: paths.slice(0, 5).map((p) => String(p).slice(0, 200)) })
}

/**
 * The live site in a few requests (`site.fingerprint`): its files' sizes and mtimes digested page by
 * page, and every table's checksum. Equal to the one taken before the last applied read → nothing
 * changed on the live site since, and there is nothing to read.
 */
async function fingerprintNow(endpoint, token, maxFiles, skip = [], { tables: withTables = true } = {}) {
  const pages = []
  let count = 0
  let bytes = 0
  let tables = null
  let definitions = null
  let triggers = null
  let after = ''
  for (let page = 0; ; page++) {
    const { fingerprint } = await retried(() =>
      call(endpoint, token, 'site.fingerprint', {
        after,
        limit: maxFiles,
        checksums: withTables && page === 0,
        // Each table's definition and the triggers (an engine without them answers neither, #120).
        ...(withTables && page === 0 ? { definitions: true } : {}),
        ...(page === 0 && skip.length ? { skip_columns: skip } : {})
      })
    )
    if (page === 0) {
      tables = fingerprint?.tables ?? null
      definitions = fingerprint?.definitions ?? null
      triggers = Array.isArray(fingerprint?.triggers) ? fingerprint.triggers : null
    }
    const files = fingerprint?.files
    if (!files) break
    pages.push(files.digest)
    count += files.count ?? 0
    bytes += files.bytes ?? 0
    if (!files.next_after) break
    after = files.next_after
  }
  return {
    version: 1,
    pageSize: maxFiles,
    skip,
    files: { count, bytes, pages },
    tables,
    ...(definitions ? { definitions } : {}),
    ...(triggers ? { triggers } : {})
  }
}

/** The files of two fingerprints taken with one page size: the same pages, so nothing moved between them. */
const sameFiles = (a, b) =>
  Boolean(a?.files && b?.files) &&
  a.pageSize === b.pageSize &&
  a.files.count === b.files.count &&
  a.files.bytes === b.files.bytes &&
  JSON.stringify(a.files.pages) === JSON.stringify(b.files.pages)

/** Two fingerprints taken the same way: the same page size and the same columns left out. */
const comparable = (a, b) =>
  Boolean(a && b) &&
  a.version === b.version &&
  a.pageSize === b.pageSize &&
  JSON.stringify(a.skip ?? []) === JSON.stringify(b.skip ?? [])

/**
 * Two fingerprints of one site that show no change: every page of files, and every table but the
 * ones only the site's own running moves (`isNoise`: sessions, its logs, its update list).
 */
function sameFingerprint(a, b) {
  if (!comparable(a, b)) return false
  if (a.files?.count !== b.files?.count || a.files?.bytes !== b.files?.bytes) return false
  if (JSON.stringify(a.files?.pages) !== JSON.stringify(b.files?.pages)) return false
  const moved = movedTables(a.tables, b.tables, isNoise)
  return moved !== null && moved.length === 0 && sameDefinitions(a, b)
}

/** No table's definition moved (a charset, collation or column change moves no row, #120); unknown on either side: the same. */
const sameDefinitions = (a, b) =>
  !a?.definitions ||
  !b?.definitions ||
  Object.keys(b.definitions).every(
    (t) =>
      isNoise(t) ||
      a.definitions[t] == null ||
      b.definitions[t] == null ||
      a.definitions[t] === b.definitions[t]
  )

/**
 * What a read saw that a sync does not bring (#120): the live site's triggers (no dump carries one;
 * webroot-sync names those the copy lacks), and the tables left out only by the shape of their name
 * (`…_log`) that the live site changed since the last read. `{}` when nothing.
 */
function notCarriedOf(stored, fingerprint) {
  const tables = Object.keys(fingerprint?.tables ?? {})
    .filter((t) => isGuessed(t) && stored?.tables?.[t] != null && fingerprint.tables[t] !== stored.tables[t])
    .sort()
  return {
    ...(fingerprint?.triggers ? { triggers: fingerprint.triggers.slice(0, 200) } : {}),
    ...(tables.length ? { tables: tables.slice(0, 200) } : {})
  }
}

/**
 * Whether the live site holds, row for row, what the last applied read did, though its fingerprint
 * moved: the files the same (every page), and every table whose checksum moved one holding rows the
 * site rewrites by itself (`rowSkip`). Those tables alone are read again (into `scratch`) and each
 * one's `rowDigest` — those rows left out — compared with its digest in that read
 * (TRACY_SYNC_DB_BASE). Answers what was compared, `{same, tables, rows}` — `same` when every one
 * agrees, else the site is read as usual — or null where there was nothing to compare. Like the fingerprint, taken before the read is done: a
 * change that lands while it runs shows at the next sync, which compares with the same applied read.
 */
async function sameRows(endpoint, token, ability, stored, fingerprint, scratch) {
  const base = process.env.TRACY_SYNC_DB_BASE ?? ''
  if (!ability.fingerprint || !comparable(stored, fingerprint) || !sameFiles(stored, fingerprint)) return null
  if (!base || !existsSync(base)) return null
  const moved = movedTables(stored.tables, fingerprint.tables, isNoise)
  if (!moved?.length || !moved.every((table) => rowSkip(table) !== null)) return null
  let keep = false
  try {
    const read = await readDatabase(endpoint, token, scratch, ability, {
      only: new Set(moved),
      partial: true,
      ranges: ability.ranges
        ? { kept: readRanges(base, ability.fingerprint.skip), dump: base, skip: ability.fingerprint.skip }
        : null
    })
    // The last read's digests from its index when it has one: nothing of it unpacked.
    const index = readIndex(base)
    const was =
      index && moved.every((t) => index.has(t))
        ? new Map(moved.map((t) => [t, index.get(t).digest]))
        : await dumpDigests(base, new Set(moved))
    const same =
      read.parts.length === moved.length &&
      read.parts.every((p) => was.has(p.table) && was.get(p.table) === p.digest)
    // Which rows differ, by name only (an option's, a meta's key): a WordPress read with nothing new
    // still went on to read and merge for 60 s, and nothing said which row held it (dev, 27/10/2026).
    if (!same) {
      const differs = read.parts.filter((p) => was.get(p.table) !== p.digest).map((p) => p.table)
      // The last read's part of each from its index when it has one (its member alone unpacked).
      const files = new Map()
      for (const table of differs) {
        const at = index?.get(table)
        if (at)
          files.set(
            table,
            partPath({ member: { file: base, offset: at.offset, length: at.length } }, join(scratch, 'base'))
          )
      }
      const rest = differs.filter((t) => !files.has(t))
      if (rest.length)
        for (const [t, path] of await tablesOf(base, new Set(rest), join(scratch, 'base'))) files.set(t, path)
      for (const part of read.parts) {
        const at = files.get(part.table)
        if (at) note(`compare: ${movedLine(rowsMoved(part.table, at, part.path))}`)
      }
    }
    const answer = { same, tables: moved, rows: read.parts.reduce((n, p) => n + (p.rows ?? 0), 0) }
    // A row of substance: the read goes on, and the tables just read are its own — not asked for
    // again (a WordPress read asked for wp_postmeta's 135 000 rows twice, 15 s each; dev, 27/10/2026).
    if (!same) {
      answer.parts = read.parts
      keep = true
    }
    return answer
  } finally {
    if (!keep) rmSync(scratch, { recursive: true, force: true })
  }
}

const readJson = (path) => {
  try {
    return path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
  } catch {
    return null
  }
}

/**
 * One line of the read in the job's progress, timed like webroot-sync.sh's steps (`==> [Ns] live read:
 * …`, seconds since the read began): the host keeps only timed lines, and a read that took 55 s said
 * nothing of where (dev, 27/10/2026).
 */
const READ_STARTED = Date.now()
function note(text) {
  process.stderr.write(`==> [${Math.round((Date.now() - READ_STARTED) / 1000)}s] live read: ${text}\n`)
}

async function main(dir) {
  const endpoint = process.env.TRACY_SYNC_ENDPOINT ?? ''
  const token = process.env.TRACY_SYNC_TOKEN ?? ''
  if (!/^https?:\/\//.test(endpoint) || !token) throw new PullFailed('NO_LIVE_CREDENTIAL')
  const live = await door(endpoint, token)
  const out = join(dir, 'live')
  mkdirSync(out, { recursive: true, mode: 0o700 })
  const ability = await abilities(live, token)
  const started = Date.now()
  const liveReadAt = new Date().toISOString()
  const reads = {
    dumpMany: Boolean(ability.dumpMany),
    fingerprint: Boolean(ability.fingerprint),
    stat: Boolean(ability.stat)
  }
  // The quick check: taken BEFORE the read, so a change during the read shows next time.
  let fingerprint = null
  let stored = null
  // Seconds each part took, for the answer: what a sync of this site spends, and where.
  const timing = {}
  const since = (from) => Math.round((Date.now() - from) / 100) / 10
  let at = Date.now()
  if (ability.fingerprint) {
    fingerprint = await fingerprintNow(live, token, ability.fingerprint.maxFiles, ability.fingerprint.skip)
    writeFileSync(join(out, 'fingerprint.json'), JSON.stringify(fingerprint), { mode: 0o600 })
    timing.fingerprint = since(at)
    stored = readJson(process.env.TRACY_SYNC_FINGERPRINT_IN)
    note(`fingerprint ${timing.fingerprint}s${sameFingerprint(stored, fingerprint) ? ': nothing moved' : ''}`)
    if (sameFingerprint(stored, fingerprint)) {
      const notCarried = notCarriedOf(stored, fingerprint)
      return {
        ok: true,
        unchanged: 'fingerprint',
        liveReadAt,
        abilities: reads,
        timing,
        seconds: since(started),
        ...(Object.keys(notCarried).length ? { notCarried } : {})
      }
    }
  }
  // Only the question (TRACY_SYNC_CHECK_ONLY, a Sync anyway taking a held sync's read): the live site
  // moved since that read's fingerprint, or cannot say (no fingerprint here) — nothing is read.
  if (process.env.TRACY_SYNC_CHECK_ONLY === '1')
    return { ok: true, unchanged: null, checked: Boolean(ability.fingerprint), liveReadAt, timing }
  // Only tables holding rows the site rewrites by itself moved (WordPress's options, meta: WP-Cron and
  // transients move their checksum with every visit), and no file: those tables read again and
  // compared row by row with the last applied read's, its housekeeping rows left out.
  at = Date.now()
  const compared = await sameRows(live, token, ability, stored, fingerprint, join(out, 'compare'))
  if (compared) {
    timing.compare = since(at)
    note(
      `database: ${compared.tables.slice(0, 5).join(', ')} moved; row by row ${compared.same ? "only the site's own housekeeping: unchanged" : 'a row of substance differs: reading the site'}`
    )
  } else if (comparable(stored, fingerprint)) {
    // Why the whole database is read although a fingerprint was there to compare with: the tables that
    // moved since (names only), and whether the files did. A WordPress sync read 35 s with nothing new
    // and its log did not say which table moved (dev, 26/10/2026).
    const moved = movedTables(stored.tables, fingerprint.tables, isNoise) ?? []
    note(
      `database: moved since the last read: ${moved.slice(0, 8).join(', ') || 'no table'}${moved.length > 8 ? ` (+${moved.length - 8})` : ''}; files ${sameFiles(stored, fingerprint) ? 'unchanged' : 'moved'}`
    )
  }
  if (compared?.same)
    return {
      ok: true,
      unchanged: 'rows',
      compared: { tables: compared.tables, rows: compared.rows },
      liveReadAt,
      abilities: reads,
      timing,
      seconds: since(started)
    }
  at = Date.now()
  const { digests, ...db } = await pullDatabase(
    live,
    token,
    join(out, 'db.sql.gz'),
    join(out, 'tables'),
    ability,
    fingerprint?.tables ?? null,
    // The last applied read, where its fingerprint was taken the same way: its unmoved tables are reused.
    comparable(stored, fingerprint) &&
      process.env.TRACY_SYNC_DB_BASE &&
      existsSync(process.env.TRACY_SYNC_DB_BASE)
      ? {
          tables: stored.tables,
          definitions: stored.definitions ?? null,
          definitionsNow: fingerprint?.definitions ?? null,
          dump: process.env.TRACY_SYNC_DB_BASE
        }
      : null,
    compared?.parts ?? null
  )
  rmSync(join(out, 'compare'), { recursive: true, force: true })
  timing.database = since(at)
  note(
    `database ${timing.database}s: ${db.tablesRead ?? db.tables ?? '?'} of ${db.tables ?? '?'} table(s) read, ${db.dbRounds ?? '?'} round(s) (${db.dbCheck ?? '?'})`
  )
  at = Date.now()
  // The files did not move since the fingerprint compared with (the import's, or the last applied
  // read's): every page of the walk the same. The webroot is not read at all — the tree compared
  // with is the live site's files (`files-unchanged.json`, webroot-sync.sh). On the customer's site a
  // first sync after an import spent 293 s reading 42 085 files that had not changed (22/10/2026).
  const filesSame =
    comparable(stored, fingerprint) &&
    stored.files?.count === fingerprint.files?.count &&
    stored.files?.bytes === fingerprint.files?.bytes &&
    JSON.stringify(stored.files?.pages) === JSON.stringify(fingerprint.files?.pages)
  let files
  if (filesSame) {
    writeFileSync(join(out, 'files-unchanged.json'), JSON.stringify({ files: fingerprint.files.count }), {
      mode: 0o600
    })
    files = { mode: 'files-unchanged', files: fingerprint.files.count, read: 0, deleted: 0 }
    // No manifest yet (every sync since the import read no file): the files by size and mtime, no
    // byte read or hashed. webroot-sync.sh names each by its blob in the live read's tree, and the
    // first file that moves later is read alone, not with the whole tree (283 s on dev, 22/10/2026).
    const manifestIn = process.env.TRACY_SYNC_MANIFEST_IN ?? ''
    if (ability.stat && !(manifestIn && existsSync(manifestIn))) {
      const listing = await listStat(live, token, ability.stat.limit)
      writeFileSync(join(out, 'stat.json'), JSON.stringify(Object.fromEntries(listing)), { mode: 0o600 })
      files.stat = listing.size
    }
  } else
    files = await pullWebroot(
      live,
      token,
      out,
      ability,
      fingerprint
        ? async () =>
            sameFiles(
              fingerprint,
              await fingerprintNow(live, token, ability.fingerprint.maxFiles, [], { tables: false })
            )
        : null
    )
  timing.files = since(at)
  note(`files ${timing.files}s: ${files.mode ?? '?'}, ${files.read ?? 0} read, ${files.deleted ?? 0} gone`)
  // No fingerprint to ask (an older engine): nothing read differs from the last read, table by
  // table and file by file — the same answer, after the read instead of before it.
  let unchanged = null
  const baseDump = process.env.TRACY_SYNC_DB_BASE ?? ''
  if (
    files.mode === 'incremental' &&
    files.read === 0 &&
    files.deleted === 0 &&
    baseDump &&
    existsSync(baseDump)
  ) {
    const was = await dumpDigests(baseDump)
    const now = new Map(Object.entries(digests))
    const same =
      was.size === now.size && [...now].every(([table, d]) => isVolatile(table) || was.get(table) === d)
    if (same) unchanged = 'compare'
  }
  const notCarried = notCarriedOf(stored, fingerprint)
  return {
    ok: true,
    ...(unchanged ? { unchanged } : {}),
    liveReadAt,
    abilities: reads,
    timing,
    seconds: since(started),
    ...db,
    ...files,
    ...(Object.keys(notCarried).length ? { notCarried } : {})
  }
}

main(process.argv[2] ?? '')
  .then((answer) => console.log(JSON.stringify(answer)))
  .catch((error) => {
    const detail = error.code ? error.detail : error.message
    console.log(
      JSON.stringify({
        ok: false,
        code: error.code ?? 'PULL_FAILED',
        ...(detail ? { detail } : {}),
        ...(error.moved ? { moved: error.moved } : {}),
        ...(error.code === 'LIVE_PHP_TOO_OLD' ? { php: error.php ?? null, min: error.min ?? null } : {})
      })
    )
  })
