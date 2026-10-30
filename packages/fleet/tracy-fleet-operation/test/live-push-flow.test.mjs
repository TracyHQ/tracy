/**
 * "Sync to live", end to end on a throwaway Joomla stack (`webroot/webroot-live-push.sh`, plan
 * tasks/ke-hoach-sync-to-live.md §5): the agent edits the copy and makes an article while the customer
 * makes one of their own on the live site; a preview syncs from live first and offers the copy's
 * changes; apply writes them on the live site through a stand-in for its Claude Cowork engine, a
 * change the customer made after the preview stays theirs, the sync after the push brings no copy
 * of Tracy's own article back, a second preview has nothing left to offer, and Undo takes the push
 * back where the live site still holds it.
 *
 * Needs a real MariaDB (the copy, its scratch schemas and the live site's database): `mariadb:11` in a
 * container of its own, removed at the end; SKIPPED where no docker daemon answers. The live site is a
 * database (`livesrc`) and a folder: its "read" is a stand-in `live-pull.mjs` that tars the folder and
 * dumps the database, and its engine an HTTP server in this test answering the content actions from
 * that database.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-push-flow.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const PUSH = join(scripts, 'webroot', 'webroot-live-push.sh')
const SYNC = join(scripts, 'webroot', 'webroot-sync.sh')
const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const BACKUP = join(scripts, 'webroot', 'webroot-backup.sh')
const LABEL = 'shop-com'
const TOKEN = 'live-token-of-the-test'

const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-live-push-flow-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the push needs a real MariaDB' }

const shimDir = mkdtempSync(join(tmpdir(), 'live-push-docker-'))
writeFileSync(
  join(shimDir, 'docker'),
  `#!/usr/bin/env bash
if [ "$1" = compose ]; then
  shift
  case "$1" in
    exec)
      shift; envs=()
      while [ "$1" = -T ] || [ "$1" = -e ]; do
        if [ "$1" = -e ]; then envs+=(-e "$2"); shift 2; else shift; fi
      done
      service="$1"; shift
      if [ "$service" = web ]; then
        cat > /dev/null
        echo "TRACY_RESULT rebuild=none cache=cleared"
        echo "TRACY_RESULT content_reader=none"
        exit 0
      fi
      exec "$REAL_DOCKER" exec -i "\${envs[@]}" "$TEST_DB_CONTAINER" "$@" ;;
    *) exit 0 ;;
  esac
fi
exit 0
`
)
chmodSync(join(shimDir, 'docker'), 0o755)
after(() => rmSync(shimDir, { recursive: true, force: true }))

const sql = (query, db = '') =>
  execFileSync(
    REAL_DOCKER,
    ['exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-N', '-B', ...(db ? [db] : [])],
    { input: query, encoding: 'utf8' }
  ).trim()
const rows = (query, db = 'joomla') =>
  sql(query, db)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))

before(async () => {
  if (!DOCKER_UP) return
  spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
  execFileSync(
    REAL_DOCKER,
    ['run', '-d', '--name', DB_CONTAINER, '-e', 'MARIADB_ROOT_PASSWORD=t', 'mariadb:11'],
    {
      stdio: 'ignore'
    }
  )
  for (let i = 0; i < 240; i++) {
    const ok = spawnSync(
      REAL_DOCKER,
      ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-h127.0.0.1', '-e', 'SELECT 1'],
      { stdio: 'ignore' }
    )
    if (ok.status === 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('test MariaDB never answered')
})
after(() => {
  if (DOCKER_UP) spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
})

// ── a Joomla site ────────────────────────────────────────────────────────────────────────────
const config = (settings) =>
  `<?php\nclass JConfig {\n${Object.entries(settings)
    .map(([k, v]) => `\tpublic $${k} = ${v};`)
    .join('\n')}\n}\n`
const LIVE_CONFIG = {
  host: "'localhost'",
  user: "'shop'",
  password: "'live-password'",
  db: "'shop_live'",
  dbprefix: "'jos_'",
  live_site: "''",
  secret: "'live-secret'",
  sitename: "'Shop'"
}
const COPY_CONFIG = {
  ...LIVE_CONFIG,
  host: "'db'",
  user: "'root'",
  password: "'copy-password'",
  db: "'joomla'",
  live_site: "'https://shop-com.tracy.ai'",
  secret: "'fresh'"
}
const SITE_FILES = {
  'index.php': '<?php // Joomla\n',
  '.htaccess': 'RewriteEngine On\n',
  'templates/t4/css/custom.css': '.a {}\n',
  // A Joomla 4/5 template's own stylesheet: under media/, which `media.upload` writes.
  'media/templates/site/cassiopeia/css/user.css': '.b {}\n'
}
// `#__content` as Joomla has it, the columns the writer and the merge care about.
const TABLES = `
CREATE TABLE jos_content (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL DEFAULT 0, title VARCHAR(255) NOT NULL,
  alias VARCHAR(400) NOT NULL DEFAULT '', introtext MEDIUMTEXT, \`fulltext\` MEDIUMTEXT, state TINYINT NOT NULL DEFAULT 1,
  catid INT NOT NULL DEFAULT 2, created DATETIME NULL, modified DATETIME NULL, hits INT NOT NULL DEFAULT 0,
  checked_out INT UNSIGNED NULL, checked_out_time DATETIME NULL, created_by_alias VARCHAR(255) NOT NULL DEFAULT '');
CREATE TABLE jos_extensions (extension_id INT PRIMARY KEY, type VARCHAR(20), folder VARCHAR(20), element VARCHAR(100), params TEXT);
INSERT INTO jos_content (id, title, alias, introtext, \`fulltext\`, created, modified) VALUES
  (1, 'Hello', 'hello', 'first', '', '2026-01-01', '2026-01-01'), (2, 'About', 'about', 'second', '', '2026-01-01', '2026-01-01');
INSERT INTO jos_extensions VALUES (10, 'plugin', 'system', 'sef', '{"domain":"https://shop.com"}'),
  (20, 'component', '', 'com_claudecowork', '{"token":"live-token"}');
`

function write(root, files) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
}

/**
 * The engine stand-in on the live database: what the Joomla engine answers for `article`. With
 * `templateFiles` (roots), the template door too (`template.files.*` on the live folder, as
 * claude-cowork lib/TemplateFiles.php answers it: compare-and-set by blob, all or nothing, undo).
 */
function liveEngine(liveDir, { templateFiles = null } = {}) {
  const columns = rows(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='livesrc' AND table_name='jos_content' ORDER BY ordinal_position",
    ''
  ).map((r) => r[0])
  const WRITABLE = ['title', 'alias', 'introtext', 'fulltext', 'state', 'catid']
  const lit = (v) =>
    v === null || v === undefined ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
  const read = (id) => {
    const got = sql(
      `SELECT JSON_OBJECT(${columns.map((c) => `'${c}', \`${c}\``).join(', ')}) FROM jos_content WHERE id = ${Number(id)}`,
      'livesrc'
    )
    if (!got) return null
    // As Joomla's database driver hands a row over: every value text.
    const row = JSON.parse(got)
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? null : String(v)]))
  }
  const update = (id, fields) => {
    const sets = Object.entries(fields)
      .filter(([k]) => WRITABLE.includes(k))
      .map(([k, v]) => `\`${k}\` = ${lit(v)}`)
    if (Number(id) > 0) {
      // Table::store() stamps `modified` on every save.
      sql(
        `UPDATE jos_content SET ${[...sets, 'modified = NOW()'].join(', ')} WHERE id = ${Number(id)}`,
        'livesrc'
      )
      return Number(id)
    }
    const cols = Object.keys(fields).filter((k) => WRITABLE.includes(k))
    return Number(
      sql(
        `INSERT INTO jos_content (${cols.map((c) => `\`${c}\``).join(', ')}, created, modified)` +
          ` VALUES (${cols.map((c) => lit(fields[c])).join(', ')}, NOW(), NOW()); SELECT LAST_INSERT_ID();`,
        'livesrc'
      )
    )
  }
  const state = { calls: [] }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { token, action, params = {} } = JSON.parse(body)
      state.calls.push(action)
      // claude-cowork 0.24.73 on a PHP below its minimum: HTTP 200 and this answer.
      if (state.phpTooOldBatch && action === 'content.batch') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: false,
            error: 'php_too_old',
            code: 'php_too_old',
            php: '7.3.33',
            min: '7.4.0'
          })
        )
        return
      }
      if (state.blockBatch && action === 'content.batch') {
        res.writeHead(403, { 'content-type': 'text/html' })
        res.end('blocked')
        return
      }
      const answer = (value) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(value))
      }
      if (token !== TOKEN) return answer({ ok: false, error: 'unauthorized' })
      if (action === 'core.manifest') return answer({ ok: true, extensions: [] })
      if (action === 'info')
        return answer({
          ok: true,
          info: {
            component: '0.24.54',
            php: '8.2.20',
            ...(templateFiles
              ? {
                  template_files: {
                    version: 1,
                    enabled: true,
                    php: false,
                    max_file_bytes: 2097152,
                    max_bytes: 8388608,
                    max_files: 100
                  }
                }
              : {})
          }
        })
      if (templateFiles && action.startsWith('template.files.'))
        return answer(templateDoor(liveDir, templateFiles, action, params))
      // The live site's files (its folder) and Global Configuration (its configuration.php), as the
      // engine's file.read, media.upload and site.identity answer them.
      const file = (path) => join(liveDir, ...String(path).split('/'))
      if (action === 'file.read') {
        if (!existsSync(file(params.path)))
          return answer({ ok: false, error: 'read_failed', message: 'not a file' })
        const bytes = readFileSync(file(params.path))
        return answer({
          ok: true,
          path: params.path,
          size: bytes.length,
          content_b64: bytes.toString('base64')
        })
      }
      if (action === 'media.upload') {
        if (!/^(images|media)\//.test(params.path)) return answer({ ok: false, error: 'bad_params' })
        mkdirSync(dirname(file(params.path)), { recursive: true })
        writeFileSync(file(params.path), Buffer.from(params.content_b64, 'base64'))
        return answer({ ok: true, path: params.path })
      }
      if (action === 'site.identity') {
        const path = file('configuration.php')
        let text = readFileSync(path, 'utf8')
        const read = () =>
          Object.fromEntries(
            ['sitename', 'MetaDesc'].map((k) => [
              k,
              (new RegExp(`\\$${k} = '([^']*)'`).exec(text) ?? [])[1] ?? ''
            ])
          )
        if (params.operation === 'set') {
          for (const [k, v] of Object.entries(params.fields)) {
            const line = `\tpublic $${k} = '${String(v).replace(/'/g, "\\'")}';`
            text = new RegExp(`\\$${k} = `).test(text)
              ? text.replace(new RegExp(`^\\s*public \\$${k} = .*;$`, 'm'), line)
              : text.replace('}\n', `${line}\n}\n`)
          }
          writeFileSync(path, text)
        }
        return answer({ ok: true, fields: read() })
      }
      if (params.kind && params.kind !== 'article') return answer({ ok: false, error: 'bad_params' })
      if (action === 'content.get') {
        const item = read(params.id)
        return answer(
          item ? { ok: true, kind: 'article', id: params.id, item } : { ok: false, error: 'not_found' }
        )
      }
      if (action === 'content.update')
        return answer({ ok: true, kind: 'article', id: update(params.id ?? 0, params.fields) })
      if (action === 'content.delete') {
        if (!read(params.id)) return answer({ ok: false, error: 'not_found' })
        update(params.id, { state: -2 })
        return answer({ ok: true, kind: 'article', id: params.id, trashed: true })
      }
      if (action === 'content.batch') {
        for (const [i, op] of params.operations.entries()) {
          const row = read(op.id)
          for (const [k, v] of Object.entries(op.expected ?? {}))
            if (!row || String(row[k] ?? '') !== String(v ?? ''))
              return answer({
                ok: false,
                error: 'batch_failed',
                message: `conflict at operation ${i}: ${k} changed; every write of this batch was taken back`
              })
        }
        const ids = {}
        for (const op of params.operations) ids[op.key] = update(op.id, op.fields)
        return answer({ ok: true, ids })
      }
      return answer({ ok: false, error: 'bad_params', message: action })
    })
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      state.endpoint = `http://127.0.0.1:${server.address().port}/index.php?option=com_claudecowork&task=api.exec&format=json`
      state.close = () => new Promise((r) => server.close(r))
      resolve(state)
    })
  )
}

const gitBlob = (bytes) =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex')
const undoLog = new Map()
function templateDoor(liveDir, roots, action, params) {
  const file = (path) => join(liveDir, ...String(path).split('/'))
  const read = (path) => (existsSync(file(path)) ? readFileSync(file(path)) : null)
  if (action === 'template.files.status') return { ok: true, roots, files: [], php: false }
  if (action === 'template.files.write') {
    const conflicts = []
    const ops = []
    for (const f of params.files) {
      if (!roots.some((r) => f.path.startsWith(`${r.path}/`)))
        return { ok: false, error: 'refused', refused: [{ path: f.path, reason: 'not_in_scope' }] }
      const live = read(f.path)
      const bytes = f.delete ? null : Buffer.from(f.content_b64, 'base64')
      if (f.delete ? live === null : live?.equals(bytes)) continue
      if ((live ? gitBlob(live) : null) !== f.expected_blob)
        conflicts.push({
          path: f.path,
          expected: f.expected_blob,
          actual: live ? { blob: gitBlob(live) } : null
        })
      else ops.push({ path: f.path, live, bytes })
    }
    if (conflicts.length) return { ok: false, error: 'conflict', conflicts }
    const undoId = `${params.apply_id.slice(-12)}${String(undoLog.size).padStart(12, '0')}`
    for (const o of ops) {
      if (o.bytes) {
        mkdirSync(dirname(file(o.path)), { recursive: true })
        writeFileSync(file(o.path), o.bytes)
      } else rmSync(file(o.path))
      undoLog.set(`${params.apply_id}|${o.path}|${undoLog.size}`, { ...o, undoId })
    }
    return {
      ok: true,
      undo_id: ops.length ? undoId : null,
      files: params.files.map((f) => ({
        path: f.path,
        op: ops.some((o) => o.path === f.path) ? 'updated' : 'unchanged'
      }))
    }
  }
  const restored = []
  const kept = []
  for (const [key, o] of [...undoLog].reverse()) {
    if (!key.startsWith(`${params.apply_id}|`)) continue
    const now = read(o.path)
    if (!(o.bytes ? now?.equals(o.bytes) : now === null)) {
      kept.push({ path: o.path, reason: 'changed-on-live' })
      continue
    }
    if (o.live) writeFileSync(file(o.path), o.live)
    else rmSync(file(o.path))
    restored.push({ path: o.path, op: o.live ? 'restored' : 'removed' })
  }
  return { ok: true, restored, already: [], kept }
}

function stack() {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-live-push-'))
  const priv = join(srv, LABEL)
  const webroot = join(priv, '.webroot')
  mkdirSync(webroot, { recursive: true })
  writeFileSync(join(priv, 'docker-compose.yml'), 'services: {}\n')
  writeFileSync(join(priv, '.env'), 'PLATFORM=joomla\nDB_PASSWORD=t\n')
  const live = join(srv, 'live-site')
  // The live site's read: its folder as a tar and its database as a dump, as live-pull leaves them.
  const lib = join(srv, 'lib')
  mkdirSync(lib)
  for (const name of readdirSync(join(scripts, 'lib')))
    if (name !== 'live-pull.mjs') symlinkSync(join(scripts, 'lib', name), join(lib, name))
  writeFileSync(
    join(lib, 'live-pull.mjs'),
    `import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
const out = join(process.argv[2], 'live')
mkdirSync(out, { recursive: true })
execFileSync('tar', ['-cf', join(out, 'webroot.tar'), '-C', process.env.LIVE_DIR, '.'])
const dump = execFileSync(process.env.REAL_DOCKER, ['exec', '-e', 'MYSQL_PWD=t', process.env.TEST_DB_CONTAINER,
  'mariadb-dump', '-uroot', '--skip-triggers', 'livesrc'], { maxBuffer: 1 << 28 })
writeFileSync(join(out, 'db.sql.gz'), gzipSync(dump))
console.log(JSON.stringify({ ok: true, liveReadAt: new Date().toISOString(), mode: 'whole' }))
`
  )
  const env = {
    ...process.env,
    PATH: pathWithFlock(`${shimDir}:${process.env.PATH}`),
    REAL_DOCKER,
    TEST_DB_CONTAINER: DB_CONTAINER,
    TRACY_SRV: srv,
    TRACY_SITES_ROOT: srv,
    TRACY_PRIVATE_ROOT: srv,
    TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
    TRACY_LIB_DIR: lib,
    LIVE_DIR: live,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  const runSync = (script, args, extra = {}) => {
    const r = spawnSync('bash', [script, '--label', LABEL, ...args], {
      env: { ...env, ...extra },
      encoding: 'utf8'
    })
    assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}\n${r.stdout}`)
    return JSON.parse(r.stdout.trim().split('\n').at(-1))
  }
  // The push talks to the engine stand-in in this process: run without blocking it.
  const runPush = (args, engine) =>
    new Promise((resolve) => {
      const child = spawn('bash', [PUSH, '--label', LABEL, ...args], {
        env: { ...env, TRACY_SYNC_ENDPOINT: engine.endpoint, TRACY_SYNC_TOKEN: TOKEN }
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => {
        assert.equal(code, 0, `${args.join(' ')}\n${err}\n${out}`)
        if (process.env.LIVE_PUSH_TEST_LOG)
          writeFileSync(process.env.LIVE_PUSH_TEST_LOG, `--- ${args.join(' ')}\n${err}\n`, { flag: 'a' })
        resolve({ answer: JSON.parse(out.trim().split('\n').at(-1)), log: err })
      })
    })

  for (const db of sql(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'joomla%' OR schema_name LIKE 'live%'"
  )
    .split('\n')
    .filter(Boolean))
    sql(`DROP DATABASE \`${db}\``)
  sql('CREATE DATABASE joomla CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  sql(TABLES, 'joomla')
  sql(`UPDATE jos_extensions SET params='{"domain": ""}' WHERE element='sef'`, 'joomla')
  write(webroot, { ...SITE_FILES, 'configuration.php': config(COPY_CONFIG) })
  execFileSync(
    'bash',
    ['-c', `. "${scripts}/lib/webroot-htaccess.sh"; tracy_ensure_webroot_htaccess "$1"`, 'x', webroot],
    { env }
  )
  runSync(GIT, ['--op', 'ensure'])
  runSync(BACKUP, ['--op', 'initial-backup'])
  write(live, { ...SITE_FILES, 'configuration.php': config(LIVE_CONFIG) })
  sql('CREATE DATABASE livesrc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  sql(TABLES, 'livesrc')
  return {
    srv,
    priv,
    webroot,
    live,
    runSync,
    runPush,
    dispose: () => rmSync(srv, { recursive: true, force: true })
  }
}

let ids = 0
const id = () => `0f8e2c1a-1111-4222-8333-${String(++ids).padStart(12, '0')}`

test('preview, apply, a second preview and Undo: the copy’s changes reach the live site and nothing comes back twice', {
  ...opts,
  timeout: 900_000
}, async () => {
  const s = stack()
  const engine = await liveEngine(s.live)
  try {
    // The agent, on the copy: an edited title and a new article. The customer, on the live site:
    // an edit elsewhere, and an article of their own — which takes the same next number.
    sql("UPDATE jos_content SET title='Hello, by Tracy' WHERE id=1", 'joomla')
    sql(
      "INSERT INTO jos_content (id, title, alias, introtext, `fulltext`) VALUES (3, 'Tracy news', 'tracy-news', 'new by Tracy', '')",
      'joomla'
    )
    sql("UPDATE jos_content SET introtext='second, by the customer' WHERE id=2", 'livesrc')
    sql(
      "INSERT INTO jos_content (title, alias, introtext, `fulltext`) VALUES ('Customer news', 'customer-news', 'by the customer', '')",
      'livesrc'
    )
    write(s.webroot, {
      'templates/t4/css/custom.css': '.a { color: red }\n',
      // Phase 2: a template stylesheet the engine writes, and the site name in Global Configuration.
      'media/templates/site/cassiopeia/css/user.css': '.b { color: green }\n',
      'configuration.php': config({ ...COPY_CONFIG, sitename: "'Shop & Co'" })
    })

    const previewId = id()
    const { answer: preview, log: previewLog } = await s.runPush(
      ['--op', 'preview', '--preview-id', previewId],
      engine
    )
    assert.equal(preview.ok, true, JSON.stringify(preview))
    assert.deepEqual(
      previewLog.match(/^==> \[\d+s\] stage: \w+$/gm).map((l) => l.split(': ')[1]),
      ['syncing', 'comparing']
    )
    // The sync that ran first, its whole answer, for tracy-web to record as a sync of its own.
    assert.ok(preview.sync.liveReadAt && preview.sync.timing.seconds >= 0, JSON.stringify(preview.sync))
    assert.equal(preview.state, 'ready')
    assert.equal(preview.sync.state, 'applied')
    // The sync came first: the customer's edit and their article are on the copy, theirs under 4.
    assert.deepEqual(rows('SELECT id, title FROM jos_content ORDER BY id'), [
      ['1', 'Hello, by Tracy'],
      ['2', 'About'],
      ['3', 'Tracy news'],
      ['4', 'Customer news']
    ])
    assert.deepEqual(
      preview.items.map((i) => [i.id, i.op, i.group]),
      [
        ['file:media/templates/site/cassiopeia/css/user.css', 'upload', 'files'],
        ['article:new:3', 'create', 'add'],
        ['article:1', 'update', 'change'],
        ['setting:siteIdentity', 'update', 'settings']
      ]
    )
    assert.equal(preview.items[0].size, 20, 'a file by its name and size')
    assert.deepEqual(preview.items[3].fields['Site Name'], {
      before: { text: 'Shop' },
      after: { text: 'Shop & Co' }
    })
    assert.deepEqual(preview.items[2].fields.title, {
      before: { text: 'Hello' },
      after: { text: 'Hello, by Tracy' }
    })
    assert.deepEqual(
      preview.unsupported.map((u) => [u.path ?? u.name ?? u.table, u.reason]),
      [['templates/t4/css/custom.css', 'engine-has-no-file-write']],
      JSON.stringify(preview.unsupported)
    )

    // The customer edits article 1 again after the preview: that one is theirs.
    sql("UPDATE jos_content SET title='Hello from the customer' WHERE id=1", 'livesrc')
    const pushId = id()
    const { answer: pushed } = await s.runPush(
      ['--op', 'apply', '--preview-id', previewId, '--push-id', pushId],
      engine
    )
    assert.equal(pushed.failed.length, 0, JSON.stringify(pushed))
    assert.equal(pushed.ok, true, JSON.stringify(pushed))
    assert.equal(pushed.state, 'partial')
    assert.deepEqual(
      pushed.written.map((w) => w.id),
      ['file:media/templates/site/cassiopeia/css/user.css', 'article:new:3', 'setting:siteIdentity']
    )
    assert.equal(
      readFileSync(join(s.live, 'media/templates/site/cassiopeia/css/user.css'), 'utf8'),
      '.b { color: green }\n'
    )
    assert.match(readFileSync(join(s.live, 'configuration.php'), 'utf8'), /\$sitename = 'Shop & Co';/)
    assert.match(
      readFileSync(join(s.live, 'configuration.php'), 'utf8'),
      /\$password = 'live-password';/,
      'the rest stays the live site’s'
    )
    assert.deepEqual(
      pushed.conflicts.map((c) => [c.id, c.reason, c.fields]),
      [['article:1', 'changed-on-live', ['title']]]
    )
    assert.equal(pushed.sync.ok, true, JSON.stringify(pushed.sync))
    assert.equal(pushed.sync.state, 'applied')
    // On the live site: Tracy's article under the next live number (5), the customer's title kept.
    assert.deepEqual(rows('SELECT id, title FROM jos_content ORDER BY id', 'livesrc'), [
      ['1', 'Hello from the customer'],
      ['2', 'About'],
      ['3', 'Customer news'],
      ['4', 'Tracy news']
    ])
    // On the copy after the sync that followed: no second "Tracy news". Article 1 changed on both
    // sides since the preview's read: the copy keeps Tracy's (the sync's own rule), and names it kept.
    assert.deepEqual(rows('SELECT id, title FROM jos_content ORDER BY id'), [
      ['1', 'Hello, by Tracy'],
      ['2', 'About'],
      ['3', 'Tracy news'],
      ['4', 'Customer news']
    ])
    const idMap = JSON.parse(readFileSync(join(s.priv, 'sync', 'id-map.json'), 'utf8'))
    assert.deepEqual(idMap.content, { 3: 4, 4: 3 })
    assert.ok(!existsSync(join(s.priv, 'sync', 'pushed.json')), 'the read in place holds the push')
    // The same apply again: the same answer.
    const again = (await s.runPush(['--op', 'apply', '--preview-id', previewId, '--push-id', pushId], engine))
      .answer
    assert.equal(again.repeated, true)

    // A Sync from live now brings nothing new: still four articles, no second "Tracy news".
    const again8 = join(s.srv, 'r8')
    mkdirSync(again8)
    // (The live site is read by the stand-in, which needs no door; the sync reads only with one named.)
    const sync = s.runSync(SYNC, ['--op', 'sync', '--dir', again8], {
      TRACY_SYNC_ENDPOINT: engine.endpoint,
      TRACY_SYNC_TOKEN: TOKEN
    })
    assert.equal(sync.state, 'applied', JSON.stringify(sync))
    assert.deepEqual(rows('SELECT COUNT(*) FROM jos_content'), [['4']])
    // A preview offers nothing it may write: article 1 is the customer's on the live site and
    // Tracy's on the copy — shown as changed on both sides, never written over.
    const { answer: second } = await s.runPush(['--op', 'preview', '--preview-id', id()], engine)
    assert.equal(second.ok, true, JSON.stringify(second))
    assert.deepEqual(
      second.items.map((i) => [i.id, i.conflict]),
      [['article:1', { reason: 'changed-on-both', fields: ['title'] }]],
      JSON.stringify(second.items)
    )

    // Undo: Tracy's article on the live site goes to its trash, the stylesheet and the site name go
    // back to the live site's own; the copy keeps all three.
    const { answer: undone } = await s.runPush(['--op', 'undo', '--push-id', pushId], engine)
    assert.equal(undone.ok, true, JSON.stringify(undone))
    assert.deepEqual(undone.restored.map((r) => r.id).sort(), [
      'article:new:3',
      'file:media/templates/site/cassiopeia/css/user.css',
      'setting:siteIdentity'
    ])
    assert.equal(
      readFileSync(join(s.live, 'media/templates/site/cassiopeia/css/user.css'), 'utf8'),
      '.b {}\n'
    )
    assert.match(readFileSync(join(s.live, 'configuration.php'), 'utf8'), /\$sitename = 'Shop';/)
    assert.equal(undone.sync.state, 'applied', JSON.stringify(undone.sync))
    assert.equal(
      readFileSync(join(s.webroot, 'media/templates/site/cassiopeia/css/user.css'), 'utf8'),
      '.b { color: green }\n'
    )
    assert.match(readFileSync(join(s.webroot, 'configuration.php'), 'utf8'), /\$sitename = 'Shop & Co';/)
    assert.deepEqual(rows('SELECT state FROM jos_content WHERE id=4', 'livesrc'), [['-2']])
    assert.deepEqual(rows('SELECT state FROM jos_content WHERE id=3'), [['1']])
    assert.equal(statSync(join(s.priv, 'push', pushId, 'before.json')).mode & 0o777, 0o600)
  } finally {
    await engine.close()
    s.dispose()
  }
})

test('--settle-later: the answer comes once the writes are in; the Sync from live after them, run on its own, brings nothing back twice', {
  ...opts,
  timeout: 900_000
}, async () => {
  const s = stack()
  const engine = await liveEngine(s.live)
  try {
    sql(
      "INSERT INTO jos_content (id, title, alias, introtext, `fulltext`) VALUES (3, 'Tracy news', 'tracy-news', 'new by Tracy', '')",
      'joomla'
    )
    sql(
      "INSERT INTO jos_content (title, alias, introtext, `fulltext`) VALUES ('Customer news', 'customer-news', 'by the customer', '')",
      'livesrc'
    )
    const previewId = id()
    const { answer: preview } = await s.runPush(['--op', 'preview', '--preview-id', previewId], engine)
    assert.equal(preview.state, 'ready', JSON.stringify(preview))
    const pushId = id()
    const { answer: pushed, log } = await s.runPush(
      ['--op', 'apply', '--preview-id', previewId, '--push-id', pushId, '--settle-later'],
      engine
    )
    assert.equal(pushed.ok, true, JSON.stringify(pushed))
    assert.deepEqual(
      pushed.written.map((w) => w.id),
      ['article:new:3']
    )
    assert.deepEqual(pushed.sync, { ok: true, state: 'later' })
    assert.doesNotMatch(log, /stage: settling/, 'no Sync from live inside the apply')
    assert.ok(existsSync(join(s.priv, 'sync', 'pushed.json')), 'the pushed places wait for the next sync')
    // tracy-web's Sync from live, right after: the live site's copy of Tracy's article is the copy's own.
    const dir = join(s.srv, 'later')
    mkdirSync(dir)
    const sync = s.runSync(SYNC, ['--op', 'sync', '--dir', dir], {
      TRACY_SYNC_ENDPOINT: engine.endpoint,
      TRACY_SYNC_TOKEN: TOKEN
    })
    assert.equal(sync.state, 'applied', JSON.stringify(sync))
    assert.deepEqual(rows('SELECT id, title FROM jos_content ORDER BY id'), [
      ['1', 'Hello'],
      ['2', 'About'],
      ['3', 'Tracy news'],
      ['4', 'Customer news']
    ])
    assert.ok(!existsSync(join(s.priv, 'sync', 'pushed.json')), 'the read in place holds the push')
    // The next preview offers nothing: the push is in the base.
    const { answer: second } = await s.runPush(['--op', 'preview', '--preview-id', id()], engine)
    assert.equal(second.state, 'nothing', JSON.stringify(second.items))
  } finally {
    await engine.close()
    s.dispose()
  }
})

test('template files: a template’s own CSS goes through the live site’s template door, a new one too; Undo takes both back, the copy keeps them', {
  ...opts,
  timeout: 900_000
}, async () => {
  const s = stack()
  const engine = await liveEngine(s.live, {
    templateFiles: [
      { path: 'templates/t4', kind: 'template', name: 't4', php: true },
      { path: 'media/templates/site/cassiopeia', kind: 'template-media', name: 'cassiopeia', php: false }
    ]
  })
  try {
    write(s.webroot, {
      'templates/t4/css/custom.css': '.a { color: red }\n',
      'templates/t4/css/new.css': '.n { color: blue }\n',
      'templates/t4/html/com_content/article/default.php': '<?php echo 1;\n'
    })
    const previewId = id()
    const { answer: preview } = await s.runPush(['--op', 'preview', '--preview-id', previewId], engine)
    assert.equal(preview.ok, true, JSON.stringify(preview))
    assert.deepEqual(
      preview.items.map((i) => [i.id, i.op, i.group]),
      [
        ['file:templates/t4/css/custom.css', 'upload', 'files'],
        ['file:templates/t4/css/new.css', 'upload', 'files']
      ]
    )
    // PHP in template files is off on this live site: named, with where to switch it on.
    assert.deepEqual(
      preview.unsupported.map((u) => [u.path, u.reason]),
      [['templates/t4/html/com_content/article/default.php', 'php-disabled']]
    )
    const pushId = id()
    const { answer: pushed } = await s.runPush(
      ['--op', 'apply', '--preview-id', previewId, '--push-id', pushId],
      engine
    )
    assert.equal(pushed.state, 'applied', JSON.stringify(pushed))
    assert.equal(readFileSync(join(s.live, 'templates/t4/css/custom.css'), 'utf8'), '.a { color: red }\n')
    assert.equal(readFileSync(join(s.live, 'templates/t4/css/new.css'), 'utf8'), '.n { color: blue }\n')
    assert.ok(engine.calls.includes('template.files.write'))
    assert.ok(!engine.calls.includes('media.upload'), 'nothing through the media door')
    assert.equal(pushed.sync.state, 'applied', JSON.stringify(pushed.sync))
    // Nothing left to send: the sync after the push took the live site's files as they now are.
    const { answer: second } = await s.runPush(['--op', 'preview', '--preview-id', id()], engine)
    assert.deepEqual(second.items, [], JSON.stringify(second.items))
    const { answer: undone } = await s.runPush(['--op', 'undo', '--push-id', pushId], engine)
    assert.equal(undone.state, 'undone', JSON.stringify(undone))
    assert.equal(readFileSync(join(s.live, 'templates/t4/css/custom.css'), 'utf8'), '.a {}\n')
    assert.ok(!existsSync(join(s.live, 'templates/t4/css/new.css')), 'the file the push added is gone again')
    assert.equal(readFileSync(join(s.webroot, 'templates/t4/css/new.css'), 'utf8'), '.n { color: blue }\n')
  } finally {
    await engine.close()
    s.dispose()
  }
})

test('the shell preserves partial writes and Undo after a firewall blocks a later batch', {
  ...opts,
  timeout: 900_000
}, async () => {
  const s = stack()
  const engine = await liveEngine(s.live)
  try {
    sql("UPDATE jos_content SET title='After' WHERE id=1", 'joomla')
    const path = 'media/templates/site/cassiopeia/css/user.css'
    write(s.webroot, { [path]: '.b { color: green }\n' })
    const previewId = id()
    assert.equal((await s.runPush(['--op', 'preview', '--preview-id', previewId], engine)).answer.ok, true)
    engine.blockBatch = true
    const pushId = id()
    const args = ['--op', 'apply', '--preview-id', previewId, '--push-id', pushId]
    const { answer } = await s.runPush(args, engine)
    assert.equal(answer.ok, false)
    assert.equal(answer.state, 'partial')
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${path}`]
    )
    assert.equal(readFileSync(join(s.live, path), 'utf8'), '.b { color: green }\n')
    const repeated = (await s.runPush(args, engine)).answer
    assert.equal(repeated.repeated, true)
    assert.deepEqual(repeated.written, answer.written)
    engine.blockBatch = false
    const back = (await s.runPush(['--op', 'undo', '--push-id', pushId], engine)).answer
    assert.equal(back.restored.length, 1, JSON.stringify(back))
    assert.equal(readFileSync(join(s.live, path), 'utf8'), '.b {}\n')
  } finally {
    await engine.close()
    s.dispose()
  }
})

test('a PHP too old met mid-Apply reaches the push answer with both versions, the earlier writes kept', {
  ...opts,
  timeout: 900_000
}, async () => {
  const s = stack()
  const engine = await liveEngine(s.live)
  try {
    sql("UPDATE jos_content SET title='After' WHERE id=1", 'joomla')
    const path = 'media/templates/site/cassiopeia/css/user.css'
    write(s.webroot, { [path]: '.b { color: green }\n' })
    const previewId = id()
    assert.equal((await s.runPush(['--op', 'preview', '--preview-id', previewId], engine)).answer.ok, true)
    engine.phpTooOldBatch = true
    const args = ['--op', 'apply', '--preview-id', previewId, '--push-id', id()]
    const { answer } = await s.runPush(args, engine)
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'LIVE_PHP_TOO_OLD', JSON.stringify(answer))
    assert.equal(answer.php, '7.3.33')
    assert.equal(answer.min, '7.4.0')
    assert.equal(answer.state, 'partial')
    assert.deepEqual(
      answer.written.map((w) => w.id),
      [`file:${path}`]
    )
  } finally {
    await engine.close()
    s.dispose()
  }
})

test('a pushed template file deletion survives Undo and Sync on the copy and is offered again', {
  ...opts,
  timeout: 900_000
}, async () => {
  const s = stack()
  const path = 'templates/t4/css/custom.css'
  const engine = await liveEngine(s.live, {
    templateFiles: [{ path: 'templates/t4', kind: 'template', name: 't4', php: true }]
  })
  try {
    rmSync(join(s.webroot, path))
    const previewId = id()
    const preview = (await s.runPush(['--op', 'preview', '--preview-id', previewId], engine)).answer
    assert.equal(preview.ok, true, JSON.stringify(preview))
    assert.deepEqual(
      preview.items.map((i) => [i.id, i.op]),
      [[`file:${path}`, 'delete']]
    )
    const pushId = id()
    const applied = (
      await s.runPush(
        ['--op', 'apply', '--preview-id', previewId, '--push-id', pushId, '--confirm-deletes'],
        engine
      )
    ).answer
    assert.equal(applied.state, 'applied', JSON.stringify(applied))
    assert.equal(applied.sync.state, 'applied', JSON.stringify(applied.sync))
    assert.ok(!existsSync(join(s.live, path)))
    assert.ok(!existsSync(join(s.webroot, path)))
    const undone = (await s.runPush(['--op', 'undo', '--push-id', pushId], engine)).answer
    assert.equal(undone.state, 'undone', JSON.stringify(undone))
    assert.equal(undone.sync.state, 'applied', JSON.stringify(undone.sync))
    assert.equal(readFileSync(join(s.live, path), 'utf8'), '.a {}\n')
    assert.ok(!existsSync(join(s.webroot, path)), 'Undo keeps Tracy deletion on the copy')
    const again = (await s.runPush(['--op', 'preview', '--preview-id', id()], engine)).answer
    assert.equal(again.ok, true, JSON.stringify(again))
    assert.deepEqual(
      again.items.map((i) => [i.id, i.op]),
      [[`file:${path}`, 'delete']]
    )
    assert.ok(!existsSync(join(s.webroot, path)), 'the preview sync also preserves the deletion')
  } finally {
    await engine.close()
    s.dispose()
  }
})
