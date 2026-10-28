/**
 * The writes of "Sync to live" on an imported site's LIVE site, through the Claude Cowork engine installed
 * on it at import (`webroot/webroot-live-push.sh`, plan tasks/ke-hoach-sync-to-live.md, contract
 * webroot/LIVE-PUSH-CONTRACT.md). Only the actions the engine already ships write: `content.update`,
 * `content.batch` (Joomla), `content.delete`, `media.upload`, `media.delete` (Joomla, a picture under
 * images/), `site.identity` and `template.siteSettings` (Joomla, `operation: set`), and the template door
 * `template.files.write` / `template.files.undo` (a template's or theme's own files, when the live engine
 * has it); `content.get`, `file.read`, `template.files.status` and the two doors' `operation: read` read
 * what the live site holds before each write.
 *
 *   node live-write.mjs apply <preview dir> <push dir> [--confirm-deletes] [--confirm-php] [--limit N] [--webroot W]
 *   node live-write.mjs undo <push dir>
 *   node live-write.mjs info                 (the engine's version, PHP and template door, for the preview)
 *   env TRACY_SYNC_ENDPOINT, TRACY_SYNC_TOKEN (TRACY_SYNC_CONNECT_VIA on a stand)
 *
 * `apply` takes the changeset `lib/live_push.py` left in the preview folder and writes its items in
 * order, at most `--limit`: for each, `content.get` on the live site first, and the write only when
 * every field it writes still holds the value the base had (`expect`) — otherwise the item is a
 * conflict and nothing of it is written: a change the customer made on the live site is never written
 * over. Joomla's updates go in `content.batch` lots with the same values as `expected`, so the engine
 * checks them again inside its transaction; a lot it refuses is written again one item at a time. What
 * the live site held before each write is kept in `<push dir>/before.json` (0600), with what it holds
 * after, for `undo`; every item's end goes to `journal.jsonl` as it happens, so an apply cut off by a
 * restart goes on from there and never writes an item twice.
 *
 * `undo` takes back, newest first, every item `apply` wrote — only where the live site still holds what
 * the write left (a reverse compare-and-set); an item the customer changed since is kept and named.
 *
 * The answer is the last stdout line. The client is live-pull.mjs's (the same envelope, the same
 * doors), kept in step by hand. Reads retry transient failures; writes retry only an explicit
 * writer_busy refusal. An unanswered mutation remains uncertain and is never sent again.
 * 🔒 The token arrives in the environment and goes only into request bodies: never on a command line,
 * into a file, a log line or an answer.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { durablePrivate, lockWriter, mutation, writeRequests } from './live-write-requests.mjs'

const USER_AGENT = 'Mozilla/5.0 (compatible; TracyBot/1.0; +https://tracy.ai)'
const REQUEST_TIMEOUT_MS = 120_000
const TRIES = 4
/** One `content.batch` lot: the engine takes 1–100 operations; a lot stays well under PHP's post size. */
const BATCH_ITEMS = 50
const BATCH_BYTES = 1_500_000
const MEDIA_LIMIT = 8 * 1024 * 1024
const DEFAULT_LIMIT = 200
/** Items written through a door of their own, never in a `content.batch` (a file is not in a transaction). */
const OWN_DOOR = new Set(['file', 'media', 'siteIdentity', 'templateSettings'])
/**
 * How many items written alone (`single`) go to the live site at once. Each is a read, a write and a
 * read back: one after the other, a push of 150 WordPress items took minutes. 1 is the old behaviour.
 */
const CONCURRENCY = (() => {
  const n = Number(process.env.TRACY_LIVE_WRITE_CONCURRENCY ?? 4)
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 4
})()
/** Joomla's nested trees (categories, menu items, tags: `lft`/`rgt` the engine rebuilds) and moves. */
const NESTED = new Set(['category', 'menuItem', 'tag'])
/**
 * The one item of a lane that may be written at a time: everything that touches one live record (a
 * post and its meta, a theme row by slug), a WordPress menu, the terms, the options, a Joomla tree,
 * and the items that go through a door of their own — each lane keeps the changeset's order.
 */
function laneOf(item, platform) {
  if (OWN_DOOR.has(item.kind) || item.op === 'upload') return 'own-door'
  if (item.op === 'move' || (platform === 'joomla' && NESTED.has(item.kind))) return 'tree'
  if (item.kind === 'menuItem') return 'menu'
  if (item.kind === 'term') return 'term'
  if (item.kind === 'option' || item.kind === 'themeMods') return 'option'
  if (item.kind === 'templatePart' || item.kind === 'template') return `theme:${item.key}`
  const record = item.op === 'create' ? item.id : JSON.stringify(item.ident ?? item.liveId ?? item.id)
  if (item.kind === 'postmeta' || item.kind === 'post') return `post:${record}`
  return `${item.kind}:${record}`
}
/** A WordPress block theme's parts and templates: addressed by slug, a row of the active theme over its file. */
const THEME_ROWS = new Set(['templatePart', 'template'])
/**
 * One `template.files.write` call: the door's own limits (`info.template_files`, kept in the changeset
 * as `templateFiles`), and at most 4 MiB decoded — about 5.6 MB of base64 in the request, under PHP's
 * default `post_max_size` of 8 MB that a live site may still run with.
 */
const TEMPLATE_FILES = { maxFiles: 100, maxBytes: 8 * 1024 * 1024, maxFileBytes: 2 * 1024 * 1024 }
const TEMPLATE_CALL_BYTES = 4 * 1024 * 1024
const isTemplateFile = (item) => item?.kind === 'file' && item?.door === 'template'

class WriteFailed extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
    this.detail = detail
  }
}
/** A failure worth asking again: the site's 429/5xx, the network, or its write lock held a moment. */
class Transient extends Error {}
/** The engine said no to one action: `{error, message}` as it answered, for the item it was about. */
class Refused extends Error {
  constructor(action, reply) {
    super(`${action}: ${reply.error}`)
    this.reply = reply
    this.definitelyRefused =
      [
        'conflict',
        'locked',
        'revision_stale',
        'not_found',
        'refused',
        'php_lint_failed',
        'too_large',
        'php_disabled',
        'invalid_params',
        'invalid_kind',
        'unsupported',
        'disabled',
        'unsafe_path'
      ].includes(reply.error) ||
      (reply.error === 'batch_failed' && /every write.*taken back/.test(String(reply.message ?? '')))
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

/** live-pull.mjs `route`: a `.tracy.test` stand name reached through tracy-web, its name in Host. */
function route(endpoint) {
  const via = process.env.TRACY_SYNC_CONNECT_VIA ?? ''
  const url = new URL(endpoint)
  if (!via || !url.hostname.endsWith('.tracy.test') || url.protocol !== 'http:') return null
  const [hostname, port] = via.split(':')
  return { hostname, port: Number(port || 80), path: url.pathname + url.search, host: url.host }
}

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

/** One action; the engine's refusal of a write is the caller's to read (`Refused`), never retried. */
async function call(endpoint, token, action, params = {}) {
  let status
  let text
  let retryAfter
  const target = route(endpoint)
  const body = JSON.stringify({ token, action, params })
  const headers = { 'content-type': 'application/json', 'user-agent': USER_AGENT }
  try {
    if (target) ({ status, text, retryAfter } = await viaPost(target, body, headers))
    else {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error'
      })
      status = response.status
      retryAfter = response.headers.get('retry-after')
      text = await response.text()
    }
  } catch (error) {
    throw new Transient(`${action}: ${error.cause?.code ?? error.code ?? error.message ?? error.name}`)
  }
  const reply = engineReply(text)
  if (reply && !reply.ok && ['unauthorized', 'forbidden', 'bad_token'].includes(reply.error))
    throw new WriteFailed('TOKEN_REFUSED')
  if (status === 401) throw new WriteFailed('LIVE_PASSWORD_PROTECTED')
  if (status === 403) throw new WriteFailed('LIVE_BLOCKED')
  if (status === 429) {
    const error = new Transient(`${action} answered 429`)
    error.code = 'LIVE_RATE_LIMITED'
    const seconds = /^\s*\d+\s*$/.test(String(retryAfter ?? '')) ? Number(retryAfter) : null
    const date = seconds === null ? Date.parse(String(retryAfter ?? '')) : NaN
    error.retryAfterMs =
      seconds !== null ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0
    throw error
  }
  if (reply === null) {
    if (status >= 500) throw new Transient(`${action} answered ${status}`)
    throw new WriteFailed(status === 200 ? 'LIVE_BLOCKED' : 'NOT_THE_ENGINE', `${action} answered ${status}`)
  }
  if (!reply.ok) {
    if (['unauthorized', 'forbidden', 'bad_token'].includes(reply.error))
      throw new WriteFailed('TOKEN_REFUSED')
    // Another write holds the site's write lock for a moment: asked again, like a busy server.
    if (reply.error === 'writer_busy') {
      const busy = new Transient(`${action}: writer_busy`)
      busy.definitelyRefused = true
      throw busy
    }
    throw new Refused(action, reply)
  }
  return reply
}

async function retried(fn, tries = TRIES, onTransient = () => {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof Transient)) throw error
      onTransient()
      if (attempt >= tries) throw new WriteFailed(error.code ?? 'SITE_RESOURCE_LIMIT', error.message)
      // A long Retry-After is a refusal, never permission to retry sooner. Avoid timer overflow.
      if (error.retryAfterMs > 2_147_483_647) throw new WriteFailed('LIVE_RATE_LIMITED')
      await sleep(Math.max(500 * 2 ** attempt, error.retryAfterMs ?? 0))
    }
  }
}

/** live-pull.mjs `door`: the endpoint that answers like the engine, else Joomla's other door. */
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
      if (['TOKEN_REFUSED', 'LIVE_PASSWORD_PROTECTED', 'LIVE_RATE_LIMITED'].includes(error.code)) throw error
    }
  }
  if (blocked) throw blocked
  throw last instanceof WriteFailed ? last : new WriteFailed('UNREACHABLE')
}

// ── values ───────────────────────────────────────────────────────────────────────────────────

/** A value as the compare sees it: text, whatever type the engine's JSON gave it. */
function norm(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => String(v)).sort())
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const same = (a, b) => norm(a) === norm(b)

const MARKER = /@@tracy-new:([a-z_]+):([0-9]+)@@/g

/** Placeholders filled with the numbers the live site gave; `missing` collects what is not known yet. */
function resolve(value, created, missing) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.$new === 'string') {
    if (created[value.$new] === undefined) missing.push(value.$new)
    return created[value.$new] ?? 0
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, created, missing))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, created, missing)]))
  if (typeof value === 'string')
    return value.replace(MARKER, (all, entity, id) => {
      const ref = `${entity}:${id}`
      if (created[ref] === undefined) {
        missing.push(ref)
        return all
      }
      return String(created[ref])
    })
  return value
}

/** git's name for a file's bytes (`hash-object`): what the changeset knows a file by. */
const blobOf = (bytes) =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex')

const writePrivate = durablePrivate

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback)

/** A file's bytes as the live site held them before a write, kept for Undo (`<push dir>/files/<blob>`, 0600). */
function keepBytes(pushDir, bytes) {
  const dir = join(pushDir, 'files')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const name = blobOf(bytes)
  const path = join(dir, name)
  if (!existsSync(path)) {
    const fd = openSync(path, 'w', 0o600)
    try {
      writeFileSync(fd, bytes)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    const directory = openSync(dir, 'r')
    try {
      fsyncSync(directory)
    } finally {
      closeSync(directory)
    }
  }
  return name
}

/** What one of `template.siteSettings`' answers holds for an item's keys: a profile's, or the template's own. */
function siteSettingsOf(answer, profile, keys) {
  const from = profile ? (answer?.profiles?.[profile]?.settings ?? {}) : (answer?.settings ?? {})
  return Object.fromEntries(keys.map((k) => [k, from[k] ?? '']))
}

function progress(t0, said) {
  process.stderr.write(`==> [${Math.round((Date.now() - t0) / 1000)}s] ${said}\n`)
}

// ── apply ────────────────────────────────────────────────────────────────────────────────────

function itemOut(item, extra = {}) {
  return {
    id: item.id,
    kind: item.kind,
    op: item.op,
    title: item.title,
    liveId: item.liveId ?? null,
    ...extra
  }
}

/** The engine's address of an item: `{kind, id, key}` with its number filled in. */
function addressOf(item, created, missing) {
  const id = resolve(item.ident, created, missing)
  const out = { kind: item.kind, id: typeof id === 'string' && /^-?[0-9]+$/.test(id) ? Number(id) : id }
  if (item.key !== null && item.key !== undefined) out.key = item.key
  return out
}

/** The fields an item sends, placeholders filled; a module's pages as the JSON the engine reads. */
function fieldsOf(item, created, missing) {
  const fields = resolve(item.write, created, missing)
  if (item.kind === 'moduleAssignment' && Array.isArray(fields.menuids))
    fields.menuids = JSON.stringify(fields.menuids.map(Number))
  return fields
}

/** What `content.get` must still answer, field by field; the fields that differ. */
function differs(item, live) {
  const out = []
  for (const [field, want] of Object.entries(item.expect ?? {})) {
    if (field === '$absent') continue
    const have = live?.[field]
    if (Array.isArray(want)) {
      if (!same(Array.isArray(have) ? have : [], want)) out.push(field)
    } else if (!same(have, want)) out.push(field)
  }
  return out
}

const shown = (value) => {
  const text = norm(value)
  if (text === null) return { null: true }
  return text.length > 2000 ? { text: text.slice(0, 2000), truncated: text.length } : { text }
}

async function apply(previewDir, pushDir, { confirmDeletes, confirmPhp, limit, webroot }) {
  const t0 = Date.now()
  const endpoint = process.env.TRACY_SYNC_ENDPOINT ?? ''
  const token = process.env.TRACY_SYNC_TOKEN ?? ''
  if (!/^https?:\/\//.test(endpoint) || !token) throw new WriteFailed('NO_LIVE_DOOR')
  const changeset = readJson(join(previewDir, 'changeset.json'), null)
  if (!changeset?.items) throw new WriteFailed('NOT_PREVIEWED')
  const pushId = pushDir.split('/').filter(Boolean).at(-1)
  const applyId = `tracy-push-${pushId}`
  const live = await door(endpoint, token)
  const platform = changeset.platform
  // A live site that answered busy or slow even once (a 429, a 5xx, a timeout) is written one item
  // at a time from then on: a small shared host is the customer's, and its visitors come first.
  let strained = false
  const requests = writeRequests(pushDir, live)
  const ask = (action, params, recovery = []) =>
    retried(
      () =>
        mutation(action, params)
          ? requests.send(action, params, () => call(live, token, action, params), recovery, recover)
          : call(live, token, action, params),
      TRIES,
      () => {
        strained = true
      }
    )

  // What an earlier run of this push already did (a restart cut it): written items stay written.
  const journalPath = join(pushDir, 'journal.jsonl')
  const done = new Map()
  const created = {}
  if (existsSync(journalPath))
    for (const line of readFileSync(journalPath, 'utf8').split('\n').filter(Boolean)) {
      const entry = JSON.parse(line)
      done.set(entry.id, entry)
      if (entry.created) Object.assign(created, entry.created)
    }
  const beforePath = join(pushDir, 'before.json')
  const before = readJson(beforePath, { applyId, items: {} })
  const journal = (entry) => {
    done.set(entry.id, entry)
    if (entry.created) Object.assign(created, entry.created)
    const fd = openSync(journalPath, 'a', 0o600)
    try {
      writeFileSync(fd, `${JSON.stringify(entry)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }
  const keep = (item, snapshot) => {
    before.items[item.id] = snapshot
    writePrivate(beforePath, before)
  }

  // Receipts contain the preimage before sending and the ACK before any read-back. Replaying a
  // receipt never sends HTTP: a killed worker can finish the journal without another mutation.
  function recover(receipt) {
    for (const { item, snapshot, mode } of receipt.recovery ?? []) {
      if (done.get(item.id)?.state === 'written') continue
      const answer = receipt.reply
      if (receipt.state !== 'acknowledged') continue
      let snap = { ...snapshot }
      let extra = {}
      let made
      if (mode === 'content') {
        const liveId = item.op === 'create' ? answer.id : snap.liveId
        if (item.op === 'create' && !(Number(liveId) > 0)) {
          journal({ id: item.id, state: 'failed', extra: { error: 'WRITE_OUTCOME_UNKNOWN' } })
          continue
        }
        snap.liveId = liveId
        extra = { liveId }
        if (item.creates && item.op === 'create') made = { [item.creates]: liveId }
      } else if (mode === 'upload') {
        const attachment = Number(answer.attachment ?? 0)
        if (item.creates && item.kind === 'media' && platform === 'wordpress' && !(attachment > 0)) {
          journal({ id: item.id, state: 'failed', extra: { error: 'WRITE_OUTCOME_UNKNOWN' } })
          continue
        }
        if (attachment > 0) extra = { liveId: attachment }
        if (item.creates && attachment > 0) made = { [item.creates]: attachment }
      } else if (mode === 'template') {
        const f = (answer.files ?? []).find((f) => f.path === item.path) ?? {}
        snap = { ...snap, undoId: answer.undo_id ?? null, before: f.before ?? null, after: f.after ?? null }
        if (answer.undo_id) {
          before.templateUndo = [...new Set([...(before.templateUndo ?? []), answer.undo_id])]
          extra = { undoId: answer.undo_id }
        }
      }
      keep(item, snap)
      journal({ id: item.id, state: 'written', ...(made ? { created: made } : {}), extra })
    }
  }
  for (const receipt of Object.values(requests.entries)) {
    recover(receipt)
    if (receipt.state === 'sending')
      for (const { item } of receipt.recovery ?? [])
        if (done.get(item.id)?.state !== 'written')
          journal({ id: item.id, state: 'failed', extra: { error: 'WRITE_OUTCOME_UNKNOWN' } })
  }

  const written = []
  const conflicts = []
  const failed = []
  const skipped = []
  const ended = (entry, item) => {
    const out = itemOut(item, entry.extra ?? {})
    if (entry.state === 'written') written.push(out)
    else if (entry.state === 'conflict') conflicts.push(out)
    else if (entry.state === 'failed') failed.push(out)
    else skipped.push(out)
  }
  const blocked = new Set()
  let counted = 0
  const queue = []
  for (const item of changeset.items) {
    const had = done.get(item.id)
    if (had?.state === 'written' || had?.extra?.error === 'WRITE_OUTCOME_UNKNOWN') {
      ended(had, item)
      if (had.state !== 'written') blocked.add(item.id)
      continue
    }
    // Changed on both sides since the last sync (the sync kept Tracy's on the copy): the push would
    // write over the customer's own change, so it never does.
    if (item.conflict) {
      ended(
        { state: 'conflict', extra: { reason: item.conflict.reason, fields: item.conflict.fields ?? [] } },
        item
      )
      blocked.add(item.id)
      continue
    }
    if (item.op === 'delete' && !confirmDeletes) {
      ended({ state: 'skipped', extra: { reason: 'deletes-not-confirmed' } }, item)
      blocked.add(item.id)
      continue
    }
    // A PHP file goes only with its own OK, and only as the lint saw it (its blob is checked again).
    if (item.group === 'php' && !confirmPhp) {
      ended({ state: 'skipped', extra: { reason: 'php-not-confirmed' } }, item)
      blocked.add(item.id)
      continue
    }
    if (counted >= limit) {
      ended({ state: 'skipped', extra: { reason: 'over-limit' } }, item)
      blocked.add(item.id)
      continue
    }
    counted++
    queue.push(item)
  }
  progress(t0, `writing ${queue.length} item(s) on the live site`)

  // One item, alone: read, compare, write, read back.
  async function single(item) {
    const missing = []
    const address = addressOf(item, created, missing)
    const fields = fieldsOf(item, created, missing)
    if (missing.length || item.dependsOn.some((d) => blocked.has(d)))
      return journal({ id: item.id, state: 'skipped', extra: { reason: 'depends-on-failed' } })
    try {
      if (item.op === 'upload') return await upload(item)
      if (item.kind === 'file' && item.op === 'delete') return await removeFile(item)
      if (item.kind === 'siteIdentity') return await identity(item, fields)
      if (item.kind === 'templateSettings') return await siteSettings(item, fields)
      let current = null
      let revision = null
      if (item.op !== 'create' || item.expect?.$absent) {
        try {
          const got = await ask('content.get', address)
          current = got.item
          revision = got.body_revision ?? null
          // A part or a template the live site never saved answers with the theme's own file
          // (`stored: false`): no row of its own, so there is none to change or remove.
          if (THEME_ROWS.has(item.kind) && got.stored === false) {
            if (item.op === 'delete')
              return journal({ id: item.id, state: 'written', extra: { already: true } })
            if (item.op === 'update')
              return journal({
                id: item.id,
                state: 'conflict',
                extra: { reason: 'changed-on-live', fields: Object.keys(fields) }
              })
            current = null
          }
        } catch (error) {
          if (!(error instanceof Refused) || error.reply.error !== 'not_found') throw error
          if (!item.expect?.$absent)
            return journal({ id: item.id, state: 'conflict', extra: { reason: 'gone-on-live', fields: [] } })
        }
      }
      if (item.op === 'create' && item.expect?.$absent && current) {
        // What the live site already holds under that key: the same is done; another is a clash.
        const off = Object.keys(fields).filter((f) => !same(current[f], fields[f]))
        if (!off.length) return journal({ id: item.id, state: 'written', extra: { already: true } })
        return journal({
          id: item.id,
          state: 'conflict',
          extra: { reason: 'changed-on-live', fields: off }
        })
      }
      const off = item.op === 'create' ? [] : differs(item, current)
      if (off.length)
        return journal({
          id: item.id,
          state: 'conflict',
          extra: {
            reason: 'changed-on-live',
            fields: off,
            live: Object.fromEntries(off.map((f) => [f, shown(current?.[f])]))
          }
        })
      const snapshot = {
        kind: item.kind,
        op: item.op,
        liveId: address.id,
        key: item.key ?? null,
        before: current,
        written: fields,
        restore: item.restore ?? {},
        trash: item.trash ?? null
      }
      const recovery = [{ item, snapshot, mode: 'content' }]
      let answer
      if (item.op === 'delete')
        answer = await ask('content.delete', { apply_id: applyId, ...address }, recovery)
      else {
        const params = { apply_id: applyId, ...address, fields }
        if (item.op === 'create') params.id = 0
        if (item.bodyRevision && revision) params.expected_body_revision = revision
        answer = await ask('content.update', params, recovery)
      }
      if (done.get(item.id)?.state !== 'written') return
      const liveId = item.op === 'create' ? answer.id : address.id
      let after
      try {
        after = await readBack(item, liveId)
      } catch {
        return
      }
      keep(item, {
        kind: item.kind,
        op: item.op,
        liveId,
        key: item.key ?? null,
        before: current,
        written: fields,
        after,
        restore: item.restore ?? {},
        trash: item.trash ?? null
      })
      return
    } catch (error) {
      if (error.code === 'WRITE_OUTCOME_UNKNOWN')
        return journal({ id: item.id, state: 'failed', extra: { error: error.code } })
      if (error instanceof Refused) {
        const reply = error.reply
        if (reply.error === 'locked') {
          // Who has it open on the live site, and since when (the engine's `lockedBy`): the Owner is
          // told whom to ask to close it, rather than that someone changed it.
          const by = reply.lockedBy && typeof reply.lockedBy === 'object' ? reply.lockedBy : {}
          return journal({
            id: item.id,
            state: 'conflict',
            extra: {
              reason: 'open-in-editor',
              fields: [],
              ...(typeof by.name === 'string' && by.name ? { lockedBy: by.name.slice(0, 80) } : {}),
              ...(typeof by.since === 'string' && by.since ? { lockedSince: by.since.slice(0, 40) } : {})
            }
          })
        }
        if (reply.error === 'revision_stale')
          return journal({
            id: item.id,
            state: 'conflict',
            extra: { reason: 'changed-on-live', fields: ['post_content'] }
          })
        return journal({
          id: item.id,
          state: 'failed',
          extra: {
            error: String(reply.error ?? 'refused').slice(0, 60),
            message: String(reply.message ?? '').slice(0, 300)
          }
        })
      }
      throw error
    }
  }

  /** What the live site holds once written, for Undo to compare with (the CMS may store it its own way). */
  async function readBack(item, liveId) {
    if (item.op === 'delete' && item.kind === 'menuItem' && platform === 'wordpress') return null
    try {
      const params = { kind: item.kind, id: liveId }
      if (item.key !== null && item.key !== undefined) params.key = item.key
      return (await ask('content.get', params)).item ?? null
    } catch (error) {
      if (error instanceof Refused) return null
      throw error
    }
  }

  async function upload(item) {
    if (!webroot) throw new WriteFailed('NO_WEBROOT')
    const file = join(webroot, ...item.path.split('/'))
    if (!existsSync(file))
      return journal({
        id: item.id,
        state: 'failed',
        extra: { error: 'copy_changed', message: 'the file left the copy' }
      })
    const bytes = readFileSync(file)
    if (bytes.length > MEDIA_LIMIT || (item.blob && blobOf(bytes) !== item.blob))
      return journal({
        id: item.id,
        state: 'failed',
        extra: { error: 'copy_changed', message: 'the file changed on the copy' }
      })
    // What the live site holds at that path: the base's bytes (or nothing) — else the customer's own.
    let liveBlob = null
    let liveBytes = null
    try {
      const got = await ask('file.read', { path: item.path })
      liveBytes = Buffer.from(got.content_b64 ?? '', 'base64')
      liveBlob = blobOf(liveBytes)
    } catch (error) {
      if (!(error instanceof Refused)) throw error
      if (item.baseBlob)
        return journal({ id: item.id, state: 'conflict', extra: { reason: 'gone-on-live', fields: [] } })
    }
    if (liveBlob && liveBlob !== (item.baseBlob ?? null) && liveBlob !== item.blob)
      return journal({
        id: item.id,
        state: 'conflict',
        extra: { reason: 'changed-on-live', fields: ['file'] }
      })
    // The same bytes already there: done on Joomla; on WordPress the upload answers the attachment
    // the path already has, which is the number the rest of the push needs.
    if (liveBlob === item.blob && platform !== 'wordpress')
      return journal({ id: item.id, state: 'written', extra: { already: true } })
    const snapshot = {
      kind: item.kind === 'file' ? 'file' : 'media',
      op: 'upload',
      path: item.path,
      before: liveBlob
        ? { blob: liveBlob, ...(item.kind === 'file' ? { stored: keepBytes(pushDir, liveBytes) } : {}) }
        : null,
      written: { blob: item.blob }
    }
    const answer = await ask(
      'media.upload',
      {
        apply_id: applyId,
        path: item.path,
        content_b64: bytes.toString('base64'),
        ...(platform === 'wordpress' ? { sha256: createHash('sha256').update(bytes).digest('hex') } : {})
      },
      [{ item, snapshot, mode: 'upload' }]
    )
    keep(item, {
      kind: item.kind === 'file' ? 'file' : 'media',
      op: 'upload',
      path: item.path,
      before: liveBlob
        ? { blob: liveBlob, ...(item.kind === 'file' ? { stored: keepBytes(pushDir, liveBytes) } : {}) }
        : null,
      written: { blob: item.blob }
    })
    if (done.get(item.id)?.state !== 'written') return
    const attachment = Number(answer.attachment ?? 0)
    return journal({
      id: item.id,
      state: 'written',
      ...(item.creates && attachment > 0 ? { created: { [item.creates]: attachment } } : {}),
      extra: attachment > 0 ? { liveId: attachment } : {}
    })
  }

  /** A picture under images/ the copy removed (Joomla `media.delete`): only while the live one is the base's. */
  async function removeFile(item) {
    let bytes
    try {
      bytes = Buffer.from((await ask('file.read', { path: item.path })).content_b64 ?? '', 'base64')
    } catch (error) {
      if (!(error instanceof Refused)) throw error
      // Gone from the live site already: what the push set out to do is done.
      return journal({ id: item.id, state: 'written', extra: { already: true } })
    }
    if (blobOf(bytes) !== item.baseBlob)
      return journal({
        id: item.id,
        state: 'conflict',
        extra: { reason: 'changed-on-live', fields: ['file'] }
      })
    const stored = keepBytes(pushDir, bytes)
    await ask('media.delete', { apply_id: applyId, path: item.path }, [
      {
        item,
        snapshot: { kind: 'file', op: 'delete', path: item.path, before: { blob: item.baseBlob, stored } }
      }
    ])
    keep(item, { kind: 'file', op: 'delete', path: item.path, before: { blob: item.baseBlob, stored } })
    return journal({ id: item.id, state: 'written' })
  }

  /** Joomla's site name and description (`site.identity`): each value still the base's, then one set. */
  async function identity(item, fields) {
    const now = (await ask('site.identity', { operation: 'read' })).fields ?? {}
    const off = Object.keys(item.expect ?? {}).filter((k) => !same(now[k], item.expect[k]))
    if (off.length)
      return journal({ id: item.id, state: 'conflict', extra: { reason: 'changed-on-live', fields: off } })
    const answer = await ask('site.identity', { operation: 'set', apply_id: applyId, fields }, [
      {
        item,
        snapshot: {
          kind: 'siteIdentity',
          op: 'update',
          before: Object.fromEntries(Object.keys(fields).map((k) => [k, now[k] ?? null])),
          written: fields
        }
      }
    ])
    const keys = Object.keys(fields)
    keep(item, {
      kind: 'siteIdentity',
      op: 'update',
      before: Object.fromEntries(keys.map((k) => [k, now[k] ?? null])),
      written: fields,
      after: Object.fromEntries(keys.map((k) => [k, (answer.fields ?? {})[k] ?? fields[k]]))
    })
    return journal({ id: item.id, state: 'written' })
  }

  /** A T4 site profile or the favicon file (`template.siteSettings`): each key still the base's, then one set. */
  async function siteSettings(item, write) {
    const { template, profiles, fields } = write
    const profile = profiles ? Object.keys(profiles)[0] : null
    const values = profiles ? profiles[profile] : fields
    const keys = Object.keys(values)
    let read
    try {
      read = await ask('template.siteSettings', { template })
    } catch (error) {
      if (!(error instanceof Refused) || error.reply.error !== 'not_found') throw error
      return journal({ id: item.id, state: 'conflict', extra: { reason: 'gone-on-live', fields: [] } })
    }
    const now = siteSettingsOf(read, profile, keys)
    const off = keys.filter((k) => !same(now[k], item.expect?.[k] ?? ''))
    if (off.length)
      return journal({ id: item.id, state: 'conflict', extra: { reason: 'changed-on-live', fields: off } })
    const answer = await ask(
      'template.siteSettings',
      {
        operation: 'set',
        apply_id: applyId,
        template,
        ...(profiles ? { profiles: { [profile]: values } } : { fields: values })
      },
      [
        {
          item,
          snapshot: {
            kind: 'templateSettings',
            op: 'update',
            key: template,
            profile,
            before: now,
            written: values
          }
        }
      ]
    )
    keep(item, {
      kind: 'templateSettings',
      op: 'update',
      key: template,
      profile,
      before: now,
      written: values,
      after: answer.unchanged ? values : siteSettingsOf(answer, profile, keys)
    })
    return journal({ id: item.id, state: 'written' })
  }

  // Joomla's updates in lots, each checked by the engine inside its transaction.
  async function lot(items) {
    const ready = []
    for (const item of items) {
      const missing = []
      const address = addressOf(item, created, missing)
      const fields = fieldsOf(item, created, missing)
      if (missing.length || item.dependsOn.some((d) => blocked.has(d))) {
        journal({ id: item.id, state: 'skipped', extra: { reason: 'depends-on-failed' } })
        continue
      }
      let current
      try {
        current = (await ask('content.get', address)).item
      } catch (error) {
        if (!(error instanceof Refused)) throw error
        journal({
          id: item.id,
          state: error.reply.error === 'not_found' ? 'conflict' : 'failed',
          extra:
            error.reply.error === 'not_found'
              ? { reason: 'gone-on-live', fields: [] }
              : { error: String(error.reply.error), message: String(error.reply.message ?? '').slice(0, 300) }
        })
        continue
      }
      const off = differs(item, current)
      if (off.length) {
        journal({
          id: item.id,
          state: 'conflict',
          extra: {
            reason: 'changed-on-live',
            fields: off,
            live: Object.fromEntries(off.map((f) => [f, shown(current?.[f])]))
          }
        })
        continue
      }
      ready.push({ item, address, fields, current })
    }
    if (!ready.length) return
    const operations = ready.map(({ item, address, fields }) => ({
      kind: address.kind,
      id: address.id,
      fields,
      expected: Object.fromEntries(Object.entries(item.expect ?? {}).map(([k, v]) => [k, v])),
      key: item.id
    }))
    const requestId = `push-${pushId}-${createHash('sha1')
      .update(ready.map((r) => r.item.id).join('|'))
      .digest('hex')
      .slice(0, 16)}`
    try {
      await ask(
        'content.batch',
        { apply_id: applyId, request_id: requestId, operations },
        ready.map(({ item, address, fields, current }) => ({
          item,
          mode: 'content',
          snapshot: {
            kind: item.kind,
            op: item.op,
            liveId: address.id,
            key: item.key ?? null,
            before: current,
            written: fields,
            restore: item.restore ?? {},
            trash: item.trash ?? null
          }
        }))
      )
    } catch (error) {
      if (!(error instanceof Refused)) throw error
      // Refused whole (a row open in the editor, a value moved since the read, a write the engine took
      // back): each item alone, which reads and compares again.
      const message = String(error.reply.message ?? '')
      if (error.reply.error === 'batch_failed' && /stay on the site|could not be taken back/.test(message)) {
        for (const { item } of ready)
          journal({
            id: item.id,
            state: 'failed',
            extra: { error: 'batch_failed', message: message.slice(0, 300) }
          })
        return
      }
      for (const { item } of ready) await single(item)
      return
    }
    for (const { item, address, fields, current } of ready) {
      let after
      try {
        after = await readBack(item, address.id)
      } catch {
        continue
      }
      keep(item, {
        kind: item.kind,
        op: item.op,
        liveId: address.id,
        key: item.key ?? null,
        before: current,
        written: fields,
        after,
        restore: item.restore ?? {},
        trash: item.trash ?? null
      })
      journal({ id: item.id, state: 'written', extra: { liveId: address.id } })
    }
  }

  /**
   * A template's or theme's own files (`template.files.write`): all or nothing per call, each file
   * naming the blob the live site must hold (the base's; null for a new one). A file the engine says
   * is not that is a conflict and nothing of it is written; the call goes again without it. A file it
   * refuses (PHP switched off, a path it does not write, PHP that does not parse there) fails alone,
   * and the rest go again. What each file held before is the engine's (its undo log, `undo_id`).
   */
  async function templateFiles(items) {
    const limits = { ...TEMPLATE_FILES, ...changeset.templateFiles }
    const ready = []
    for (const item of items) {
      if (item.dependsOn.some((d) => blocked.has(d))) {
        journal({ id: item.id, state: 'skipped', extra: { reason: 'depends-on-failed' } })
        continue
      }
      if (item.op === 'delete') {
        ready.push({
          item,
          file: { path: item.path, delete: true, expected_blob: item.baseBlob ?? null },
          bytes: 0
        })
        continue
      }
      if (!webroot) throw new WriteFailed('NO_WEBROOT')
      const path = join(webroot, ...item.path.split('/'))
      const bytes = existsSync(path) ? readFileSync(path) : null
      if (!bytes || (item.blob && blobOf(bytes) !== item.blob) || bytes.length > limits.maxFileBytes) {
        journal({
          id: item.id,
          state: 'failed',
          extra: {
            error: 'copy_changed',
            message: bytes ? 'the file changed on the copy' : 'the file left the copy'
          }
        })
        continue
      }
      ready.push({
        item,
        bytes: bytes.length,
        file: {
          path: item.path,
          expected_blob: item.baseBlob ?? null,
          content_b64: bytes.toString('base64'),
          sha256: createHash('sha256').update(bytes).digest('hex')
        }
      })
    }
    // In calls within the door's limits, in the changeset's order.
    const cap = Math.min(limits.maxBytes, TEMPLATE_CALL_BYTES)
    const calls = []
    for (const one of ready) {
      const last = calls.at(-1)
      if (last && last.length < limits.maxFiles && last.bytes + one.bytes <= cap) {
        last.push(one)
        last.bytes += one.bytes
      } else {
        const next = [one]
        next.bytes = one.bytes
        calls.push(next)
      }
    }
    for (const call of calls) await templateCall(call)
  }

  async function templateCall(files) {
    let pending = files
    while (pending.length) {
      let answer
      try {
        answer = await ask(
          'template.files.write',
          { apply_id: applyId, files: pending.map((f) => f.file) },
          pending.map(({ item }) => ({
            item,
            mode: 'template',
            snapshot: {
              kind: 'file',
              door: 'template',
              op: item.op,
              path: item.path,
              written: { blob: item.op === 'delete' ? null : item.blob }
            }
          }))
        )
      } catch (error) {
        if (!(error instanceof Refused)) throw error
        const reply = error.reply
        const out = new Set()
        const byPath = new Map(pending.map((f) => [f.file.path, f]))
        const end = (path, entry) => {
          const f = byPath.get(path)
          if (!f || out.has(path)) return
          out.add(path)
          journal({ id: f.item.id, ...entry })
        }
        if (reply.error === 'conflict')
          for (const c of reply.conflicts ?? [])
            end(c.path, {
              state: 'conflict',
              extra: { reason: c.actual ? 'changed-on-live' : 'gone-on-live', fields: ['file'] }
            })
        else if (reply.error === 'refused')
          for (const r of reply.refused ?? [])
            end(r.path, {
              state: 'failed',
              extra: {
                error:
                  r.reason === 'php_disabled' ? 'php_disabled' : `refused_${String(r.reason).slice(0, 40)}`,
                message: String(
                  r.reason === 'php_disabled' ? (reply.next ?? reply.message ?? '') : (reply.message ?? '')
                ).slice(0, 300)
              }
            })
        else if (reply.error === 'php_lint_failed')
          for (const l of reply.lint ?? [])
            end(l.path, {
              state: 'failed',
              extra: { error: 'php_lint_failed', message: String(l.message ?? '').slice(0, 300) }
            })
        else if (reply.error === 'too_large' && typeof reply.path === 'string')
          end(reply.path, {
            state: 'failed',
            extra: { error: 'too_large', message: String(reply.message ?? '').slice(0, 300) }
          })
        else if (reply.error === 'too_large' && pending.length > 1) {
          // The call as a whole was too large for the site: in two halves.
          const half = Math.ceil(pending.length / 2)
          await templateCall(pending.slice(0, half))
          await templateCall(pending.slice(half))
          return
        }
        if (out.size === 0) {
          // Refused as a whole (switched off, a write that could not land and was put back): every file of it.
          for (const f of pending)
            journal({
              id: f.item.id,
              state: 'failed',
              extra: {
                error: String(reply.error ?? 'refused').slice(0, 60),
                message: String(reply.message ?? '').slice(0, 300)
              }
            })
          return
        }
        pending = pending.filter((f) => !out.has(f.file.path))
        continue
      }
      const undoId = typeof answer.undo_id === 'string' ? answer.undo_id : null
      if (undoId) {
        before.templateUndo = [...new Set([...(before.templateUndo ?? []), undoId])]
        writePrivate(beforePath, before)
      }
      const said = new Map((answer.files ?? []).map((f) => [f.path, f]))
      for (const { item } of pending) {
        const f = said.get(item.path) ?? {}
        // Already what the copy holds (a retry after a lost answer, or the customer did the same):
        // nothing of it is the push's to take back.
        if (f.op === 'unchanged') {
          journal({ id: item.id, state: 'written', extra: { already: true } })
          continue
        }
        keep(item, {
          kind: 'file',
          door: 'template',
          op: item.op,
          path: item.path,
          undoId,
          before: f.before ?? null,
          after: f.after ?? null,
          written: { blob: item.op === 'delete' ? null : item.blob }
        })
        journal({ id: item.id, state: 'written', extra: undoId ? { undoId } : {} })
      }
      return
    }
  }

  // Where a Joomla lot of updates starts (the walk below): its first item may go in `content.batch`.
  const lotStarts = (item) =>
    platform === 'joomla' &&
    item.op === 'update' &&
    !OWN_DOOR.has(item.kind) &&
    !item.dependsOn.some((d) => !done.has(d))

  /**
   * Items written alone, at most CONCURRENCY at once (one when the live site has shown strain): an
   * item starts once every item of this run it depends on has its journal entry, and only while no
   * earlier item of its lane is still waiting or running. Each one's journal entry and before.json
   * are written as it ends (both synchronous), and the answer keeps the changeset's order.
   */
  async function sideBySide(run) {
    const ids = new Set(run.map((i) => i.id))
    const pending = [...run]
    const running = new Map()
    const lanes = new Set()
    // Ended AND counted: a dependant waits for this, not for the journal line alone, so it never
    // starts between its dependency's failure and that failure blocking it.
    const finished = new Set()
    const finish = (item) => {
      const entry = done.get(item.id)
      if (entry && entry.state !== 'written') blocked.add(item.id)
      finished.add(item.id)
    }
    while (pending.length || running.size) {
      const held = new Set()
      for (let i = 0; i < pending.length && running.size < (strained ? 1 : CONCURRENCY); ) {
        const item = pending[i]
        const lane = laneOf(item, platform)
        const ready = item.dependsOn.every((d) => !ids.has(d) || finished.has(d))
        if (lanes.has(lane) || held.has(lane) || !ready) {
          held.add(lane)
          i++
          continue
        }
        pending.splice(i, 1)
        lanes.add(lane)
        running.set(
          item.id,
          single(item).finally(() => {
            lanes.delete(lane)
            running.delete(item.id)
            finish(item)
          })
        )
      }
      if (running.size) await Promise.race(running.values())
      else if (pending.length) {
        // Nothing can start (what the first waits on never comes): it goes alone, and says so itself.
        const item = pending.shift()
        await single(item)
        finish(item)
      }
    }
  }

  let at = 0
  while (at < queue.length) {
    const item = queue[at]
    if (isTemplateFile(item)) {
      const group = []
      while (at < queue.length && isTemplateFile(queue[at])) group.push(queue[at++])
      await templateFiles(group)
    } else if (
      platform === 'joomla' &&
      item.op === 'update' &&
      !OWN_DOOR.has(item.kind) &&
      !item.dependsOn.some((d) => !done.has(d))
    ) {
      const group = []
      let bytes = 0
      while (at < queue.length && group.length < BATCH_ITEMS) {
        const next = queue[at]
        if (next.op !== 'update' || OWN_DOOR.has(next.kind)) break
        const size = JSON.stringify(next.write).length
        if (group.length && bytes + size > BATCH_BYTES) break
        group.push(next)
        bytes += size
        at++
      }
      await lot(group)
    } else {
      // Every item up to the next template file or Joomla lot is written alone: side by side, by lane.
      const run = []
      while (at < queue.length && !isTemplateFile(queue[at]) && !lotStarts(queue[at])) run.push(queue[at++])
      if (!run.length) run.push(queue[at++])
      await sideBySide(run)
    }
    for (const g of queue.slice(0, at)) {
      const entry = done.get(g.id)
      if (entry && entry.state !== 'written') blocked.add(g.id)
    }
  }
  for (const item of queue) {
    const entry = done.get(item.id)
    if (entry) ended(entry, item)
  }
  progress(
    t0,
    `written ${written.length}, conflicts ${conflicts.length}, failed ${failed.length}, skipped ${skipped.length}`
  )
  const state =
    written.length === 0
      ? 'nothing'
      : conflicts.length || failed.length || skipped.length
        ? 'partial'
        : 'applied'
  const result = {
    ok: true,
    state,
    applyId,
    written,
    conflicts,
    failed,
    skipped,
    created,
    counts: {
      written: written.length,
      conflicts: conflicts.length,
      failed: failed.length,
      skipped: skipped.length
    }
  }
  writePrivate(join(pushDir, 'written.json'), result)
  return result
}

// ── undo ─────────────────────────────────────────────────────────────────────────────────────

/** Kinds the engine can put in a trash (`content.delete`), per platform. */
const TRASHABLE = {
  joomla: new Set(['article', 'category', 'tag', 'menuItem', 'module', 'redirect']),
  wordpress: new Set(['post', 'menuItem', 'templatePart', 'template'])
}

async function undo(pushDir) {
  const t0 = Date.now()
  const endpoint = process.env.TRACY_SYNC_ENDPOINT ?? ''
  const token = process.env.TRACY_SYNC_TOKEN ?? ''
  if (!/^https?:\/\//.test(endpoint) || !token) throw new WriteFailed('NO_LIVE_DOOR')
  const before = readJson(join(pushDir, 'before.json'), null)
  const writtenAnswer = readJson(join(pushDir, 'written.json'), null)
  if (!before || !writtenAnswer) throw new WriteFailed('NOT_PUSHED')
  const pushId = pushDir.split('/').filter(Boolean).at(-1)
  const applyId = `tracy-push-undo-${pushId}`
  const live = await door(endpoint, token)
  const platform = readJson(join(pushDir, 'push.json'), {}).platform ?? 'joomla'
  const requests = writeRequests(pushDir, live, 'undo-requests.json')
  let undoItemId = 'template-files'
  const ask = (action, params) =>
    retried(() =>
      mutation(action, params)
        ? requests.send(action, params, () => call(live, token, action, params), [
            { item: { id: undoItemId } }
          ])
        : call(live, token, action, params)
    )
  const restored = []
  const kept = []
  const failed = []

  /** The live file's blob now, or null when there is none. */
  async function liveBlobOf(path) {
    try {
      return blobOf(Buffer.from((await ask('file.read', { path })).content_b64 ?? '', 'base64'))
    } catch (error) {
      if (error instanceof Refused) return null
      throw error
    }
  }
  const storedBytes = (name) => {
    const path = join(pushDir, 'files', String(name ?? ''))
    return name && /^[a-f0-9]{40}$/.test(name) && existsSync(path) ? readFileSync(path) : null
  }

  /** A file back as it was: only where the live one is still what the push left (true), else why not. */
  async function undoFile(snap) {
    const now = await liveBlobOf(snap.path)
    if (snap.op === 'delete') {
      if (now !== null) return { reason: 'changed-on-live', fields: ['file'] }
      const bytes = storedBytes(snap.before?.stored)
      if (!bytes) return { reason: 'nothing-kept' }
      await ask('media.upload', { apply_id: applyId, path: snap.path, content_b64: bytes.toString('base64') })
      return true
    }
    if (now === null) return { reason: 'gone-on-live', fields: [] }
    if (now !== snap.written?.blob) return { reason: 'changed-on-live', fields: ['file'] }
    if (snap.before) {
      const bytes = storedBytes(snap.before.stored)
      if (!bytes) return { reason: 'nothing-kept' }
      await ask('media.upload', {
        apply_id: applyId,
        path: snap.path,
        content_b64: bytes.toString('base64'),
        ...(platform === 'wordpress' ? { sha256: createHash('sha256').update(bytes).digest('hex') } : {})
      })
      return true
    }
    // A file the push added: only a picture under images/ can be taken off again (Joomla `media.delete`).
    if (
      platform === 'joomla' &&
      snap.path.startsWith('images/') &&
      /\.(jpe?g|png|gif|webp|svg|avif|ico)$/i.test(snap.path)
    ) {
      await ask('media.delete', { apply_id: applyId, path: snap.path })
      return true
    }
    return { reason: 'cannot-remove' }
  }

  /** A setting back as it was: only where every value is still the one the push left (true), else why not. */
  async function undoSetting(snap) {
    const keys = Object.keys(snap.written ?? {})
    const left = snap.after ?? snap.written
    let now
    if (snap.kind === 'siteIdentity') now = (await ask('site.identity', { operation: 'read' })).fields ?? {}
    else now = siteSettingsOf(await ask('template.siteSettings', { template: snap.key }), snap.profile, keys)
    const moved = keys.filter((k) => !same(now[k], left?.[k]))
    if (moved.length) return { reason: 'changed-on-live', fields: moved }
    const back = Object.fromEntries(keys.map((k) => [k, snap.before?.[k] ?? '']))
    if (snap.kind === 'siteIdentity')
      await ask('site.identity', { operation: 'set', apply_id: applyId, fields: back })
    else
      await ask('template.siteSettings', {
        operation: 'set',
        apply_id: applyId,
        template: snap.key,
        ...(snap.profile ? { profiles: { [snap.profile]: back } } : { fields: back })
      })
    return true
  }

  /**
   * A template's or theme's own files, taken back by the engine (`template.files.undo` under the push's
   * apply id, every write of it newest first): only where the live file still holds what the push left.
   * Path → `true` (restored, or already back) or why not; the whole call refused → `{error, message}`.
   */
  let templateUndone = null
  async function undoTemplateFiles() {
    const out = new Map()
    try {
      const answer = await ask('template.files.undo', {
        apply_id: writtenAnswer.applyId ?? `tracy-push-${pushId}`
      })
      for (const r of [...(answer.restored ?? []), ...(answer.already ?? [])]) out.set(r.path, true)
      for (const k of answer.kept ?? []) {
        const reason = ['changed-on-live', 'gone-on-live'].includes(k.reason)
          ? k.reason
          : k.reason === 'exists-on-live'
            ? 'changed-on-live'
            : k.reason === 'disabled'
              ? 'template-files-off'
              : k.detail === 'php_disabled'
                ? 'php-disabled'
                : 'cannot-restore'
        out.set(k.path, { reason, ...(reason === 'changed-on-live' ? { fields: ['file'] } : {}) })
      }
    } catch (error) {
      if (!(error instanceof Refused)) throw error
      // Nothing of this push recorded on the live site (each file was already as the copy had it).
      if (error.reply.error === 'not_found') return { all: { reason: 'nothing-kept' } }
      return {
        error: String(error.reply.error ?? 'refused').slice(0, 60),
        message: String(error.reply.message ?? '').slice(0, 300)
      }
    }
    return { paths: out }
  }

  const order = [...writtenAnswer.written].reverse()
  progress(t0, `taking back ${order.length} item(s) on the live site`)
  for (const out of order) {
    undoItemId = out.id
    const snap = before.items[out.id]
    if (!snap) {
      kept.push({ ...out, reason: 'nothing-kept' })
      continue
    }
    if (snap.kind === 'file' && snap.door === 'template') {
      templateUndone ??= await undoTemplateFiles()
      if (templateUndone.error) {
        failed.push({ ...out, error: templateUndone.error, message: templateUndone.message })
        continue
      }
      const said = templateUndone.all ?? templateUndone.paths.get(snap.path) ?? { reason: 'nothing-kept' }
      if (said === true) restored.push(out)
      else kept.push({ ...out, ...said })
      continue
    }
    if (snap.op === 'upload' && snap.kind !== 'file') {
      // A new Media Library item (WordPress): its attachment is the live site's own record now.
      kept.push({ ...out, reason: 'media-not-undone' })
      continue
    }
    try {
      if (snap.kind === 'file') {
        const said = await undoFile(snap)
        if (said === true) restored.push(out)
        else kept.push({ ...out, ...said })
        continue
      }
      if (snap.kind === 'siteIdentity' || snap.kind === 'templateSettings') {
        const said = await undoSetting(snap)
        if (said === true) restored.push(out)
        else kept.push({ ...out, ...said })
        continue
      }
    } catch (error) {
      if (!(error instanceof Refused)) throw error
      failed.push({
        ...out,
        error: String(error.reply.error ?? 'refused').slice(0, 60),
        message: String(error.reply.message ?? '').slice(0, 300)
      })
      continue
    }
    const params = { kind: snap.kind, id: snap.liveId }
    if (snap.key !== null && snap.key !== undefined) params.key = snap.key
    let now = null
    let stored = true
    try {
      const got = await ask('content.get', params)
      now = got.item
      stored = got.stored !== false
    } catch (error) {
      if (!(error instanceof Refused)) throw error
      if (!(snap.op === 'delete' && snap.kind === 'menuItem')) {
        kept.push({ ...out, reason: 'gone-on-live', fields: [] })
        continue
      }
    }
    if (THEME_ROWS.has(snap.kind) && (snap.op === 'delete' || (snap.op === 'create' && !stored))) {
      // A part the push made that the live site has since handed back to the theme: already undone.
      if (snap.op === 'create') {
        restored.push(out)
        continue
      }
      // A part the push handed back to the theme: saved again as it was, unless the live site saved
      // one of its own since.
      if (stored) {
        kept.push({ ...out, reason: 'changed-on-live', fields: ['content'] })
        continue
      }
      const back = {}
      for (const field of ['content', 'title', 'area'])
        if (snap.before?.[field] !== undefined) back[field] = snap.before[field]
      if (typeof back.content !== 'string') {
        kept.push({ ...out, reason: 'cannot-restore' })
        continue
      }
      try {
        await ask('content.update', { apply_id: applyId, ...params, id: 0, fields: back })
        restored.push(out)
      } catch (error) {
        if (!(error instanceof Refused)) throw error
        failed.push({
          ...out,
          error: String(error.reply.error ?? 'refused').slice(0, 60),
          message: String(error.reply.message ?? '').slice(0, 300)
        })
      }
      continue
    }
    // The live site must still hold what the push left there (read back after the write), field by field.
    const left = snap.after ?? snap.written
    // A record the push made may have been placed by a move of the same push after it was read back.
    const fields =
      snap.op === 'delete'
        ? snap.trash
          ? [snap.trash[0]]
          : []
        : Object.keys(snap.written ?? {}).filter((f) => !(snap.op === 'create' && f === 'parent_id'))
    const moved = []
    for (const field of fields) {
      if (field === 'move_after') continue
      const want = snap.op === 'delete' ? snap.trash?.[1] : (left?.[field] ?? snap.written?.[field])
      const have = now?.[field]
      if (field === 'categories' || field === 'tags') {
        const read = field === 'categories' ? 'post_category' : 'tags_input'
        if (!same(now?.[read] ?? [], snap.after?.[read] ?? [])) moved.push(field)
        continue
      }
      if (!same(have, want)) moved.push(field)
    }
    if (snap.op === 'delete' && snap.kind === 'menuItem' && platform === 'wordpress') {
      kept.push({ ...out, reason: 'cannot-restore' })
      continue
    }
    if (moved.length) {
      kept.push({ ...out, reason: 'changed-on-live', fields: moved })
      continue
    }
    try {
      if (snap.op === 'create') {
        if (!TRASHABLE[platform]?.has(snap.kind)) {
          kept.push({ ...out, reason: 'cannot-remove' })
          continue
        }
        await ask('content.delete', { apply_id: applyId, ...params })
      } else if (snap.op === 'delete') {
        const [column] = snap.trash ?? []
        if (!column) {
          kept.push({ ...out, reason: 'cannot-restore' })
          continue
        }
        await ask('content.update', {
          apply_id: applyId,
          ...params,
          fields: { [column]: snap.before?.[column] }
        })
      } else if (snap.op === 'move') {
        if (!snap.restore?.parent_id) {
          kept.push({ ...out, reason: 'cannot-restore' })
          continue
        }
        await ask('content.update', { apply_id: applyId, ...params, fields: snap.restore })
      } else {
        const back = {}
        for (const field of Object.keys(snap.written ?? {})) {
          if (snap.restore && field in snap.restore) back[field] = snap.restore[field]
          else if (snap.kind === 'moduleAssignment') back[field] = snap.before?.[field] ?? '[]'
          else back[field] = snap.before?.[field] ?? null
        }
        await ask('content.update', { apply_id: applyId, ...params, fields: back })
      }
      restored.push(out)
    } catch (error) {
      if (!(error instanceof Refused)) throw error
      failed.push({
        ...out,
        error: String(error.reply.error ?? 'refused').slice(0, 60),
        message: String(error.reply.message ?? '').slice(0, 300)
      })
    }
  }
  progress(t0, `restored ${restored.length}, kept ${kept.length}, failed ${failed.length}`)
  const state = restored.length === 0 ? 'nothing' : kept.length || failed.length ? 'partial' : 'undone'
  const result = {
    ok: true,
    state,
    applyId,
    restored,
    kept,
    failed,
    counts: { restored: restored.length, kept: kept.length, failed: failed.length }
  }
  writePrivate(join(pushDir, 'restored.json'), result)
  return result
}

// ── the template door ────────────────────────────────────────────────────────────────────────

/**
 * The live engine's template door, as the changeset reads it (`lib/live_push.py` `template_door`):
 * null when the engine has none (an older release), `{enabled: false}` when its owner switched it off
 * (or its roots could not be read), else its switches and limits with the roots the live site names
 * (`template.files.status`: the installed site templates, the active theme and its parent).
 */
async function templateDoor(tf, ask) {
  if (!tf || typeof tf !== 'object' || Array.isArray(tf)) return null
  if (tf.enabled === false) return { enabled: false }
  const n = (v, fallback) => (Number.isSafeInteger(v) && v > 0 ? v : fallback)
  let status
  try {
    status = await ask('template.files.status', {})
  } catch (error) {
    if (error instanceof Refused || error instanceof WriteFailed)
      return {
        enabled: false,
        unreadable: String(error.reply?.error ?? error.code ?? 'refused').slice(0, 60)
      }
    throw error
  }
  return {
    enabled: true,
    version: n(tf.version, 1),
    php: (status.php ?? tf.php) === true,
    maxFileBytes: n(tf.max_file_bytes, TEMPLATE_FILES.maxFileBytes),
    maxBytes: n(tf.max_bytes, TEMPLATE_FILES.maxBytes),
    maxFiles: n(tf.max_files, TEMPLATE_FILES.maxFiles),
    ...(Array.isArray(tf.extensions) ? { extensions: tf.extensions.map(String) } : {}),
    roots: (Array.isArray(status.roots) ? status.roots : [])
      .filter((r) => r && typeof r.path === 'string')
      .map((r) => ({
        path: r.path,
        kind: String(r.kind ?? 'template'),
        name: String(r.name ?? ''),
        php: r.php === true
      }))
  }
}

// ── entry ────────────────────────────────────────────────────────────────────────────────────

function flag(args, name, fallback = null) {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : fallback
}

async function main(argv) {
  const [op, ...rest] = argv
  if (op === 'apply') {
    const [previewDir, pushDir] = rest
    const release = await lockWriter(pushDir)
    try {
      return await apply(previewDir, pushDir, {
        confirmDeletes: rest.includes('--confirm-deletes'),
        confirmPhp: rest.includes('--confirm-php'),
        limit: Number(flag(rest, '--limit', DEFAULT_LIMIT)) || DEFAULT_LIMIT,
        webroot: flag(rest, '--webroot')
      })
    } finally {
      await release()
    }
  }
  if (op === 'undo') {
    const release = await lockWriter(rest[0])
    try {
      return await undo(rest[0])
    } finally {
      await release()
    }
  }
  if (op === 'info') {
    const endpoint = process.env.TRACY_SYNC_ENDPOINT ?? ''
    const token = process.env.TRACY_SYNC_TOKEN ?? ''
    if (!/^https?:\/\//.test(endpoint) || !token) throw new WriteFailed('NO_LIVE_DOOR')
    const live = await door(endpoint, token)
    const info = (await retried(() => call(live, token, 'info'))).info ?? {}
    // The live site's PHP: the lint of a PHP file runs on it (lib/live_push.py `lint`).
    return {
      ok: true,
      version: info.component ?? null,
      php: typeof info.php === 'string' ? info.php : null,
      templateFiles: await templateDoor(info.template_files, (action, params) =>
        retried(() => call(live, token, action, params))
      )
    }
  }
  throw new WriteFailed('BAD_OP', op)
}

main(process.argv.slice(2))
  .then((answer) => console.log(JSON.stringify(answer)))
  .catch((error) => {
    const code =
      error.code === 'UNREACHABLE' || error.code === 'NOT_THE_ENGINE' ? 'LIVE_UNREACHABLE' : error.code
    // An error of this script itself (not a refusal it names): its kind and message's first line,
    // cut at the first quote like lib/live_sync.py `failure_line`, so no value of the site goes out.
    const own = () => {
      const line = String(error?.message ?? '').split('\n')[0]
      const quote = line.search(/['"`]/)
      return `${error?.name ?? 'Error'}: ${quote >= 0 ? `${line.slice(0, quote)}'…'` : line}`.slice(0, 300)
    }
    const detail =
      error.code === 'UNREACHABLE' || error.code === 'NOT_THE_ENGINE'
        ? error.code
        : error instanceof WriteFailed
          ? error.detail
          : own()
    console.log(JSON.stringify({ ok: false, code: code ?? 'WRITE_FAILED', ...(detail ? { detail } : {}) }))
  })
