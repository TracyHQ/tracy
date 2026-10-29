/**
 * "Sync to live", the writes (`scripts/lib/live-write.mjs`, plan tasks/ke-hoach-sync-to-live.md §2.4–7):
 * every item of a changeset written on the live site only where the live site still holds the base's
 * value, a conflict otherwise; what the live site held kept for Undo, which takes back only what the
 * live site still holds as the push left it.
 *
 * Against a stand-in for the Claude Cowork engine: a small HTTP server answering `content.get`,
 * `content.update`, `content.batch`, `content.delete`, `media.upload` and `file.read` the way the
 * Joomla and WordPress engines do (one envelope, `{ok, error, message}` refusals), from records in
 * memory the test reads and changes as the customer would.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-write.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const WRITE = join(here, '..', 'scripts', 'lib', 'live-write.mjs')
const TOKEN = 'live-token-of-test'
const root = mkdtempSync(join(tmpdir(), 'live-write-'))
after(() => rmSync(root, { recursive: true, force: true }))

/**
 * The engine stand-in. `records[kind][id]` are rows as `content.get` answers them; `files[path]` bytes.
 * `calls` logs every action; `refuse` makes the next call of an action answer a refusal or a status.
 * `themeFiles[kind][slug]`: a WordPress block theme's own parts and templates, which `content.get`
 * answers (`stored: false`) where the site saved no row of its own (`records[kind][slug]`).
 */
const THEME_KINDS = new Set(['templatePart', 'template'])
function engine({
  platform = 'joomla',
  records = {},
  files = {},
  identity = {},
  templates = {},
  templateFiles = null,
  themeFiles = {}
} = {}) {
  const state = {
    records,
    files,
    identity,
    templates,
    templateFiles,
    themeFiles,
    undoLog: {},
    calls: [],
    refuse: {},
    next: 1000,
    platform,
    slow: 0,
    updates: [],
    open: new Set(),
    overlaps: []
  }
  const trash = (kind) =>
    platform === 'wordpress' ? ['post_status', 'trash'] : [kind === 'article' ? 'state' : 'published', -2]
  const get = (kind, id, key) => {
    if (kind === 'postmeta' || kind === 'option') return state.records[kind]?.[`${id}:${key}`] ?? null
    if (THEME_KINDS.has(kind)) return state.records[kind]?.[key] ?? null
    return state.records[kind]?.[id] ?? null
  }
  const put = (kind, id, key, row) => {
    state.records[kind] ??= {}
    if (kind === 'postmeta' || kind === 'option') state.records[kind][`${id}:${key}`] = row
    else if (THEME_KINDS.has(kind)) state.records[kind][key] = row
    else state.records[kind][id] = row
  }
  const update = (p) => {
    const { kind, key } = p
    let id = Number(p.id ?? 0)
    const fields = { ...p.fields }
    // The WordPress engine addresses postmeta by its existing parent post, even on a create.
    if (kind === 'postmeta' && (id <= 0 || !get('post', id))) return null
    if (fields.move_after !== undefined) delete fields.move_after
    if (THEME_KINDS.has(kind)) {
      // claude-cowork write_theme_row: by slug; a write without a title names the row by its slug.
      const row = get(kind, 0, key)
      const made = row ? Number(row.id) : ++state.next
      put(kind, made, key, {
        ...(row ?? (kind === 'templatePart' ? { area: 'uncategorized' } : {})),
        ...stringify(fields),
        id: String(made),
        title: fields.title || key
      })
      return { kind, id: made, created: !row }
    }
    if (id === 0 && kind !== 'option' && kind !== 'postmeta') {
      id = ++state.next
      put(kind, id, key, { id: String(id), ...stringify(fields) })
      return { kind, id, created: true }
    }
    const row = get(kind, id, key)
    if (!row && kind !== 'option' && kind !== 'postmeta') return null
    put(kind, id, key, { ...row, ...stringify(fields) })
    return { kind, id, created: !row }
  }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { action, params = {} } = JSON.parse(body)
      // A slow `content.update` (state.slow ms): how many are in flight at once, and which records.
      if (action === 'content.update' && state.slow) {
        const at = { kind: params.kind, id: params.id, key: params.key ?? null, start: Date.now() }
        state.inflight = (state.inflight ?? 0) + 1
        state.maxInflight = Math.max(state.maxInflight ?? 0, state.inflight)
        state.updates.push(at)
        state.open.add(at)
        state.overlaps.push([...state.open].filter((o) => o !== at).map((o) => ({ ...o })))
        setTimeout(() => {
          state.inflight--
          state.open.delete(at)
          at.end = Date.now()
          handle()
        }, state.slow)
        return
      }
      handle()
    })
    const handle = () => {
      const { token, action, params = {} } = JSON.parse(body)
      state.calls.push({ action, params })
      const answer = (status, value) => {
        if (state.holdAnswer === action) {
          state.held = true
          state.heldResponse = res
          return
        }
        res.writeHead(status, { 'content-type': 'application/json' })
        // `phpNotice`: a host that prints PHP's notices ahead of every answer (PHP 8.5, display_errors on)
        res.end((state.phpNotice ?? '') + JSON.stringify(value))
      }
      if (state.failGetId === Number(params.id) && action === 'content.get')
        return answer(403, { blocked: true })
      if (state.blockWriteKind === params.kind && action === 'content.update')
        return answer(403, { blocked: true })
      const refusal = state.refuse[action]
      if (refusal) {
        delete state.refuse[action]
        if (typeof refusal === 'number') return answer(refusal, { error: 'busy' })
        return answer(200, { ok: false, ...refusal })
      }
      if (token !== TOKEN) return answer(200, { ok: false, error: 'unauthorized' })
      if (action === 'core.manifest') return answer(200, { ok: true, extensions: [] })
      if (action === 'info') {
        // `info.template_files` as the engine advertises its door: `{version, enabled: false}` when off.
        const door = state.templateFiles
        const template_files = !door
          ? undefined
          : door.enabled === false
            ? { version: 1, enabled: false }
            : {
                version: 1,
                enabled: true,
                php: door.php === true,
                max_file_bytes: 2097152,
                max_bytes: 8388608,
                max_files: 100,
                extensions: ['css', 'js', 'json', 'php']
              }
        return answer(200, {
          ok: true,
          info: { component: '0.24.54', ...(template_files ? { template_files } : {}) }
        })
      }
      if (action === 'content.get') {
        const item = get(params.kind, params.id, params.key)
        const theme = THEME_KINDS.has(params.kind) ? state.themeFiles[params.kind]?.[params.key] : null
        if (!item && theme) {
          const body_revision = createHash('sha256').update(theme.content).digest('hex')
          return answer(200, {
            ok: true,
            kind: params.kind,
            id: 0,
            key: params.key,
            item: theme,
            stored: false,
            body_revision
          })
        }
        if (!item) return answer(200, { ok: false, error: 'not_found', message: 'no such record' })
        if (THEME_KINDS.has(params.kind)) {
          const body_revision = createHash('sha256').update(item.content).digest('hex')
          return answer(200, {
            ok: true,
            kind: params.kind,
            id: Number(item.id),
            key: params.key,
            item,
            body_revision
          })
        }
        const revision =
          params.kind === 'post'
            ? {
                body_revision: createHash('sha256')
                  .update(item.post_content ?? '')
                  .digest('hex')
              }
            : {}
        return answer(200, { ok: true, kind: params.kind, id: params.id, item, ...revision })
      }
      if (action === 'content.update') {
        if (params.expected_body_revision) {
          const now = THEME_KINDS.has(params.kind)
            ? (get(params.kind, 0, params.key) ?? state.themeFiles[params.kind]?.[params.key])
            : get(params.kind, params.id)
          const sha = createHash('sha256')
            .update((THEME_KINDS.has(params.kind) ? now?.content : now?.post_content) ?? '')
            .digest('hex')
          if (sha !== params.expected_body_revision)
            return answer(200, { ok: false, error: 'revision_stale' })
        }
        const previous = structuredClone(get(params.kind, params.id, params.key))
        const done = update(params)
        if (done && params.kind === 'postmeta') {
          ;(state.metaReceipts ??= {})[params.apply_id] = { ...params, before: previous }
        }
        if (state.dropAfterUpdate || state.dropUpdateKind === params.kind) {
          delete state.dropUpdateKind
          state.dropAfterUpdate = false
          req.socket.destroy()
          return
        }
        if (state.failReadback) state.refuse['content.get'] = 503
        if (!done) return answer(200, { ok: false, error: 'write_failed', message: 'target does not exist' })
        return answer(200, { ok: true, ...done })
      }
      if (action === 'apply.revert') {
        const receipt = state.metaReceipts?.[params.apply_id]
        if (receipt && !state.emptyMetaReceipt) {
          const address = `${receipt.id}:${receipt.key}`
          if (receipt.before === null) delete state.records.postmeta[address]
          else state.records.postmeta[address] = receipt.before
          delete state.metaReceipts[params.apply_id]
        }
        if (state.dropAfterRevert) {
          state.dropAfterRevert = false
          req.socket.destroy()
          return
        }
        return answer(200, { ok: true, reverted: receipt ? 1 : 0 })
      }
      if (action === 'content.batch') {
        for (const [i, op] of params.operations.entries()) {
          const row = get(op.kind, op.id)
          for (const [k, v] of Object.entries(op.expected ?? {}))
            if (!row || String(row[k] ?? '') !== String(v ?? ''))
              return answer(200, {
                ok: false,
                error: 'batch_failed',
                message: `conflict at operation ${i}: ${k} changed; every write of this batch was taken back`
              })
        }
        const ids = {}
        for (const op of params.operations) ids[op.key] = update({ ...op, apply_id: params.apply_id }).id
        return answer(200, { ok: true, ids })
      }
      if (action === 'content.delete') {
        const row = get(params.kind, params.id, params.key)
        if (!row) return answer(200, { ok: false, error: 'not_found' })
        // A part's row deleted hands its slot back to the theme's file.
        if (THEME_KINDS.has(params.kind)) delete state.records[params.kind][params.key]
        else if (platform === 'wordpress' && params.kind === 'menuItem')
          delete state.records.menuItem[params.id]
        else {
          const [column, value] = trash(params.kind)
          row[column] = String(value)
          if (platform === 'wordpress' && params.kind === 'post' && row.post_name)
            row.post_name += '__trashed'
        }
        return answer(200, { ok: true, kind: params.kind, id: params.id, trashed: true })
      }
      if (action === 'file.read') {
        const bytes = state.files[params.path]
        if (!bytes) return answer(200, { ok: false, error: 'read_failed', message: 'not a file' })
        return answer(200, { ok: true, path: params.path, content_b64: bytes.toString('base64') })
      }
      if (action === 'media.delete') {
        if (!params.path?.startsWith('images/')) return answer(200, { ok: false, error: 'bad_params' })
        if (!state.files[params.path]) return answer(200, { ok: false, error: 'write_failed' })
        delete state.files[params.path]
        return answer(200, { ok: true, deleted: { path: params.path } })
      }
      // Joomla's two setting doors, as the engine answers them: `read` (the default) and `set`.
      if (action === 'site.identity') {
        if (params.operation === 'set') Object.assign(state.identity, params.fields)
        return answer(200, { ok: true, fields: { ...state.identity } })
      }
      if (action === 'template.siteSettings') {
        const t = state.templates[params.template]
        if (!t) return answer(200, { ok: false, error: 'not_found' })
        if (params.operation === 'set') {
          for (const [p, values] of Object.entries(params.profiles ?? {}))
            Object.assign(
              (t.profiles[p] ??= {
                source: `templates/${params.template}/local/etc/site/${p}.json`,
                settings: {}
              }).settings,
              values
            )
          Object.assign(t.settings, params.fields ?? {})
        }
        return answer(200, { ok: true, template: params.template, framework: 't4', ...structuredClone(t) })
      }
      if (action.startsWith('template.files.')) return answer(200, templateDoor(state, action, params))
      if (action === 'media.upload') {
        state.files[params.path] = Buffer.from(params.content_b64, 'base64')
        return answer(200, {
          ok: true,
          path: params.path,
          ...(platform === 'wordpress' ? { attachment: ++state.next } : {})
        })
      }
      return answer(200, { ok: false, error: 'bad_params', message: `unknown action ${action}` })
    }
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      state.endpoint = `http://127.0.0.1:${server.address().port}/index.php?option=com_claudecowork&task=api.exec&format=json`
      state.close = () => new Promise((r) => server.close(r))
      resolve(state)
    })
  )
}
/**
 * The template door (`template.files.status|write|undo`) as claude-cowork lib/TemplateFiles.php answers
 * it: roots from `state.templateFiles`, all or nothing per write (refused → conflict → lint, in that
 * order), the bytes it replaced kept per `apply_id` for an undo that only puts back where the live file
 * still holds what the write left.
 */
function templateDoor(state, action, params) {
  const door = state.templateFiles
  const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex')
  const hashes = (bytes) => ({ sha1: sha1(bytes), blob: blobOf(bytes), bytes: bytes.length })
  if (!door) return { ok: false, error: 'bad_params', message: `unknown action ${action}` }
  if (door.enabled === false) return { ok: false, error: 'disabled', message: 'switched off' }
  const rootOf = (path) => door.roots.find((r) => path.startsWith(`${r.path}/`))
  if (action === 'template.files.status')
    return { ok: true, roots: door.roots, files: [], php: door.php === true }
  if (action === 'template.files.write') {
    const refused = []
    for (const f of params.files) {
      const root = rootOf(f.path)
      if (!root) refused.push({ path: f.path, reason: 'not_in_scope' })
      else if (f.path.endsWith('.php') && !door.php) refused.push({ path: f.path, reason: 'php_disabled' })
    }
    if (refused.length)
      return {
        ok: false,
        error: 'refused',
        message: 'This door does not write those. Nothing was written',
        refused,
        ...(refused.some((r) => r.reason === 'php_disabled')
          ? {
              next: 'PHP files are switched off on this site: its owner can allow them (Allow PHP in template files) and the write be sent again.'
            }
          : {})
      }
    const conflicts = []
    const ops = []
    for (const f of params.files) {
      const live = state.files[f.path] ?? null
      const bytes = f.delete ? null : Buffer.from(f.content_b64, 'base64')
      if (f.delete ? live === null : live !== null && live.equals(bytes)) {
        ops.push({ f, live, bytes, op: 'unchanged' })
        continue
      }
      if ((live ? blobOf(live) : null) !== f.expected_blob) {
        conflicts.push({
          path: f.path,
          expected: f.expected_blob ? { blob: f.expected_blob } : null,
          actual: live ? { sha1: sha1(live), blob: blobOf(live) } : null
        })
        continue
      }
      ops.push({ f, live, bytes, op: f.delete ? 'deleted' : live ? 'updated' : 'created' })
    }
    if (conflicts.length)
      return {
        ok: false,
        error: 'conflict',
        code: 'CONFLICT',
        message: 'not what the caller expected',
        conflicts
      }
    const lint = ops.filter(
      (o) => o.bytes && o.f.path.endsWith('.php') && o.op !== 'unchanged' && o.bytes.toString().includes('(;')
    )
    if (lint.length)
      return {
        ok: false,
        error: 'php_lint_failed',
        message: 'PHP that does not parse',
        lint: lint.map((o) => ({ path: o.f.path, message: 'syntax error, unexpected token ";"', line: 1 }))
      }
    const changing = ops.filter((o) => o.op !== 'unchanged')
    const undoId = changing.length
      ? createHash('sha1').update(`${Math.random()}`).digest('hex').slice(0, 24)
      : null
    for (const o of changing) {
      if (o.bytes) state.files[o.f.path] = o.bytes
      else delete state.files[o.f.path]
      ;(state.undoLog[params.apply_id] ??= []).push({
        undo_id: undoId,
        path: o.f.path,
        before: o.live,
        after: o.bytes ? sha1(o.bytes) : null
      })
    }
    return {
      ok: true,
      apply_id: params.apply_id,
      undo_id: undoId,
      changed: changing.length,
      files: ops.map((o) => ({
        path: o.f.path,
        op: o.op,
        before: o.live ? hashes(o.live) : null,
        after: o.bytes ? hashes(o.bytes) : null
      }))
    }
  }
  // template.files.undo
  const entries = (state.undoLog[params.apply_id] ?? []).filter(
    (e) => !params.undo_id || e.undo_id === params.undo_id
  )
  if (!entries.length) return { ok: false, error: 'not_found', message: 'No template file write is recorded' }
  const restored = []
  const already = []
  const kept = []
  for (const e of [...entries].reverse()) {
    const live = state.files[e.path] ?? null
    const liveSha = live ? sha1(live) : null
    if (liveSha === (e.before ? sha1(e.before) : null)) {
      already.push({ path: e.path, undo_id: e.undo_id })
      continue
    }
    if (liveSha !== e.after) {
      kept.push({
        path: e.path,
        undo_id: e.undo_id,
        reason: liveSha === null ? 'gone-on-live' : e.after === null ? 'exists-on-live' : 'changed-on-live',
        sha1: liveSha
      })
      continue
    }
    if (e.before) state.files[e.path] = e.before
    else delete state.files[e.path]
    restored.push({ path: e.path, op: e.before ? 'restored' : 'removed', undo_id: e.undo_id })
  }
  return { ok: true, apply_id: params.apply_id, complete: kept.length === 0, restored, already, kept }
}
const stringify = (fields) =>
  Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v)
    ])
  )

let runs = 0
/** A push folder holding `items` as its changeset (`apply` reads it from the folder it is given). */
function pushDir(items, platform = 'joomla') {
  const dir = join(root, `push-${++runs}`, `0f8e2c1a-1111-4222-8333-${String(runs).padStart(12, '0')}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'changeset.json'), JSON.stringify({ ok: true, platform, items }))
  writeFileSync(join(dir, 'push.json'), JSON.stringify({ platform }))
  return dir
}

function writer(live, args, token = TOKEN, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [WRITE, ...args], {
      env: { ...process.env, ...env, TRACY_SYNC_ENDPOINT: live.endpoint, TRACY_SYNC_TOKEN: token }
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', () => {
      const answer = JSON.parse(out.trim().split('\n').at(-1))
      resolve({ answer, err })
    })
  })
}
const apply = (live, dir, extra = []) => writer(live, ['apply', dir, dir, ...extra])
const undo = (live, dir) => writer(live, ['undo', dir])

/** A changeset item as live_push.py writes one. */
const update = (id, write, expect, extra = {}) => ({
  id: `article:${id}`,
  kind: 'article',
  spec: 'article',
  op: 'update',
  title: `Article ${id}`,
  liveId: id,
  key: null,
  ident: id,
  write,
  expect,
  dependsOn: [],
  seed: [],
  ...extra
})
const article = (id, fields = {}) => ({
  id: String(id),
  title: `Article ${id}`,
  introtext: 'text',
  state: '1',
  catid: '2',
  ...fields
})

test('an update is written where the live site still holds the base value; what it held is kept, 0600', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2) } } })
  try {
    const dir = pushDir([
      update(1, { title: 'New one' }, { title: 'Article 1' }),
      update(2, { introtext: 'Tracy wrote this' }, { introtext: 'text' })
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.state, 'applied')
    assert.deepEqual(
      answer.written.map((w) => w.id),
      ['article:1', 'article:2']
    )
    assert.equal(live.records.article[1].title, 'New one')
    assert.equal(live.records.article[2].introtext, 'Tracy wrote this')
    // Joomla's updates went in one lot, the base values as `expected`.
    const batch = live.calls.find((c) => c.action === 'content.batch')
    assert.deepEqual(
      batch.params.operations.map((o) => o.expected),
      [{ title: 'Article 1' }, { introtext: 'text' }]
    )
    assert.match(batch.params.apply_id, /^tracy-push-0f8e2c1a-/)
    const before = JSON.parse(readFileSync(join(dir, 'before.json'), 'utf8'))
    assert.equal(before.items['article:1'].before.title, 'Article 1')
    assert.equal(before.items['article:1'].after.title, 'New one')
    assert.equal(statSync(join(dir, 'before.json')).mode & 0o777, 0o600)
  } finally {
    await live.close()
  }
})

test('a host that prints PHP notices ahead of each answer is written all the same (PHP 8.5 curl_close)', async () => {
  const live = await engine({ records: { article: { 1: article(1) } } })
  live.phpNotice =
    '<br />\n<b>Deprecated</b>:  Function curl_close() is deprecated since 8.5, as it has no effect since PHP 8.0 in <b>/home/u1/public_html/plugins/Uploader.php</b> on line <b>53</b><br />\n'
  try {
    const dir = pushDir([update(1, { title: 'New one' }, { title: 'Article 1' })])
    const { answer } = await apply(live, dir)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.state, 'applied')
    assert.equal(live.records.article[1].title, 'New one')
  } finally {
    await live.close()
  }
})

test('a field the customer changed on the live site since the sync is a conflict: nothing of it is written', async () => {
  const live = await engine({
    records: { article: { 1: article(1, { title: 'Customer title' }), 2: article(2) } }
  })
  try {
    const dir = pushDir([
      update(1, { title: 'Tracy title' }, { title: 'Article 1' }),
      update(2, { title: 'Tracy two' }, { title: 'Article 2' })
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'partial')
    assert.deepEqual(
      answer.conflicts.map((c) => [c.id, c.reason, c.fields]),
      [['article:1', 'changed-on-live', ['title']]]
    )
    assert.equal(live.records.article[1].title, 'Customer title', 'the customer’s change stays')
    assert.equal(live.records.article[2].title, 'Tracy two')
  } finally {
    await live.close()
  }
})

test('a record open in the live site’s editor is not written, and the answer names whose editor', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2) } } })
  try {
    const lockedBy = { kind: 'admin-user', name: 'Victor Luu', since: '2026-10-26T08:20:00Z', until: null }
    const locked = {
      error: 'locked',
      message: '“Article 1” is open in the editor of Victor Luu.',
      code: 'SLOT_LOCKED_BY_USER',
      lockedBy,
      locked: [{ kind: 'article', id: 1, lockedBy }]
    }
    // One open record refuses the whole lot; then the item alone is refused the same way.
    live.refuse['content.batch'] = locked
    live.refuse['content.update'] = locked
    const dir = pushDir([
      update(1, { title: 'One' }, { title: 'Article 1' }),
      update(2, { title: 'Two' }, { title: 'Article 2' })
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'partial')
    assert.deepEqual(
      answer.conflicts.map((c) => [c.id, c.reason, c.lockedBy, c.lockedSince]),
      [['article:1', 'open-in-editor', 'Victor Luu', '2026-10-26T08:20:00Z']]
    )
    assert.equal(live.records.article[1].title, 'Article 1', 'the open record is left as it is')
    assert.equal(live.records.article[2].title, 'Two')
  } finally {
    await live.close()
  }
})

test('a change made between the read and the lot: the engine refuses the lot, each item is read and written alone', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2) } } })
  try {
    // The lot is refused as the engine refuses one whose `expected` moved under it.
    live.refuse['content.batch'] = {
      error: 'batch_failed',
      message: 'conflict at operation 1: title changed; every write of this batch was taken back'
    }
    const dir = pushDir([
      update(1, { title: 'One' }, { title: 'Article 1' }),
      update(2, { title: 'Two' }, { title: 'Article 2' })
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'applied')
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 2)
    assert.equal(live.records.article[2].title, 'Two')
  } finally {
    await live.close()
  }
})

test('a new category and its article: the article names the number the live site gave the category', async () => {
  const live = await engine({ records: { article: {}, category: {} } })
  try {
    const dir = pushDir([
      {
        id: 'category:new:9',
        kind: 'category',
        spec: 'category',
        op: 'create',
        title: 'News',
        liveId: null,
        key: null,
        ident: 0,
        creates: 'categories:9',
        write: { title: 'News', parent_id: '1' },
        expect: {},
        dependsOn: [],
        seed: []
      },
      {
        id: 'article:new:3',
        kind: 'article',
        spec: 'article',
        op: 'create',
        title: 'Spring sale',
        liveId: null,
        key: null,
        ident: 0,
        creates: 'content:3',
        write: {
          title: 'Spring sale',
          catid: { $new: 'categories:9' },
          introtext: 'see @@tracy-new:categories:9@@'
        },
        expect: {},
        dependsOn: ['category:new:9'],
        seed: []
      }
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    const cat = Object.values(live.records.category)[0]
    const art = Object.values(live.records.article)[0]
    assert.equal(art.catid, cat.id)
    assert.equal(art.introtext, `see ${cat.id}`)
    // The numbers the live site gave, for the id map.
    assert.deepEqual(answer.created, { 'categories:9': Number(cat.id), 'content:3': Number(art.id) })
  } finally {
    await live.close()
  }
})

test('deletes wait for the owner’s word; over the limit waits for the next push; what depends on a skip is skipped', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2), 3: article(3) } } })
  try {
    const del = {
      ...update(1, {}, { title: 'Article 1', state: '1' }),
      op: 'delete',
      trash: ['state', '-2']
    }
    const items = [
      del,
      update(2, { title: 'Two' }, { title: 'Article 2' }),
      update(3, { title: 'Three' }, { title: 'Article 3' })
    ]
    let r = await apply(live, pushDir(items), ['--limit', '1'])
    assert.deepEqual(
      r.answer.skipped.map((s) => [s.id, s.reason]),
      [
        ['article:1', 'deletes-not-confirmed'],
        ['article:3', 'over-limit']
      ]
    )
    assert.equal(live.records.article[1].state, '1')
    r = await apply(live, pushDir([del]), ['--confirm-deletes'])
    assert.equal(r.answer.state, 'applied')
    assert.equal(live.records.article[1].state, '-2', 'into the live site’s trash')
  } finally {
    await live.close()
  }
})

test('a busy site is asked again; a refused token stops before anything is written', async () => {
  const live = await engine({ records: { article: { 1: article(1) } } })
  try {
    live.refuse['content.batch'] = { error: 'writer_busy' }
    const { answer } = await apply(live, pushDir([update(1, { title: 'One' }, { title: 'Article 1' })]))
    assert.equal(answer.state, 'applied')
    const dir = pushDir([update(1, { title: 'x' }, { title: 'One' })])
    const refused = await writer(live, ['apply', dir, dir], 'wrong-token')
    assert.deepEqual(refused.answer, { ok: false, code: 'TOKEN_REFUSED' })
    assert.equal(live.records.article[1].title, 'One')
  } finally {
    await live.close()
  }
})

test('an apply cut off is taken up again: what it wrote is not written twice', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2) } } })
  try {
    const dir = pushDir([
      update(1, { title: 'One' }, { title: 'Article 1' }),
      update(2, { title: 'Two' }, { title: 'Article 2' })
    ])
    writeFileSync(
      join(dir, 'journal.jsonl'),
      `${JSON.stringify({ id: 'article:1', state: 'written', extra: { liveId: 1 } })}\n`
    )
    const { answer } = await apply(live, dir)
    assert.deepEqual(answer.written.map((w) => w.id).sort(), ['article:1', 'article:2'])
    const touched = live.calls.flatMap((c) =>
      c.action === 'content.batch' ? c.params.operations.map((o) => o.id) : []
    )
    assert.deepEqual(touched, [2])
  } finally {
    await live.close()
  }
})

test('a picture: uploaded where the live site has none; the customer’s own file at that path is a conflict', async () => {
  const webroot = join(root, 'webroot')
  mkdirSync(join(webroot, 'images'), { recursive: true })
  const bytes = Buffer.from('jpeg bytes of the copy')
  writeFileSync(join(webroot, 'images', 'banner.jpg'), bytes)
  writeFileSync(join(webroot, 'images', 'logo.png'), bytes)
  const blob = createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex')
  const live = await engine({ files: { 'images/logo.png': Buffer.from('the customer’s logo') } })
  try {
    const media = (path) => ({
      id: `media:${path}`,
      creates: `file:${path}`,
      kind: 'media',
      spec: 'media',
      op: 'upload',
      title: path,
      liveId: null,
      key: null,
      ident: 0,
      path,
      blob,
      baseBlob: null,
      write: {},
      expect: {},
      dependsOn: [],
      seed: []
    })
    const { answer } = await apply(live, pushDir([media('images/banner.jpg'), media('images/logo.png')]), [
      '--webroot',
      webroot
    ])
    assert.deepEqual(
      answer.written.map((w) => w.id),
      ['media:images/banner.jpg']
    )
    assert.deepEqual(
      answer.conflicts.map((c) => c.id),
      ['media:images/logo.png']
    )
    assert.equal(live.files['images/banner.jpg'].toString(), 'jpeg bytes of the copy')
    assert.equal(live.files['images/logo.png'].toString(), 'the customer’s logo')
  } finally {
    await live.close()
  }
})

test('WordPress: a page body is written only over the body the read saw (`expected_body_revision`)', async () => {
  const live = await engine({
    platform: 'wordpress',
    records: {
      post: { 10: { ID: 10, post_title: 'About', post_content: '<p>Old</p>', post_status: 'publish' } }
    }
  })
  try {
    const item = {
      ...update(10, { post_content: '<p>New</p>' }, { post_content: '<p>Old</p>' }),
      id: 'post:10',
      kind: 'post',
      spec: 'post',
      bodyRevision: true
    }
    const { answer } = await apply(live, pushDir([item], 'wordpress'))
    assert.equal(answer.state, 'applied')
    const write = live.calls.find((c) => c.action === 'content.update')
    assert.match(write.params.expected_body_revision, /^[a-f0-9]{64}$/)
    assert.equal(live.records.post[10].post_content, '<p>New</p>')
  } finally {
    await live.close()
  }
})

test('WordPress block theme: parts and templates go by slug — over the live row, new only while the live site shows the theme’s file, handed back to the theme; Undo puts each back', async () => {
  const theme = {
    templatePart: {
      header: { title: 'Header', content: '<!-- wp:navigation-link {"label":"Help"} /-->', area: 'header' },
      footer: { title: 'Footer', content: '<p>Theme footer</p>', area: 'footer' },
      aside: { title: 'Aside', content: '<p>Theme aside</p>', area: 'uncategorized' },
      banner: { title: 'Banner', content: '<p>Theme banner</p>', area: 'uncategorized' }
    },
    template: { page: { title: 'Page', content: '<!-- wp:post-content /-->' } }
  }
  const live = await engine({
    platform: 'wordpress',
    themeFiles: theme,
    records: {
      templatePart: {
        header: {
          id: '50',
          title: 'Header',
          content: '<!-- wp:navigation-link {"label":"Help"} /-->',
          area: 'header'
        },
        // The customer saved a banner of their own on the live site since the sync.
        banner: { id: '51', title: 'Banner', content: '<p>Customer banner</p>', area: 'uncategorized' }
      },
      template: {
        page: {
          id: '53',
          title: 'Page',
          content: '<!-- wp:group --><!-- wp:post-content /--><!-- /wp:group -->'
        }
      }
    }
  })
  const part = (op, slug, write, expect, extra = {}) => ({
    id: `templatePart:${op === 'create' ? 'new:' : ''}${slug}`,
    kind: 'templatePart',
    spec: 'templatePart',
    op,
    title: `Template part · ${slug}`,
    liveId: null,
    key: slug,
    ident: 0,
    write,
    expect,
    dependsOn: [],
    seed: [],
    ...extra
  })
  try {
    const dir = pushDir(
      [
        part(
          'update',
          'header',
          { content: '<!-- wp:navigation-link {"label":"Support"} /-->', title: 'Header' },
          { content: '<!-- wp:navigation-link {"label":"Help"} /-->', title: 'Header' },
          { bodyRevision: true }
        ),
        part(
          'create',
          'footer',
          { content: '<p>Tracy footer</p>', title: 'Footer', area: 'footer' },
          { $absent: true },
          { creates: 'posts:61' }
        ),
        // The live site handed the aside back to the theme since the sync: Tracy's edit is not written over it.
        part(
          'update',
          'aside',
          { content: '<p>Tracy aside</p>', title: 'Aside' },
          { content: '<p>Saved aside</p>', title: 'Aside' }
        ),
        part(
          'create',
          'banner',
          { content: '<p>Tracy banner</p>', title: 'Banner', area: 'uncategorized' },
          { $absent: true }
        ),
        {
          id: 'template:page',
          kind: 'template',
          spec: 'template',
          op: 'delete',
          title: 'Template · Page',
          liveId: 0,
          key: 'page',
          ident: 0,
          write: {},
          expect: { content: '<!-- wp:group --><!-- wp:post-content /--><!-- /wp:group -->', title: 'Page' },
          trash: null,
          dependsOn: [],
          seed: []
        }
      ],
      'wordpress'
    )
    const { answer } = await apply(live, dir, ['--confirm-deletes'])
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.deepEqual(answer.written.map((w) => w.id).sort(), [
      'template:page',
      'templatePart:header',
      'templatePart:new:footer'
    ])
    assert.deepEqual(answer.conflicts.map((c) => [c.id, c.reason]).sort(), [
      ['templatePart:aside', 'changed-on-live'],
      ['templatePart:new:banner', 'changed-on-live']
    ])
    assert.equal(live.records.templatePart.header.content, '<!-- wp:navigation-link {"label":"Support"} /-->')
    assert.equal(
      live.records.templatePart.header.title,
      'Header',
      'the title goes with the content, never the slug'
    )
    const header = live.calls.find((c) => c.action === 'content.update' && c.params.key === 'header')
    assert.match(header.params.expected_body_revision, /^[a-f0-9]{64}$/)
    assert.deepEqual(
      { ...live.records.templatePart.footer, id: undefined },
      { id: undefined, title: 'Footer', content: '<p>Tracy footer</p>', area: 'footer' }
    )
    assert.equal(answer.created['posts:61'], Number(live.records.templatePart.footer.id))
    assert.equal(
      live.records.templatePart.banner.content,
      '<p>Customer banner</p>',
      'the customer’s own banner stays'
    )
    assert.equal(live.records.templatePart.aside, undefined, 'no row is made over the theme’s aside')
    assert.equal(live.records.template.page, undefined, 'the page template is the theme’s again')

    const back = (await undo(live, dir)).answer
    assert.equal(back.ok, true, JSON.stringify(back))
    assert.deepEqual(back.restored.map((r) => r.id).sort(), [
      'template:page',
      'templatePart:header',
      'templatePart:new:footer'
    ])
    assert.equal(live.records.templatePart.header.content, '<!-- wp:navigation-link {"label":"Help"} /-->')
    assert.equal(live.records.templatePart.footer, undefined, 'the part the push made is the theme’s again')
    assert.deepEqual(
      { ...live.records.template.page, id: undefined },
      {
        id: undefined,
        title: 'Page',
        content: '<!-- wp:group --><!-- wp:post-content /--><!-- /wp:group -->'
      }
    )
  } finally {
    await live.close()
  }
})

test('Undo: back to what the live site held, only where it still holds what the push left; a created record to the trash', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2) }, category: {} } })
  try {
    const dir = pushDir([
      update(1, { title: 'One' }, { title: 'Article 1' }),
      update(2, { title: 'Two' }, { title: 'Article 2' }),
      {
        id: 'article:new:3',
        kind: 'article',
        spec: 'article',
        op: 'create',
        title: 'New',
        liveId: null,
        key: null,
        ident: 0,
        creates: 'content:3',
        write: { title: 'New', state: '1' },
        expect: {},
        dependsOn: [],
        seed: []
      }
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'applied')
    const made = answer.created['content:3']
    // The customer edits article 2 again after the push.
    live.records.article[2].title = 'Customer two'
    const back = (await undo(live, dir)).answer
    assert.equal(back.ok, true, JSON.stringify(back))
    assert.equal(back.state, 'partial')
    assert.deepEqual(back.restored.map((r) => r.id).sort(), ['article:1', 'article:new:3'])
    assert.deepEqual(
      back.kept.map((k) => [k.id, k.reason, k.fields]),
      [['article:2', 'changed-on-live', ['title']]]
    )
    assert.equal(live.records.article[1].title, 'Article 1')
    assert.equal(live.records.article[2].title, 'Customer two', 'the customer’s later edit stays')
    assert.equal(live.records.article[made].state, '-2', 'the record the push made goes to the trash')
    assert.ok(existsSync(join(dir, 'restored.json')))
  } finally {
    await live.close()
  }
})

// ── phase 2: files and settings ─────────────────────────────────────────────────────────────
const blobOf = (bytes) =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex')
const fileItem = (path, bytes, baseBytes, extra = {}) => ({
  id: `file:${path}`,
  kind: 'file',
  spec: 'file',
  op: 'upload',
  group: path.endsWith('.php') ? 'php' : 'files',
  title: path,
  liveId: null,
  key: null,
  ident: 0,
  path,
  blob: bytes ? blobOf(bytes) : null,
  baseBlob: baseBytes ? blobOf(baseBytes) : null,
  size: bytes?.length ?? 0,
  write: {},
  expect: {},
  dependsOn: [],
  seed: [],
  ...extra
})

test('files: a template’s CSS is written where the live file is still the base’s; Undo puts the live bytes back, only where the push’s are still there', async () => {
  const webroot = join(root, 'webroot-files')
  const css = 'media/templates/site/cassiopeia/css/user.css'
  const js = 'media/templates/site/cassiopeia/js/user.js'
  const logo = 'images/logo-new.png'
  const theirs = 'media/templates/site/cassiopeia/css/theirs.css'
  const copy = {
    [css]: Buffer.from('.a { color: red }\n'),
    [js]: Buffer.from('console.log(1)\n'),
    [logo]: Buffer.from('png of the copy'),
    [theirs]: Buffer.from('.b { color: blue }\n')
  }
  for (const [path, bytes] of Object.entries(copy)) {
    mkdirSync(dirname(join(webroot, path)), { recursive: true })
    writeFileSync(join(webroot, path), bytes)
  }
  const base = Buffer.from('.a {}\n')
  const live = await engine({ files: { [css]: base, [theirs]: Buffer.from('.b { the customer }\n') } })
  try {
    const dir = pushDir([
      fileItem(css, copy[css], base),
      fileItem(js, copy[js], null),
      fileItem(logo, copy[logo], null),
      fileItem(theirs, copy[theirs], Buffer.from('.b {}\n'))
    ])
    const { answer } = await apply(live, dir, ['--webroot', webroot])
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${css}`, `file:${js}`, `file:${logo}`]
    )
    // The customer changed that one on the live site since the sync: theirs stays.
    assert.deepEqual(
      answer.conflicts.map((c) => [c.id, c.reason]),
      [[`file:${theirs}`, 'changed-on-live']]
    )
    assert.equal(live.files[css].toString(), '.a { color: red }\n')
    assert.equal(live.files[theirs].toString(), '.b { the customer }\n')
    // What the live file held before is kept beside the push, 0600, by its blob.
    const before = JSON.parse(readFileSync(join(dir, 'before.json'), 'utf8')).items[`file:${css}`]
    assert.equal(before.before.blob, blobOf(base))
    assert.equal(statSync(join(dir, 'files', before.before.stored)).mode & 0o777, 0o600)
    // The customer edits the new script after the push: Undo leaves it.
    live.files[js] = Buffer.from('console.log("the customer")\n')
    const back = (await undo(live, dir)).answer
    assert.equal(back.ok, true, JSON.stringify(back))
    assert.deepEqual(back.restored.map((r) => r.id).sort(), [`file:${logo}`, `file:${css}`])
    assert.deepEqual(
      back.kept.map((k) => [k.id, k.reason]),
      [[`file:${js}`, 'changed-on-live']]
    )
    assert.equal(live.files[css].toString(), '.a {}\n', 'the base bytes are back')
    assert.equal(live.files[logo], undefined, 'a picture the push added is taken off (media.delete)')
  } finally {
    await live.close()
  }
})

test('files: a CSS file the push added cannot be taken off on Undo — named, left', async () => {
  const webroot = join(root, 'webroot-new')
  const path = 'media/templates/site/cassiopeia/css/new.css'
  mkdirSync(dirname(join(webroot, path)), { recursive: true })
  writeFileSync(join(webroot, path), '.n {}\n')
  const live = await engine()
  try {
    const dir = pushDir([fileItem(path, Buffer.from('.n {}\n'), null)])
    await apply(live, dir, ['--webroot', webroot])
    const back = (await undo(live, dir)).answer
    assert.deepEqual(
      back.kept.map((k) => [k.id, k.reason]),
      [[`file:${path}`, 'cannot-remove']]
    )
    assert.equal(live.files[path].toString(), '.n {}\n')
  } finally {
    await live.close()
  }
})

test('files: a picture the copy removed goes only with the removals ticked, only while the live one is the base’s; Undo uploads it again', async () => {
  const old = Buffer.from('old png')
  const live = await engine({
    files: { 'images/old.png': old, 'images/kept.png': Buffer.from('customer png') }
  })
  try {
    const del = (path, baseBytes) => ({ ...fileItem(path, null, baseBytes), op: 'delete', group: 'remove' })
    const items = [del('images/old.png', old), del('images/kept.png', Buffer.from('base png'))]
    const unticked = (await apply(live, pushDir(items))).answer
    assert.deepEqual(
      unticked.skipped.map((s) => s.reason),
      ['deletes-not-confirmed', 'deletes-not-confirmed']
    )
    const dir = pushDir(items)
    const { answer } = await apply(live, dir, ['--confirm-deletes'])
    assert.deepEqual(
      answer.written.map((w) => w.id),
      ['file:images/old.png']
    )
    assert.deepEqual(
      answer.conflicts.map((c) => c.id),
      ['file:images/kept.png']
    )
    assert.equal(live.files['images/old.png'], undefined)
    const back = (await undo(live, dir)).answer
    assert.deepEqual(
      back.restored.map((r) => r.id),
      ['file:images/old.png']
    )
    assert.equal(live.files['images/old.png'].toString(), 'old png')
  } finally {
    await live.close()
  }
})

test('PHP files: written only with their own OK', async () => {
  const webroot = join(root, 'webroot-php')
  const path = 'media/mod_a/helper.php'
  mkdirSync(dirname(join(webroot, path)), { recursive: true })
  writeFileSync(join(webroot, path), '<?php echo 1;\n')
  const live = await engine()
  try {
    const item = fileItem(path, Buffer.from('<?php echo 1;\n'), null)
    const without = (await apply(live, pushDir([item]), ['--webroot', webroot])).answer
    assert.deepEqual(
      without.skipped.map((s) => [s.id, s.reason]),
      [[`file:${path}`, 'php-not-confirmed']]
    )
    assert.equal(live.files[path], undefined)
    const confirmed = (await apply(live, pushDir([item]), ['--webroot', webroot, '--confirm-php'])).answer
    assert.deepEqual(
      confirmed.written.map((w) => w.id),
      [`file:${path}`]
    )
  } finally {
    await live.close()
  }
})

test('settings: Joomla’s site name through site.identity and a T4 profile through template.siteSettings — compared first, undone only where unchanged since', async () => {
  const live = await engine({
    identity: { sitename: 'Shop', MetaDesc: 'Old words', sitename_pagetitles: 0 },
    templates: {
      ja_vega: {
        profiles: {
          default: {
            source: 'templates/ja_vega/etc/site/default.json',
            settings: { site_name: 'Shop', site_logo: 'images/logo.png' }
          }
        },
        settings: {}
      }
    }
  })
  try {
    const identity = {
      id: 'setting:siteIdentity',
      kind: 'siteIdentity',
      spec: 'siteIdentity',
      op: 'update',
      group: 'settings',
      title: 'Global Configuration',
      liveId: null,
      key: null,
      ident: 0,
      path: 'configuration.php',
      names: ['MetaDesc', 'sitename'],
      write: { sitename: 'Shop & Co', MetaDesc: 'New words' },
      expect: { sitename: 'Shop', MetaDesc: 'Old words' },
      dependsOn: [],
      seed: []
    }
    const profile = {
      id: 'templateSettings:ja_vega:default',
      kind: 'templateSettings',
      spec: 'templateSettings',
      op: 'update',
      group: 'settings',
      title: 'ja_vega › default',
      liveId: null,
      key: 'ja_vega',
      ident: 0,
      write: { template: 'ja_vega', profiles: { default: { site_name: 'Shop & Co' } } },
      expect: { site_name: 'Shop' },
      dependsOn: [],
      seed: []
    }
    const share = {
      ...profile,
      id: 'templateSettings:ja_vega:tracy-favicon',
      write: { template: 'ja_vega', fields: { other_shareImage: 'images/share.png' } },
      expect: { other_shareImage: 'images/theirs.png' }
    }
    const dir = pushDir([identity, profile, share])
    const { answer } = await apply(live, dir)
    assert.deepEqual(
      answer.written.map((w) => w.id),
      ['setting:siteIdentity', 'templateSettings:ja_vega:default']
    )
    // The share image is not what the base held on the live site: the customer's, left.
    assert.deepEqual(
      answer.conflicts.map((c) => [c.id, c.fields]),
      [['templateSettings:ja_vega:tracy-favicon', ['other_shareImage']]]
    )
    assert.equal(live.identity.sitename, 'Shop & Co')
    assert.equal(live.templates.ja_vega.profiles.default.settings.site_name, 'Shop & Co')
    assert.ok(
      !live.calls.some((c) => c.action === 'content.batch'),
      'a setting door is never in a content.batch'
    )
    // The customer renames the site on the live site after the push: Undo leaves the identity, takes back the profile.
    live.identity.MetaDesc = 'Customer words'
    const back = (await undo(live, dir)).answer
    assert.deepEqual(
      back.restored.map((r) => r.id),
      ['templateSettings:ja_vega:default']
    )
    assert.deepEqual(
      back.kept.map((k) => [k.id, k.reason, k.fields]),
      [['setting:siteIdentity', 'changed-on-live', ['MetaDesc']]]
    )
    assert.equal(live.templates.ja_vega.profiles.default.settings.site_name, 'Shop')
    assert.equal(live.identity.sitename, 'Shop & Co')
  } finally {
    await live.close()
  }
})

test('settings: WordPress theme mods are written whole, only while the live value is still the base’s whole; Undo writes the live value back', async () => {
  const before = { 0: false, custom_logo: 50, header_textcolor: 'ffffff' }
  const live = await engine({
    platform: 'wordpress',
    records: { option: { '0:theme_mods_astra': { value: before } } }
  })
  try {
    const mods = {
      id: 'option:theme_mods_astra',
      kind: 'option',
      spec: 'themeMods',
      op: 'update',
      group: 'settings',
      title: 'Customizer · astra',
      liveId: 0,
      key: 'theme_mods_astra',
      ident: 0,
      write: { value: { ...before, header_textcolor: '222222' } },
      expect: { value: before },
      dependsOn: [],
      seed: []
    }
    const dir = pushDir([mods], 'wordpress')
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    const back = (await undo(live, dir)).answer
    assert.deepEqual(
      back.restored.map((r) => r.id),
      ['option:theme_mods_astra']
    )
    assert.equal(JSON.parse(live.records.option['0:theme_mods_astra'].value).header_textcolor, 'ffffff')
    // A customer's change anywhere in the option since the sync: the whole option is theirs.
    live.records.option['0:theme_mods_astra'] = { value: { ...before, background_color: '000000' } }
    const again = (await apply(live, pushDir([mods], 'wordpress'))).answer
    assert.deepEqual(
      again.conflicts.map((c) => [c.id, c.fields]),
      [['option:theme_mods_astra', ['value']]]
    )
  } finally {
    await live.close()
  }
})

// ── template files: a template's or theme's own files through `template.files.*` ─────────────
const JOOMLA_TEMPLATE = {
  enabled: true,
  php: false,
  roots: [
    { path: 'templates/ja_vega', kind: 'template', name: 'ja_vega', php: true },
    { path: 'media/templates/site/ja_vega', kind: 'template-media', name: 'ja_vega', php: false }
  ]
}
const templateItem = (path, bytes, baseBytes, extra = {}) =>
  fileItem(path, bytes, baseBytes, {
    door: 'template',
    root: path.startsWith('media/') ? 'media/templates/site/ja_vega' : 'templates/ja_vega',
    ...(bytes ? {} : { op: 'delete', group: 'remove' }),
    ...extra
  })
/** The copy's webroot holding `files` (path → text). */
function copyOf(name, files) {
  const webroot = join(root, name)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(webroot, path)), { recursive: true })
    writeFileSync(join(webroot, path), text)
  }
  return webroot
}
/** A push folder whose changeset carries the template door's limits. */
function templatePush(items, limits = {}, platform = 'joomla') {
  const dir = pushDir(items, platform)
  const changeset = JSON.parse(readFileSync(join(dir, 'changeset.json'), 'utf8'))
  writeFileSync(
    join(dir, 'changeset.json'),
    JSON.stringify({
      ...changeset,
      templateFiles: { maxFiles: 100, maxBytes: 8388608, maxFileBytes: 2097152, ...limits }
    })
  )
  return dir
}
const writes = (live) => live.calls.filter((c) => c.action === 'template.files.write')

test('template files: written in batches within the door’s limits, each over the base’s blob; Undo puts back, removes what the push added, restores what it removed', async () => {
  const css = 'templates/ja_vega/css/custom.css'
  const theme = 'templates/ja_vega/local/etc/theme/default.json'
  const added = 'templates/ja_vega/css/added.css'
  const gone = 'templates/ja_vega/css/old.css'
  const copy = { [css]: '.a { color: red }\n', [theme]: '{"color":"red"}\n', [added]: '.n {}\n' }
  const webroot = copyOf('webroot-tpl', copy)
  const base = {
    [css]: Buffer.from('.a {}\n'),
    [theme]: Buffer.from('{"color":"blue"}\n'),
    [gone]: Buffer.from('.o {}\n')
  }
  const live = await engine({ files: { ...base }, templateFiles: JOOMLA_TEMPLATE })
  try {
    const dir = templatePush(
      [
        templateItem(css, Buffer.from(copy[css]), base[css]),
        templateItem(theme, Buffer.from(copy[theme]), base[theme]),
        templateItem(added, Buffer.from(copy[added]), null),
        templateItem(gone, null, base[gone])
      ],
      { maxFiles: 2 }
    )
    const { answer } = await apply(live, dir, ['--webroot', webroot, '--confirm-deletes'])
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${css}`, `file:${theme}`, `file:${added}`, `file:${gone}`]
    )
    // Two calls of two files each (the door's max_files here), each file naming the base's blob.
    assert.deepEqual(
      writes(live).map((c) => c.params.files.map((f) => [f.path, f.expected_blob, f.delete === true])),
      [
        [
          [css, blobOf(base[css]), false],
          [theme, blobOf(base[theme]), false]
        ],
        [
          [added, null, false],
          [gone, blobOf(base[gone]), true]
        ]
      ]
    )
    assert.ok(writes(live).every((c) => c.params.apply_id === answer.applyId))
    assert.equal(live.files[css].toString(), copy[css])
    assert.equal(live.files[added].toString(), copy[added])
    assert.equal(live.files[gone], undefined)
    // The engine's undo ids stay with the push.
    const before = JSON.parse(readFileSync(join(dir, 'before.json'), 'utf8'))
    assert.equal(before.templateUndo.length, 2)
    assert.equal(before.items[`file:${css}`].undoId, before.templateUndo[0])
    assert.ok(!existsSync(join(dir, 'files')), 'the engine keeps the bytes it replaced, not the push folder')

    const back = (await undo(live, dir)).answer
    assert.equal(back.state, 'undone', JSON.stringify(back))
    assert.deepEqual(
      back.restored.map((r) => r.id).sort(),
      [`file:${added}`, `file:${css}`, `file:${gone}`, `file:${theme}`].sort()
    )
    assert.deepEqual(back.kept, [])
    assert.equal(live.files[css].toString(), '.a {}\n')
    assert.equal(live.files[added], undefined, 'a file the push added is taken off again')
    assert.equal(live.files[gone].toString(), '.o {}\n', 'a file the push removed is back')
    const undone = live.calls.filter((c) => c.action === 'template.files.undo')
    assert.deepEqual(
      undone.map((c) => c.params),
      [{ apply_id: answer.applyId }]
    )
  } finally {
    await live.close()
  }
})

test('template files: a file the customer changed on the live site is a conflict, nothing of it written; the rest of its call goes again', async () => {
  const mine = 'templates/ja_vega/css/custom.css'
  const theirs = 'templates/ja_vega/css/theirs.css'
  const webroot = copyOf('webroot-tpl-conflict', { [mine]: '.a { red }\n', [theirs]: '.b { red }\n' })
  const live = await engine({
    files: { [mine]: Buffer.from('.a {}\n'), [theirs]: Buffer.from('.b { the customer }\n') },
    templateFiles: JOOMLA_TEMPLATE
  })
  try {
    const dir = templatePush([
      templateItem(mine, Buffer.from('.a { red }\n'), Buffer.from('.a {}\n')),
      templateItem(theirs, Buffer.from('.b { red }\n'), Buffer.from('.b {}\n'))
    ])
    const { answer } = await apply(live, dir, ['--webroot', webroot])
    assert.equal(answer.state, 'partial')
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${mine}`]
    )
    assert.deepEqual(
      answer.conflicts.map((c) => [c.id, c.reason, c.fields]),
      [[`file:${theirs}`, 'changed-on-live', ['file']]]
    )
    assert.equal(live.files[theirs].toString(), '.b { the customer }\n', 'theirs stays')
    assert.deepEqual(
      writes(live).map((c) => c.params.files.map((f) => f.path)),
      [[mine, theirs], [mine]]
    )
  } finally {
    await live.close()
  }
})

test('template files: PHP switched off on the live site fails that file with the owner’s switch named; PHP that does not parse there fails alone', async () => {
  const css = 'templates/ja_vega/css/custom.css'
  const override = 'templates/ja_vega/html/com_content/article/default.php'
  const broken = 'templates/ja_vega/html/mod_menu/default.php'
  const copy = { [css]: '.a { red }\n', [override]: '<?php echo 1;\n', [broken]: '<?php echo (;\n' }
  const webroot = copyOf('webroot-tpl-php', copy)
  const items = () => [
    templateItem(css, Buffer.from(copy[css]), Buffer.from('.a {}\n')),
    templateItem(override, Buffer.from(copy[override]), Buffer.from('<?php\n')),
    templateItem(broken, Buffer.from(copy[broken]), Buffer.from('<?php\n'))
  ]
  const files = () => ({
    [css]: Buffer.from('.a {}\n'),
    [override]: Buffer.from('<?php\n'),
    [broken]: Buffer.from('<?php\n')
  })
  const off = await engine({ files: files(), templateFiles: JOOMLA_TEMPLATE })
  try {
    const { answer } = await apply(off, templatePush(items()), ['--webroot', webroot, '--confirm-php'])
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${css}`]
    )
    assert.deepEqual(
      answer.failed.map((f) => [f.id, f.error]),
      [
        [`file:${override}`, 'php_disabled'],
        [`file:${broken}`, 'php_disabled']
      ]
    )
    assert.match(answer.failed[0].message, /Allow PHP in template files/)
    assert.equal(off.files[override].toString(), '<?php\n')
  } finally {
    await off.close()
  }
  const on = await engine({ files: files(), templateFiles: { ...JOOMLA_TEMPLATE, php: true } })
  try {
    const { answer } = await apply(on, templatePush(items()), ['--webroot', webroot, '--confirm-php'])
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${css}`, `file:${override}`]
    )
    assert.deepEqual(
      answer.failed.map((f) => [f.id, f.error]),
      [[`file:${broken}`, 'php_lint_failed']]
    )
    assert.equal(on.files[override].toString(), copy[override])
    assert.equal(on.files[broken].toString(), '<?php\n', 'nothing of a file that does not parse')
    // Without the PHP tick the PHP files wait, the rest goes.
    const again = await engine({ files: files(), templateFiles: { ...JOOMLA_TEMPLATE, php: true } })
    try {
      const said = (await apply(again, templatePush(items()), ['--webroot', webroot])).answer
      assert.deepEqual(
        said.skipped.map((k) => [k.id, k.reason]),
        [
          [`file:${override}`, 'php-not-confirmed'],
          [`file:${broken}`, 'php-not-confirmed']
        ]
      )
    } finally {
      await again.close()
    }
  } finally {
    await on.close()
  }
})

test('template files: a busy writer is asked again; a file that changed on the copy since the preview is not sent', async () => {
  const css = 'templates/ja_vega/css/custom.css'
  const moved = 'templates/ja_vega/css/moved.css'
  const webroot = copyOf('webroot-tpl-busy', { [css]: '.a { red }\n', [moved]: '.m { edited again }\n' })
  const live = await engine({
    files: { [css]: Buffer.from('.a {}\n'), [moved]: Buffer.from('.m {}\n') },
    templateFiles: JOOMLA_TEMPLATE
  })
  live.refuse['template.files.write'] = { error: 'writer_busy', message: 'another write holds the lock' }
  try {
    const dir = templatePush([
      templateItem(css, Buffer.from('.a { red }\n'), Buffer.from('.a {}\n')),
      templateItem(moved, Buffer.from('.m { red }\n'), Buffer.from('.m {}\n'))
    ])
    const { answer } = await apply(live, dir, ['--webroot', webroot])
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${css}`]
    )
    assert.deepEqual(
      answer.failed.map((f) => [f.id, f.error]),
      [[`file:${moved}`, 'copy_changed']]
    )
    assert.equal(writes(live).length, 2, 'the busy answer, then the write')
    assert.equal(live.files[moved].toString(), '.m {}\n')
  } finally {
    await live.close()
  }
})

test('template files: Undo keeps a file the customer changed after the push, and names it', async () => {
  const a = 'templates/ja_vega/css/a.css'
  const b = 'media/templates/site/ja_vega/css/b.css'
  const webroot = copyOf('webroot-tpl-undo', { [a]: '.a { red }\n', [b]: '.b { red }\n' })
  const live = await engine({
    files: { [a]: Buffer.from('.a {}\n'), [b]: Buffer.from('.b {}\n') },
    templateFiles: JOOMLA_TEMPLATE
  })
  try {
    const dir = templatePush([
      templateItem(a, Buffer.from('.a { red }\n'), Buffer.from('.a {}\n')),
      templateItem(b, Buffer.from('.b { red }\n'), Buffer.from('.b {}\n'))
    ])
    assert.equal((await apply(live, dir, ['--webroot', webroot])).answer.state, 'applied')
    live.files[b] = Buffer.from('.b { the customer }\n')
    const back = (await undo(live, dir)).answer
    assert.equal(back.state, 'partial', JSON.stringify(back))
    assert.deepEqual(
      back.restored.map((r) => r.id),
      [`file:${a}`]
    )
    assert.deepEqual(
      back.kept.map((k) => [k.id, k.reason, k.fields]),
      [[`file:${b}`, 'changed-on-live', ['file']]]
    )
    assert.equal(live.files[a].toString(), '.a {}\n')
    assert.equal(live.files[b].toString(), '.b { the customer }\n')
  } finally {
    await live.close()
  }
})

test('template files: info reads the door, its switches and the roots the live site names', async () => {
  const on = await engine({ templateFiles: { ...JOOMLA_TEMPLATE, php: true } })
  const off = await engine({ templateFiles: { enabled: false, roots: [] } })
  const older = await engine()
  try {
    const said = (await writer(on, ['info'])).answer
    assert.deepEqual(said.templateFiles, {
      enabled: true,
      version: 1,
      php: true,
      maxFileBytes: 2097152,
      maxBytes: 8388608,
      maxFiles: 100,
      extensions: ['css', 'js', 'json', 'php'],
      roots: JOOMLA_TEMPLATE.roots
    })
    assert.ok(on.calls.some((c) => c.action === 'template.files.status'))
    // Switched off by the owner: said so, no roots asked for.
    assert.deepEqual((await writer(off, ['info'])).answer.templateFiles, { enabled: false })
    assert.ok(!off.calls.some((c) => c.action === 'template.files.status'))
    // An engine without the door (a release before it).
    assert.equal((await writer(older, ['info'])).answer.templateFiles, null)
  } finally {
    await on.close()
    await off.close()
    await older.close()
  }
})

// ── items written side by side (`sideBySide`) ───────────────────────────────────────────────
const wpPost = (id) => ({ ID: id, post_title: `Old ${id}`, post_status: 'publish' })
const postItem = (id, extra = {}) => ({
  ...update(id, { post_title: `New ${id}` }, { post_title: `Old ${id}` }),
  id: `post:${id}`,
  kind: 'post',
  spec: 'post',
  ...extra
})
/** Which records may not be written at the same time (live-write.mjs `laneOf`, for these kinds). */
const laneOfCall = (u) =>
  ['post', 'postmeta'].includes(u.kind)
    ? `post:${u.id}`
    : u.kind === 'menuItem'
      ? 'menu'
      : `${u.kind}:${u.id}`

test('WordPress: independent posts go to the live site side by side, at most four at once — the same answer as one at a time, sooner', async () => {
  const ids = [20, 21, 22, 23, 24, 25, 26, 27]
  const make = async () => {
    const live = await engine({
      platform: 'wordpress',
      records: { post: Object.fromEntries(ids.map((i) => [i, wpPost(i)])) }
    })
    // Keep network latency above durable receipt fsync overhead on the test disk.
    live.slow = 350
    return live
  }
  const one = await make()
  const four = await make()
  try {
    const t1 = Date.now()
    const dir1 = pushDir(
      ids.map((i) => postItem(i)),
      'wordpress'
    )
    const a1 = (await writer(one, ['apply', dir1, dir1], TOKEN, { TRACY_LIVE_WRITE_CONCURRENCY: '1' })).answer
    const s1 = Date.now() - t1
    const t4 = Date.now()
    const dir4 = pushDir(
      ids.map((i) => postItem(i)),
      'wordpress'
    )
    const a4 = (await apply(four, dir4)).answer
    const s4 = Date.now() - t4
    assert.equal(a4.state, 'applied', JSON.stringify(a4))
    assert.deepEqual(
      a4.written.map((w) => w.id),
      a1.written.map((w) => w.id),
      'the answer lists the items in the changeset’s order, as one at a time does'
    )
    assert.equal(one.maxInflight, 1)
    assert.ok(four.maxInflight > 1 && four.maxInflight <= 4, `in flight at most: ${four.maxInflight}`)
    for (const i of ids) assert.equal(four.records.post[i].post_title, `New ${i}`)
    assert.ok(s4 < s1 * 0.6, `side by side ${s4} ms, one at a time ${s1} ms`)
    // What each item held before is kept for Undo, every one of them.
    const before = JSON.parse(readFileSync(join(dir4, 'before.json'), 'utf8'))
    assert.deepEqual(Object.keys(before.items).sort(), ids.map((i) => `post:${i}`).sort())
  } finally {
    await one.close()
    await four.close()
  }
})

test('side by side, never two writes of one lane at once — a post and its meta, the menu — and a dependant only after its dependency ended', async () => {
  const live = await engine({
    platform: 'wordpress',
    records: {
      post: { 30: wpPost(30), 31: wpPost(31) },
      postmeta: { '30:_x': { value: 'a' } },
      menuItem: { 40: { id: '40', title: 'A' }, 41: { id: '41', title: 'B' }, 42: { id: '42', title: 'C' } }
    }
  })
  live.slow = 120
  try {
    const menu = (id, title) => ({
      ...update(id, { title }, { title: { 40: 'A', 41: 'B', 42: 'C' }[id] }),
      id: `menuItem:${id}`,
      kind: 'menuItem',
      spec: 'menuItem'
    })
    const items = [
      postItem(30),
      {
        ...update(30, { value: 'b' }, { value: 'a' }),
        id: 'postmeta:30:_x',
        kind: 'postmeta',
        spec: 'postmeta',
        key: '_x'
      },
      menu(40, 'A2'),
      menu(41, 'B2'),
      menu(42, 'C2'),
      {
        id: 'post:new:50',
        kind: 'post',
        spec: 'post',
        op: 'create',
        title: 'Made',
        liveId: null,
        key: null,
        ident: 0,
        creates: 'posts:50',
        write: { post_title: 'Made' },
        expect: {},
        dependsOn: [],
        seed: []
      },
      postItem(31, { dependsOn: ['post:new:50'] })
    ]
    const { answer } = await apply(live, pushDir(items, 'wordpress'))
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    assert.ok(live.maxInflight > 1, 'some went side by side')
    for (const [i, open] of live.overlaps.entries()) {
      const lane = laneOfCall(live.updates[i])
      assert.ok(!open.some((o) => laneOfCall(o) === lane), `${lane} written twice at once`)
    }
    const made = live.updates.find((u) => u.kind === 'post' && u.id === 0)
    const after = live.updates.find((u) => u.kind === 'post' && u.id === 31)
    assert.ok(after.start >= made.end, 'the dependant started after its dependency ended')
    assert.deepEqual(
      live.updates.filter((u) => u.kind === 'menuItem').map((u) => u.id),
      [40, 41, 42],
      'one lane keeps the changeset’s order'
    )
  } finally {
    await live.close()
  }
})

test('a live site that answers busy even once is written one item at a time from then on', async () => {
  const ids = [60, 61, 62, 63, 64, 65, 66, 67]
  const live = await engine({
    platform: 'wordpress',
    records: { post: Object.fromEntries(ids.map((i) => [i, wpPost(i)])) }
  })
  live.slow = 100
  live.refuse['content.get'] = 503
  try {
    const { answer } = await apply(
      live,
      pushDir(
        ids.map((i) => postItem(i)),
        'wordpress'
      )
    )
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    const firstEnd = Math.min(...live.updates.map((u) => u.end))
    for (const [i, u] of live.updates.entries())
      if (u.start > firstEnd)
        assert.ok(live.overlaps[i].length <= 1, `after the strain, ${live.overlaps[i].length + 1} in flight`)
  } finally {
    await live.close()
  }
})

test('lost create response is uncertain and Apply never creates it again or starts its dependents', async () => {
  const live = await engine({ platform: 'wordpress' })
  try {
    live.dropAfterUpdate = true
    const made = update(1, { post_title: 'Once' }, {}, { kind: 'post', op: 'create', creates: 'post:1' })
    const dir = pushDir(
      [
        made,
        update(
          2,
          { post_title: 'Dependent' },
          {},
          {
            kind: 'post',
            op: 'create',
            dependsOn: [made.id]
          }
        )
      ],
      'wordpress'
    )
    for (let n = 0; n < 2; n++) {
      const { answer } = await apply(live, dir)
      assert.equal(answer.failed[0].error, 'WRITE_OUTCOME_UNKNOWN')
      assert.equal(answer.skipped[0].reason, 'depends-on-failed')
    }
    assert.equal(Object.keys(live.records.post).length, 1)
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 1)
  } finally {
    await live.close()
  }
})

test('a failed read-back preserves the create ACK and Undo evidence without another create', async () => {
  const live = await engine({ platform: 'wordpress' })
  try {
    live.failReadback = true
    const dir = pushDir(
      [
        update(
          1,
          { post_title: 'Once', post_status: 'publish' },
          {},
          {
            kind: 'post',
            op: 'create',
            creates: 'post:1'
          }
        )
      ],
      'wordpress'
    )
    assert.equal((await apply(live, dir)).answer.written.length, 1)
    assert.equal((await apply(live, dir)).answer.written.length, 1)
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 1)
    delete live.refuse['content.get']
    live.failReadback = false
    assert.equal((await undo(live, dir)).answer.restored.length, 1)
  } finally {
    await live.close()
  }
})

test('an ACK recovers its original preimage after a cut before the item journal', async () => {
  const live = await engine({
    platform: 'wordpress',
    records: { post: { 1: { id: '1', post_title: 'Before' } } }
  })
  try {
    const dir = pushDir(
      [update(1, { post_title: 'After' }, { post_title: 'Before' }, { kind: 'post' })],
      'wordpress'
    )
    assert.equal((await apply(live, dir)).answer.written.length, 1)
    for (const name of ['journal.jsonl', 'before.json', 'written.json']) rmSync(join(dir, name))
    assert.equal((await apply(live, dir)).answer.written.length, 1)
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 1)
    assert.equal((await undo(live, dir)).answer.restored.length, 1)
    assert.equal(live.records.post[1].post_title, 'Before')
  } finally {
    await live.close()
  }
})

test('two Apply processes cannot mutate the same push concurrently', async () => {
  const live = await engine({ platform: 'wordpress' })
  try {
    live.slow = 400
    const dir = pushDir([update(1, { post_title: 'Once' }, {}, { kind: 'post', op: 'create' })], 'wordpress')
    const answers = await Promise.all([apply(live, dir), apply(live, dir)])
    assert.equal(answers.filter((r) => r.answer.code === 'PUSH_BUSY').length, 1)
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 1)
  } finally {
    await live.close()
  }
})

test('two distinct creates with identical fields retain distinct live IDs', async () => {
  const live = await engine({ platform: 'wordpress' })
  try {
    const dir = pushDir(
      [1, 2].map((id) =>
        update(
          id,
          { post_title: 'Same' },
          {},
          {
            kind: 'post',
            op: 'create',
            creates: `post:${id}`
          }
        )
      ),
      'wordpress'
    )
    const { answer } = await apply(live, dir)
    assert.equal(answer.written.length, 2)
    assert.notEqual(answer.created['post:1'], answer.created['post:2'])
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 2)
  } finally {
    await live.close()
  }
})

test('a batch with incomplete rollback is never sent again after Apply restarts', async () => {
  const live = await engine({ records: { article: { 1: article(1) } } })
  try {
    live.refuse['content.batch'] = {
      error: 'batch_failed',
      message: 'some writes stay on the site; could not be taken back'
    }
    const dir = pushDir([update(1, { title: 'After' }, { title: 'Article 1' })])
    await apply(live, dir)
    const { answer } = await apply(live, dir)
    assert.equal(answer.failed[0].error, 'WRITE_OUTCOME_UNKNOWN')
    assert.equal(live.calls.filter((c) => c.action === 'content.batch').length, 1)
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 0)
  } finally {
    await live.close()
  }
})

test('a worker killed after create cannot resend that create when Apply restarts', async () => {
  const live = await engine({ platform: 'wordpress' })
  let child
  try {
    live.holdAnswer = 'content.update'
    const dir = pushDir([update(1, { post_title: 'Once' }, {}, { kind: 'post', op: 'create' })], 'wordpress')
    child = spawn('node', [WRITE, 'apply', dir, dir], {
      env: { ...process.env, TRACY_SYNC_ENDPOINT: live.endpoint, TRACY_SYNC_TOKEN: TOKEN },
      stdio: 'ignore'
    })
    for (let i = 0; i < 500 && !live.held; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(live.held, true)
    const closed = new Promise((resolve) => child.once('close', resolve))
    child.kill('SIGKILL')
    await closed
    live.heldResponse.destroy()
    live.holdAnswer = null
    const { answer } = await apply(live, dir)
    assert.equal(answer.failed[0].error, 'WRITE_OUTCOME_UNKNOWN')
    assert.equal(Object.keys(live.records.post).length, 1)
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 1)
  } finally {
    child?.kill('SIGKILL')
    live.heldResponse?.destroy()
    await live.close()
  }
})

test('a replacement waits for the confirmed delete, and Undo restores the exact original slug', async () => {
  for (const mode of ['confirmed', 'unconfirmed', 'conflict', 'edited-replacement', 'create-failed']) {
    const original = {
      id: '10',
      post_title: 'Old about',
      post_name: 'about',
      post_status: 'publish',
      post_type: 'page'
    }
    const live = await engine({ platform: 'wordpress', records: { post: { 10: { ...original } } } })
    const removed = update(10, {}, original, {
      id: 'post:10',
      kind: 'post',
      spec: 'post',
      op: 'delete',
      trash: ['post_status', 'trash']
    })
    const created = update(
      20,
      { post_title: 'New about', post_name: 'about', post_status: 'publish', post_type: 'page' },
      {},
      {
        id: 'post:new:20',
        kind: 'post',
        spec: 'post',
        op: 'create',
        liveId: null,
        creates: 'posts:20',
        dependsOn: [removed.id],
        replaces: [removed.id]
      }
    )
    const dir = pushDir([removed, created], 'wordpress')
    try {
      if (mode === 'conflict') live.records.post[10].post_title = 'Customer title'
      if (mode === 'create-failed') live.refuse['content.update'] = { error: 'invalid_params' }
      const { answer } = await apply(live, dir, mode === 'unconfirmed' ? [] : ['--confirm-deletes'])
      if (mode === 'unconfirmed' || mode === 'conflict') {
        assert.equal(answer.written.length, 0, JSON.stringify(answer))
        assert.equal(
          live.calls.filter((c) => ['content.update', 'content.delete'].includes(c.action)).length,
          0
        )
        continue
      }
      if (mode === 'create-failed') {
        assert.equal(answer.written.length, 1, JSON.stringify(answer))
        const back = (await undo(live, dir)).answer
        assert.equal(back.restored.length, 1, JSON.stringify(back))
        assert.equal(live.records.post[10].post_name, 'about')
        continue
      }
      assert.equal(answer.written.length, 2, JSON.stringify(answer))
      assert.deepEqual(
        live.calls
          .filter((c) => ['content.update', 'content.delete'].includes(c.action))
          .map((c) => c.action),
        ['content.delete', 'content.update']
      )
      const newId = answer.created['posts:20']
      // WordPress appends __trashed when trashing a post; Undo must restore its original address.
      live.records.post[10].post_name = 'about__trashed'
      if (mode === 'edited-replacement') live.records.post[newId].post_title = 'Customer replacement'
      if (mode === 'edited-original-slug') live.records.post[10].post_name = 'customer-parked'
      const back = (await undo(live, dir)).answer
      if (mode === 'edited-original-slug') {
        assert.equal(live.records.post[10].post_name, 'customer-parked')
        assert.equal(live.records.post[10].post_status, 'trash')
        assert.ok(back.kept.some((i) => i.id === removed.id && i.fields.includes('post_name')))
      } else if (mode === 'edited-replacement') {
        assert.equal(live.records.post[10].post_status, 'trash')
        assert.ok(
          back.kept.some((i) => i.id === removed.id && i.reason === 'depends-on-failed'),
          JSON.stringify(back)
        )
      } else {
        assert.equal(back.restored.length, 2, JSON.stringify(back))
        assert.equal(live.records.post[10].post_status, 'publish')
        assert.equal(live.records.post[10].post_name, 'about')
        assert.equal(live.records.post[newId].post_status, 'trash')
      }
    } finally {
      await live.close()
    }
  }
})

test('a Joomla alias replacement held in preview never trashes the original or writes its dependents', async () => {
  const live = await engine({ records: { article: { 1: article(1, { alias: 'about' }) } } })
  try {
    const conflict = { reason: 'changed-on-live', fields: ['alias'] }
    const removed = update(1, {}, {}, { op: 'delete', trash: ['state', -2], conflict })
    const created = update(
      2,
      { alias: 'about' },
      {},
      { op: 'create', creates: 'content:2', dependsOn: [removed.id], conflict }
    )
    const dependent = update(3, { introtext: 'new' }, {}, { op: 'create', dependsOn: [created.id] })
    const { answer } = await apply(live, pushDir([removed, created, dependent]), ['--confirm-deletes'])
    assert.equal(answer.written.length, 0)
    assert.equal(live.records.article[1].state, '1')
    assert.equal(
      live.calls.filter((c) => ['content.batch', 'content.update', 'content.delete'].includes(c.action))
        .length,
      0
    )
  } finally {
    await live.close()
  }
})

test('a stopped parallel Apply drains acknowledged siblings and preserves a complete undoable partial result', async () => {
  const live = await engine({
    platform: 'wordpress',
    records: {
      post: {
        1: wpPost(1),
        2: wpPost(2),
        3: wpPost(3),
        4: wpPost(4),
        5: wpPost(5)
      }
    }
  })
  try {
    live.slow = 150
    live.failGetId = 2
    const dir = pushDir(
      [1, 2, 3, 4, 5].map((id) => postItem(id)),
      'wordpress'
    )
    const { answer } = await apply(live, dir)
    assert.equal(answer.ok, false)
    assert.equal(answer.state, 'partial')
    assert.deepEqual(
      answer.written.map((w) => w.id),
      ['post:1', 'post:3', 'post:4']
    )
    assert.equal(answer.written.length + answer.skipped.length + answer.failed.length, 5)
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'written.json'), 'utf8')), answer)
    assert.equal(live.records.post[5].post_title, 'Old 5', 'no pending writes start after failure')
    live.failGetId = null
    const back = await undo(live, dir)
    assert.equal(back.answer.restored.length, 3)
    for (const id of [1, 3, 4]) assert.equal(live.records.post[id].post_title, `Old ${id}`)
  } finally {
    await live.close()
  }
})

test('a blocked batch retains earlier writes in the failed Apply answer and Undo', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2) } } })
  try {
    live.refuse['content.batch'] = 403
    const dir = pushDir([
      update(9, { title: 'Made', state: 1 }, {}, { op: 'create', creates: 'article:9' }),
      update(1, { title: 'After' }, { title: 'Article 1' }),
      update(2, { title: 'After 2' }, { title: 'Article 2' })
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.ok, false)
    assert.equal(answer.state, 'partial')
    assert.equal(answer.written.length, 1)
    assert.equal(answer.failed.length, 2)
    assert.equal((await undo(live, dir)).answer.restored.length, 1)
  } finally {
    await live.close()
  }
})

const createPostMeta = (postId, key, value, dependsOn = []) => ({
  id: `postmeta:new:${typeof postId === 'object' ? 'new-post' : postId}:${key}`,
  kind: 'postmeta',
  spec: 'postmeta',
  op: 'create',
  title: key,
  liveId: null,
  ident: postId,
  key,
  creates: null,
  write: { value },
  expect: { $absent: true },
  dependsOn,
  seed: []
})

test('WordPress missing featured-image and page-template meta retain the existing parent post address', async () => {
  const live = await engine({ platform: 'wordpress', records: { post: { 30: wpPost(30) } } })
  try {
    const dir = pushDir(
      [createPostMeta(30, '_thumbnail_id', '200'), createPostMeta(30, '_wp_page_template', 'landing.php')],
      'wordpress'
    )
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    assert.equal(live.records.postmeta['30:_thumbnail_id'].value, '200')
    assert.equal(live.records.postmeta['30:_wp_page_template'].value, 'landing.php')
    assert.equal(live.records.postmeta['0:_thumbnail_id'], undefined)
    assert.equal(live.records.post[30].post_title, wpPost(30).post_title)
  } finally {
    await live.close()
  }
})

test('WordPress new-post meta uses the resolved live parent ID and does not create another post', async () => {
  const live = await engine({ platform: 'wordpress', records: { post: {} } })
  try {
    const parent = {
      id: 'post:new:50',
      kind: 'post',
      spec: 'post',
      op: 'create',
      title: 'New page',
      liveId: null,
      ident: 0,
      key: null,
      creates: 'posts:50',
      write: { post_title: 'New page', post_content: 'Body', post_type: 'page', post_status: 'publish' },
      expect: {},
      dependsOn: [],
      seed: []
    }
    const dir = pushDir(
      [
        parent,
        createPostMeta({ $new: 'posts:50' }, '_thumbnail_id', '200', [parent.id]),
        createPostMeta({ $new: 'posts:50' }, '_wp_page_template', 'landing.php', [parent.id])
      ],
      'wordpress'
    )
    const { answer } = await apply(live, dir)
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    const liveId = answer.created['posts:50']
    assert.ok(liveId > 0)
    assert.equal(Object.keys(live.records.post).length, 1)
    assert.equal(live.records.postmeta[`${liveId}:_thumbnail_id`].value, '200')
    assert.equal(live.records.postmeta[`${liveId}:_wp_page_template`].value, 'landing.php')
    assert.equal((await undo(live, dir)).answer.restored.length, 3)
    assert.equal(live.records.postmeta[`${liveId}:_thumbnail_id`], undefined)
    assert.equal(live.records.postmeta[`${liveId}:_wp_page_template`], undefined)
    assert.equal(live.records.post[liveId].post_status, 'trash')
  } finally {
    await live.close()
  }
})

test('WordPress meta a customer created after preview is kept without a write', async () => {
  const live = await engine({
    platform: 'wordpress',
    records: {
      post: { 30: wpPost(30) },
      postmeta: { '30:_thumbnail_id': { value: '300' } }
    }
  })
  try {
    const { answer } = await apply(live, pushDir([createPostMeta(30, '_thumbnail_id', '200')], 'wordpress'))
    assert.equal(answer.written.length, 0)
    assert.equal(live.records.postmeta['30:_thumbnail_id'].value, '300')
    assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 0)
  } finally {
    await live.close()
  }
})

for (const scenario of [
  'normal',
  'changed',
  'native-conflict',
  'empty-receipt',
  'lost-response',
  'legacy',
  'restart'
]) {
  test(`WordPress new metadata Undo: ${scenario}`, async () => {
    const live = await engine({ platform: 'wordpress', records: { post: { 30: wpPost(30) } } })
    try {
      const meta = createPostMeta(30, '_thumbnail_id', '200')
      const dir = pushDir(
        [
          meta,
          update(30, { post_title: 'Updated title' }, { post_title: wpPost(30).post_title }, { kind: 'post' })
        ],
        'wordpress'
      )
      assert.equal((await apply(live, dir)).answer.written.length, 2)
      const snapshot = JSON.parse(readFileSync(join(dir, 'before.json')))
      const nativeId = snapshot.items[meta.id].nativeApplyId
      assert.ok(nativeId.includes('-meta-'))
      const metaCall = live.calls.find((c) => c.action === 'content.update' && c.params.kind === 'postmeta')
      const postCall = live.calls.find((c) => c.action === 'content.update' && c.params.kind === 'post')
      assert.equal(metaCall.params.apply_id, nativeId)
      assert.notEqual(nativeId, postCall.params.apply_id)
      if (scenario === 'changed') live.records.postmeta['30:_thumbnail_id'].value = '300'
      if (scenario === 'native-conflict') live.refuse['apply.revert'] = { error: 'conflict' }
      if (scenario === 'empty-receipt') live.emptyMetaReceipt = true
      if (scenario === 'lost-response') live.dropAfterRevert = true
      if (scenario === 'legacy') {
        delete snapshot.items[meta.id].nativeApplyId
        writeFileSync(join(dir, 'before.json'), JSON.stringify(snapshot))
      }
      if (scenario === 'restart') {
        for (const name of ['journal.jsonl', 'before.json', 'written.json']) rmSync(join(dir, name))
        assert.equal((await apply(live, dir)).answer.written.length, 2)
        assert.equal(
          JSON.parse(readFileSync(join(dir, 'before.json'))).items[meta.id].nativeApplyId,
          nativeId
        )
        assert.equal(live.calls.filter((c) => c.action === 'content.update').length, 2)
      }
      const result = (await undo(live, dir)).answer
      assert.equal(live.records.post[30].post_title, wpPost(30).post_title)
      if (['normal', 'lost-response', 'restart'].includes(scenario)) {
        assert.equal(live.records.postmeta['30:_thumbnail_id'], undefined)
        assert.ok(
          result.restored.some((r) => r.id === meta.id),
          JSON.stringify(result)
        )
        await undo(live, dir)
        assert.equal(live.calls.filter((c) => c.action === 'apply.revert').length, 1)
      } else if (scenario === 'empty-receipt') {
        assert.equal(result.failed.find((r) => r.id === meta.id)?.error, 'WRITE_OUTCOME_UNKNOWN')
        await undo(live, dir)
        assert.equal(live.calls.filter((c) => c.action === 'apply.revert').length, 1)
      } else {
        assert.equal(
          result.kept.find((r) => r.id === meta.id)?.reason,
          scenario === 'legacy' ? 'cannot-remove' : 'changed-on-live'
        )
        assert.equal(
          live.calls.filter((c) => c.action === 'apply.revert').length,
          scenario === 'native-conflict' ? 1 : 0
        )
      }
      assert.ok(
        live.calls.filter((c) => c.action === 'apply.revert').every((c) => c.params.apply_id === nativeId)
      )
    } finally {
      await live.close()
    }
  })
}

for (const scenario of ['changed', 'empty-receipt', 'native-conflict']) {
  test(`WordPress new parent stays published when its metadata Undo is held: ${scenario}`, async () => {
    const live = await engine({ platform: 'wordpress', records: { post: {} } })
    try {
      const parent = {
        id: 'post:new:50',
        kind: 'post',
        spec: 'post',
        op: 'create',
        ident: 0,
        creates: 'posts:50',
        key: null,
        write: { post_title: 'New page', post_status: 'publish' },
        expect: {},
        dependsOn: [],
        seed: []
      }
      const child = createPostMeta({ $new: 'posts:50' }, '_thumbnail_id', '200', [parent.id])
      const dir = pushDir([parent, child], 'wordpress')
      const applied = (await apply(live, dir)).answer
      assert.equal(applied.written.length, 2)
      const id = applied.created['posts:50']
      if (scenario === 'changed') live.records.postmeta[`${id}:_thumbnail_id`].value = '300'
      if (scenario === 'empty-receipt') live.emptyMetaReceipt = true
      if (scenario === 'native-conflict') live.refuse['apply.revert'] = { error: 'conflict' }
      const result = (await undo(live, dir)).answer
      assert.equal(result.kept.find((r) => r.id === parent.id)?.reason, 'depends-on-failed')
      assert.equal(live.records.post[id].post_status, 'publish')
      assert.equal(live.records.postmeta[`${id}:_thumbnail_id`].value, scenario === 'changed' ? '300' : '200')
      assert.equal(live.calls.filter((c) => c.action === 'content.delete').length, 0)
    } finally {
      await live.close()
    }
  })
}

test('WordPress new parent stays published after its metadata create loses the ACK', async () => {
  const live = await engine({ platform: 'wordpress', records: { post: {} } })
  try {
    const parent = {
      id: 'post:new:50',
      kind: 'post',
      spec: 'post',
      op: 'create',
      ident: 0,
      creates: 'posts:50',
      key: null,
      write: { post_title: 'New page', post_status: 'publish' },
      expect: {},
      dependsOn: [],
      seed: []
    }
    const child = createPostMeta({ $new: 'posts:50' }, '_thumbnail_id', '200', [parent.id])
    const dir = pushDir([parent, child], 'wordpress')
    live.dropUpdateKind = 'postmeta'
    const applied = (await apply(live, dir)).answer
    assert.equal(applied.written.length, 1)
    assert.equal(applied.failed.find((r) => r.id === child.id)?.error, 'WRITE_OUTCOME_UNKNOWN')
    const id = applied.created['posts:50']
    const result = (await undo(live, dir)).answer
    assert.equal(result.kept.find((r) => r.id === parent.id)?.reason, 'depends-on-failed')
    assert.equal(live.records.post[id].post_status, 'publish')
    assert.equal(live.records.postmeta[`${id}:_thumbnail_id`].value, '200')
    assert.equal(live.calls.filter((c) => c.action === 'content.delete').length, 0)
    await apply(live, dir)
    assert.equal(
      live.calls.filter((c) => c.action === 'content.update' && c.params.kind === 'postmeta').length,
      1
    )
  } finally {
    await live.close()
  }
})

test('WordPress new parent stays published when its metadata ACK is ahead of stale Apply output', async () => {
  const live = await engine({ platform: 'wordpress', records: { post: {} } })
  try {
    const parent = {
      id: 'post:new:50',
      kind: 'post',
      spec: 'post',
      op: 'create',
      ident: 0,
      creates: 'posts:50',
      key: null,
      write: { post_title: 'New page', post_status: 'publish' },
      expect: {},
      dependsOn: [],
      seed: []
    }
    const child = createPostMeta({ $new: 'posts:50' }, '_thumbnail_id', '200', [parent.id])
    const dir = pushDir([parent, child], 'wordpress')
    const applied = (await apply(live, dir)).answer
    assert.equal(applied.written.length, 2)
    const id = applied.created['posts:50']
    // Model the durable cut after ACK: the earlier partial output only names the parent.
    const written = JSON.parse(readFileSync(join(dir, 'written.json')))
    written.written = written.written.filter((r) => r.id !== child.id)
    writeFileSync(join(dir, 'written.json'), JSON.stringify(written))
    const before = JSON.parse(readFileSync(join(dir, 'before.json')))
    delete before.items[child.id]
    writeFileSync(join(dir, 'before.json'), JSON.stringify(before))
    const result = (await undo(live, dir)).answer
    assert.equal(result.kept.find((r) => r.id === parent.id)?.reason, 'depends-on-failed')
    assert.equal(live.records.post[id].post_status, 'publish')
    assert.equal(live.records.postmeta[`${id}:_thumbnail_id`].value, '200')
    assert.equal(live.calls.filter((c) => c.action === 'content.delete').length, 0)
  } finally {
    await live.close()
  }
})

test('Undo after an Apply lost before it answered takes back what its journal lists (#122)', async () => {
  const live = await engine({ records: { article: { 1: article(1), 2: article(2) } } })
  try {
    const dir = pushDir([
      update(1, { title: 'One by Tracy' }, { title: 'Article 1' }),
      update(2, { title: 'Two by Tracy' }, { title: 'Article 2' })
    ])
    const { answer } = await apply(live, dir)
    assert.equal(answer.written.length, 2)
    // The job was lost after its writes and before its answer: no written.json, the journal stays.
    rmSync(join(dir, 'written.json'))
    const result = await undo(live, dir)
    assert.equal(result.answer.ok, true, JSON.stringify(result.answer))
    assert.deepEqual(result.answer.restored.map((r) => r.id).sort(), answer.written.map((w) => w.id).sort())
    assert.ok(
      result.answer.restored.every((r) => r.title),
      'named as the Apply named them'
    )
    // Without a journal either, nothing was pushed.
    for (const name of ['journal.jsonl', 'undone.json', 'undo-requests.json'])
      rmSync(join(dir, name), { force: true })
    const none = await undo(live, dir)
    assert.equal(none.answer.ok, false)
    assert.equal(none.answer.code, 'NOT_PUSHED')
  } finally {
    await live.close()
  }
})
