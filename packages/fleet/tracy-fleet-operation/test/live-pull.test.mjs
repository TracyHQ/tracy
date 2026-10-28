/**
 * The read of a live site for "Sync from live" (`scripts/lib/live-pull.mjs`), against a stand-in
 * Claude Cowork engine on a local port that serves a real little webroot (a real tar in parts,
 * `files.list` with sha1s, `file.read` that refuses configuration.php like the engine) and a database
 * the test can write to between pages. What it pins:
 *   - the database is taken only when two whole reads agree (an edit in place shows), and a site
 *     that keeps writing stops the read; the sessions table may move freely;
 *   - a first read takes the whole tree and checks every file against the listing; with the last
 *     read's manifest only what changed is read, and a protected file that changed falls back to
 *     the whole tree; a file that moves during the read is read again, or stops it;
 *   - the guards the import already had: the administrator door, 503 halving, offset paging, a
 *     refused token, and on a one-machine stand the `.tracy.test` route with the name in Host.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-pull.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const PULL = join(here, '..', 'scripts', 'lib', 'live-pull.mjs')
const TOKEN = 'live-token-0123456789abcdef'
const root = mkdtempSync(join(tmpdir(), 'live-pull-'))
after(() => rmSync(root, { recursive: true, force: true }))
const sha1 = (b) => createHash('sha1').update(b).digest('hex')

let sites = 0
/**
 * An engine over a real webroot. `options`:
 *   byOffset, fail503, gatedFront — the import's own cases;
 *   onDump(table, db, first) — called on every db.dump page (`first`: a table's first page), may
 *     change `db` (a live site writing);
 *   onList(round, write) — called before each whole listing, may change files on disk;
 *   packLeavesOut — paths a whole pack leaves out (an engine that would not pack a protected file);
 *   modern — claude-cowork 0.24.51: `db.dump_many`, `site.fingerprint`, `files.list {hash:false}`,
 *     `files.hash`; dumpManyOnly — `db.dump_many` alone; manyRows(call) — rows per INSERT there;
 *   ranges — `db.range_checksums` and `db.dump_after` (keyed by the first column, an integer);
 *     onAfter(table, db) — called on every db.dump_after (a live site writing while a range is read).
 */
async function engine(options = {}) {
  const webroot = join(root, `site-${++sites}`)
  const files = {
    'index.php': '<?php // Joomla',
    'configuration.php': "<?php class JConfig { public $sitename = 'Shop'; }",
    'templates/t4/css/custom.css': '.a {}\n',
    'images/logo.png': Buffer.alloc(3000, 7)
  }
  const write = (path, body) => {
    mkdirSync(dirname(join(webroot, path)), { recursive: true })
    writeFileSync(join(webroot, path), body)
  }
  for (const [path, body] of Object.entries(files)) write(path, body)
  const db = {
    jos_content: [
      [1, 'Hello'],
      [2, 'About'],
      [3, 'News'],
      [4, 'Shop'],
      [5, 'Blog']
    ],
    jos_session: [['s1', 'x']]
  }
  const seen = {
    ranges: [],
    after: [],
    limits: [],
    listLimits: [],
    lists: 0,
    reads: [],
    hosts: [],
    many: [],
    hashed: [],
    fingerprints: 0,
    sha1Lists: 0,
    packs: []
  }
  const hits = {}
  if (options.noise) db.jos_action_logs = [[1, 'login']]
  let manyCalls = 0
  let failures = options.fail503 ?? 0
  let tar = null
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name)
      if (e.isDirectory()) walk(abs, out)
      else out.push(abs.slice(webroot.length + 1))
    }
    return out.sort()
  }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const send = (status, value) => {
        res.writeHead(status, {
          'content-type': typeof value === 'string' ? 'text/html' : 'application/json'
        })
        // `phpNotice`: a host that prints PHP's notices ahead of every answer (PHP 8.5, display_errors on)
        res.end(typeof value === 'string' ? value : (options.phpNotice ?? '') + JSON.stringify(value))
      }
      seen.hosts.push(req.headers.host)
      if (options.gatedFront && !req.url.includes('/administrator/'))
        return send(200, '<html>Coming soon</html>')
      const call = JSON.parse(body)
      if (call.token !== TOKEN) return send(200, { ok: false, error: 'unauthorized' })
      const p = call.params ?? {}
      switch (call.action) {
        case 'core.manifest':
          return send(200, { ok: true, platform: 'joomla' })
        case 'info':
          if (!options.modern && !options.dumpManyOnly)
            return send(200, { ok: false, error: 'unknown_action' })
          return send(200, {
            ok: true,
            info: {
              db_dump_many: { max_tables: 50 },
              ...(options.modern
                ? {
                    site_fingerprint: { version: options.fpVersion ?? 1, max_files: 50000 },
                    files_list: { stat: true, max_stat_limit: 5000 },
                    files_hash: { max_paths: 500 },
                    ...(options.packPaths ? { files_pack: { max_paths: options.packPaths } } : {}),
                    ...(options.ranges
                      ? { db_range_checksums: { version: 1, max_starts: 5000, max_limit: 5000 } }
                      : {})
                  }
                : {})
            }
          })
        case 'db.tables':
          return send(200, { ok: true, tables: Object.keys(db) })
        case 'db.dump_many': {
          // The dumper's stream: a `-- table` line where a table starts, then one INSERT a page.
          const per = options.manyRows?.(++manyCalls) ?? 2
          let { table: at = 0, row = null } = p.cursor ?? {}
          if (row === null) seen.many.push(p.tables)
          let sql = ''
          const progress = []
          let pages = 0
          while (at < p.tables.length && pages < 2) {
            const table = p.tables[at]
            options.onDump?.(table, db, row === null)
            const all = db[table]
            const start = row === null ? 0 : all.findIndex((r) => String(r[0]) === row) + 1
            if (start === 0) sql += `-- table \`${table}\`\nDROP TABLE IF EXISTS \`${table}\`;\n`
            if (start === 0 && options.createTables) sql += `${createOf(table, all)};\n`
            const page = all.slice(start, start + per)
            if (page.length) sql += insertOf(table, page)
            const done = start + page.length >= all.length
            progress.push({ index: at, table, rows: page.length, total: all.length, done })
            pages++
            if (done) {
              at++
              row = null
            } else row = String(page.at(-1)[0])
          }
          const done = at >= p.tables.length
          return send(200, {
            ok: true,
            sql_b64: Buffer.from(sql).toString('base64'),
            next_cursor: done ? null : { table: at, row: row ?? '' },
            done,
            stopped: done ? 'done' : 'bytes',
            progress
          })
        }
        case 'db.range_checksums': {
          // A range's checksum: its rows' count and a hash of them, "0:0" when it has none.
          seen.ranges.push({ table: p.table, starts: p.starts.length })
          const per = Array.from({ length: p.starts.length + 1 }, () => [])
          for (const row of db[p.table]) per[p.starts.filter((s) => s <= Number(row[0])).length].push(row)
          return send(200, {
            ok: true,
            table: p.table,
            key: p.key,
            ranges: per.map((rows) => (rows.length ? `${rows.length}:${sha1(JSON.stringify(rows))}` : '0:0')),
            create: options.createTables ? createOf(p.table, db[p.table]) : ''
          })
        }
        case 'db.dump_after': {
          seen.after.push({ table: p.table, after: p.after, limit: p.limit })
          options.onAfter?.(p.table, db)
          const rows = db[p.table]
            .filter((r) => p.after === null || Number(r[0]) > p.after)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .slice(0, p.limit)
          return send(200, {
            ok: true,
            table: p.table,
            sql_b64: Buffer.from(insertOf(p.table, rows)).toString('base64'),
            rows: rows.length,
            last: rows.length ? String(rows.at(-1)[0]) : null
          })
        }
        case 'site.fingerprint': {
          seen.fingerprints++
          const all = walk(webroot)
          const lines = all.map((path) => {
            const st = statSync(join(webroot, path))
            return `${path}\0${st.size}\0${Math.floor(st.mtimeMs / 1000)}\n`
          })
          return send(200, {
            ok: true,
            fingerprint: {
              version: 1,
              files:
                p.files === false
                  ? null
                  : { count: all.length, bytes: 0, digest: sha1(lines.join('')), next_after: null },
              // `hits` stands for the columns a site moves on its own: left out when skip_columns names it.
              tables:
                p.checksums === false
                  ? null
                  : Object.fromEntries(
                      Object.entries(db).map(([t, rows]) => [
                        t,
                        sha1(
                          JSON.stringify(rows) +
                            ((p.skip_columns ?? []).includes('hits') ? '' : `:${hits[t] ?? 0}`)
                        )
                      ])
                    ),
              seconds: 0
            }
          })
        }
        case 'files.hash':
          seen.hashed.push(...p.paths)
          return send(200, {
            ok: true,
            hashes: Object.fromEntries(
              // Like the engine: a protected path is never hashed alone, a gone one is null.
              p.paths.map((path) => [
                path,
                path !== 'configuration.php' && existsSync(join(webroot, path))
                  ? sha1(readFileSync(join(webroot, path)))
                  : null
              ])
            )
          })
        case 'db.dump': {
          seen.limits.push(p.limit)
          if (failures > 0) {
            failures--
            return send(503, 'overloaded')
          }
          const first = options.byOffset ? !p.offset : !p.cursor
          options.onDump?.(p.table, db, first)
          const all = db[p.table]
          const start = options.byOffset
            ? (p.offset ?? 0)
            : p.cursor
              ? all.findIndex((r) => String(r[0]) === p.cursor) + 1
              : 0
          const page = all.slice(start, start + Math.min(p.limit, 2))
          const sql =
            (first ? `-- table \`${p.table}\`\nDROP TABLE IF EXISTS \`${p.table}\`;\n` : '') +
            page.map((r) => `INSERT INTO ${p.table} VALUES (${r.map((v) => `'${v}'`).join(',')});\n`).join('')
          return send(200, {
            ok: true,
            sql_b64: Buffer.from(sql).toString('base64'),
            rows: page.length,
            total: all.length,
            done: start + page.length >= all.length,
            ...(options.byOffset
              ? { next_offset: start + page.length }
              : { next_cursor: String(page.at(-1)?.[0] ?? '') })
          })
        }
        case 'files.list': {
          seen.listLimits.push(p.limit)
          // A host whose time limit stops any lot past `listMax` files: Apache answers 500.
          if (options.listMax && p.limit > options.listMax)
            return send(500, '<html>Internal Server Error</html>')
          if (!p.after) options.onList?.(++seen.lists, write)
          const all = walk(webroot)
          const start = p.after ? all.indexOf(p.after) + 1 : 0
          const slice = all.slice(start, start + p.limit)
          if (p.hash !== false && !p.after) seen.sha1Lists++
          return send(200, {
            ok: true,
            files: slice.map((path) => {
              const b = readFileSync(join(webroot, path))
              if (p.hash === false)
                return {
                  path,
                  size: b.length,
                  mtime: Math.floor(statSync(join(webroot, path)).mtimeMs / 1000)
                }
              return { path, size: b.length, sha1: sha1(b) }
            }),
            next_cursor: slice.at(-1) ?? null,
            done: start + slice.length >= all.length
          })
        }
        case 'file.read': {
          seen.reads.push(p.path)
          options.onRead?.(p.path, write)
          if (p.path === 'configuration.php')
            return send(200, { ok: false, error: 'read_failed', message: 'refused: protected path' })
          if (!existsSync(join(webroot, p.path)))
            return send(200, { ok: false, error: 'read_failed', message: `not found: ${p.path}` })
          const b = readFileSync(join(webroot, p.path))
          return send(200, {
            ok: true,
            path: p.path,
            size: b.length,
            sha1: sha1(b),
            content_b64: b.toString('base64')
          })
        }
        case 'files.pack': {
          if (!p.inline) return send(200, { ok: false, error: 'bad_params' })
          if (!p.offset) seen.packs.push(p.paths ?? 'whole')
          // Cut to `paths` (0.24.54): the named files the walk still lists, configuration.php too.
          if (!p.offset)
            tar = p.paths
              ? execFileSync('tar', [
                  '-cf',
                  '-',
                  '-C',
                  webroot,
                  ...p.paths.filter((f) => existsSync(join(webroot, f)))
                ])
              : execFileSync('tar', [
                  '-cf',
                  '-',
                  ...(options.packLeavesOut ?? []).map((f) => `--exclude=./${f}`),
                  '-C',
                  webroot,
                  '.'
                ])
          const start = p.offset ?? 0
          const part = tar.subarray(start, start + p.target_bytes)
          const next = start + part.length
          return send(200, {
            ok: true,
            etag: '',
            part_b64: part.toString('base64'),
            files: 1,
            bytes: part.length,
            next_path: 'x',
            next_offset: next,
            next_size: 0,
            done: next >= tar.length
          })
        }
        default:
          return send(200, { ok: false, error: 'unknown_action' })
      }
    })
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        seen,
        db,
        hits,
        write,
        webroot,
        url: `http://127.0.0.1:${server.address().port}/index.php?option=com_claudecowork&task=api.exec&format=json`
      })
    )
  )
}

/** As MariaDB's dumper writes a table: keyed by `id`, with the counter its next insert takes. */
const createOf = (table, rows) =>
  `CREATE TABLE \`${table}\` (\n  \`id\` bigint(20) unsigned NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (\`id\`)\n) ENGINE=InnoDB AUTO_INCREMENT=${Math.max(0, ...rows.map((r) => Number(r[0]) || 0)) + 1} DEFAULT CHARSET=utf8mb4`
/** One INSERT of `rows`, as the engine's SqlValue writes it ('' for none). */
const insertOf = (table, rows) =>
  rows.length
    ? `INSERT INTO \`${table}\` VALUES ${rows.map((r) => `(${r.map((v) => `'${v}'`).join(',')})`).join(',')};\n`
    : ''

function pull(dir, endpoint, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [PULL, dir], {
      env: { ...process.env, TRACY_SYNC_ENDPOINT: endpoint, TRACY_SYNC_TOKEN: TOKEN, ...extra }
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', () => resolve({ answer: JSON.parse(out.trim().split('\n').at(-1)), out, err }))
  })
}
const dump = (dir) => gunzipSync(readFileSync(join(dir, 'live', 'db.sql.gz'))).toString()

test('a first read: the database twice in agreement, the whole tree checked file by file, a manifest of it', async () => {
  const site = await engine()
  try {
    const dir = join(root, 'a')
    const { answer, out, err } = await pull(dir, site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'full')
    assert.equal(answer.dbRounds, 2)
    assert.equal((dump(dir).match(/INSERT INTO jos_content/g) ?? []).length, 5)
    for (const path of ['index.php', 'configuration.php', 'templates/t4/css/custom.css', 'images/logo.png'])
      assert.ok(
        readFileSync(join(dir, 'live', 'tree', path)).equals(readFileSync(join(site.webroot, path))),
        path
      )
    const manifest = JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))
    assert.equal(manifest['index.php'], sha1(readFileSync(join(site.webroot, 'index.php'))))
    assert.equal(existsSync(join(dir, 'live', 'webroot.tar')), false, 'the tar is unpacked and gone')
    assert.ok(!(out + err).includes(TOKEN))
  } finally {
    site.server.close()
  }
})

test('a host that prints PHP notices ahead of each answer is read all the same (PHP 8.5 curl_close)', async () => {
  const site = await engine({
    phpNotice:
      '<br />\n<b>Deprecated</b>:  Function curl_close() is deprecated since 8.5, as it has no effect since PHP 8.0 in <b>/home/u1/public_html/plugins/Uploader.php</b> on line <b>53</b><br />\n'
  })
  try {
    const dir = join(root, 'notice')
    const { answer } = await pull(dir, site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal((dump(dir).match(/INSERT INTO jos_content/g) ?? []).length, 5)
  } finally {
    site.server.close()
  }
})

test('a host that cannot hash a whole lot in time is listed in smaller lots, and stays listed so', async () => {
  const site = await engine({ listMax: 12 })
  try {
    const dir = join(root, 'small-lots')
    const { answer } = await pull(dir, site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    const manifest = JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))
    assert.equal(manifest['index.php'], sha1(readFileSync(join(site.webroot, 'index.php'))))
    assert.ok(
      site.seen.listLimits.includes(500) && site.seen.listLimits.at(-1) <= 12,
      JSON.stringify(site.seen.listLimits)
    )
    assert.deepEqual(
      site.seen.listLimits.filter((l) => l > 12),
      [500, 250, 125, 62, 31, 15],
      'halved once, not again at the second listing'
    )
  } finally {
    site.server.close()
  }
})

test('with the last manifest only what changed is read, one file at a time; deletions are named', async () => {
  const site = await engine()
  try {
    const first = join(root, 'b1')
    await pull(first, site.url)
    site.write('templates/t4/css/custom.css', '.a { color: red }\n')
    site.write('images/new.png', Buffer.alloc(10, 1))
    rmSync(join(site.webroot, 'index.php'))
    site.seen.reads.length = 0
    const dir = join(root, 'b2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'incremental')
    assert.deepEqual(site.seen.reads.sort(), ['images/new.png', 'templates/t4/css/custom.css'])
    assert.equal(
      readFileSync(join(dir, 'live', 'changes', 'templates/t4/css/custom.css'), 'utf8'),
      '.a { color: red }\n'
    )
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'live', 'deleted.json'), 'utf8')), ['index.php'])
    assert.equal(existsSync(join(dir, 'live', 'tree')), false)
  } finally {
    site.server.close()
  }
})

test('a protected file that changed (configuration.php) is never read alone: the whole tree is read', async () => {
  const site = await engine()
  try {
    const first = join(root, 'c1')
    await pull(first, site.url)
    site.write('configuration.php', "<?php class JConfig { public $sitename = 'Shop & Co'; }")
    const dir = join(root, 'c2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'full')
    assert.match(readFileSync(join(dir, 'live', 'tree', 'configuration.php'), 'utf8'), /Shop & Co/)
  } finally {
    site.server.close()
  }
})

test('an edit in place between the two database reads is caught and read again; a site that keeps writing stops the read', async () => {
  let pages = 0
  const once = await engine({
    onDump: (table, db) => {
      // jos_content is three pages long: page 4 starts the second read. The edit keeps the row
      // count, so only a byte-for-byte comparison of two reads can see it.
      if (table === 'jos_content' && ++pages === 4) db.jos_content[1][1] = 'About us'
    }
  })
  try {
    const dir = join(root, 'd')
    const { answer, err } = await pull(dir, once.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbRounds, 3)
    assert.match(err, /changed between two reads \(jos_content \(1 row\)\)/)
    assert.match(dump(dir), /'About us'/)
  } finally {
    once.server.close()
  }
  let n = 0
  const busy = await engine({
    onDump: (table, db) => table === 'jos_content' && (db.jos_content[0][1] = `Hello ${++n}`)
  })
  try {
    const { answer } = await pull(join(root, 'e'), busy.url)
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'LIVE_BUSY')
  } finally {
    busy.server.close()
  }
})

test('the sessions table may change between reads without stopping anything', async () => {
  let n = 0
  const site = await engine({
    onDump: (table, db) => table === 'jos_session' && (db.jos_session[0][1] = `visit ${++n}`)
  })
  try {
    const { answer } = await pull(join(root, 'f'), site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbRounds, 2)
  } finally {
    site.server.close()
  }
})

test('rows a WordPress site rewrites on every visit (transients, WP-Cron) may change between reads; the others may not', async () => {
  const rows = JSON.parse(
    execFileSync('python3', [join(here, '..', 'scripts', 'lib', 'live_sync_wordpress.py'), 'volatile-rows'], {
      encoding: 'utf8'
    })
  )
  let n = 0
  const visited = await engine({
    onDump: (table, db) => {
      if (table !== 'wp_options') return
      db.wp_options[1][2] = `feed ${++n}`
      db.wp_options[2][2] = `a:1:{i:${n};s:4:"cron";}`
    }
  })
  const options = () => [
    [1, 'blogname', 'Shop'],
    [2, '_transient_feed', 'feed'],
    [3, 'cron', 'a:0:{}']
  ]
  visited.db.wp_options = options()
  try {
    const { answer } = await pull(join(root, 'wp-a'), visited.url, {
      TRACY_SYNC_VOLATILE_ROWS: JSON.stringify(rows)
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbRounds, 2)
    // Without the rows named, the same site never reads the same twice.
    const { answer: busy } = await pull(join(root, 'wp-b'), visited.url)
    assert.equal(busy.code, 'LIVE_BUSY')
  } finally {
    visited.server.close()
  }
  let pages = 0
  const edited = await engine({
    onDump: (table, db) => table === 'wp_options' && ++pages === 2 && (db.wp_options[0][2] = 'Shop & Co')
  })
  edited.db.wp_options = options()
  try {
    const dir = join(root, 'wp-c')
    const { answer } = await pull(dir, edited.url, { TRACY_SYNC_VOLATILE_ROWS: JSON.stringify(rows) })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbRounds, 3, 'an edit of a real option between the reads is still caught')
    assert.match(dump(dir), /'Shop & Co'/)
  } finally {
    edited.server.close()
  }
})

test('a file that changes while the site is read is read again; one that keeps changing stops the read', async () => {
  const site = await engine({
    onList: (round, write) => round === 2 && write('templates/t4/css/custom.css', '.a { moved }\n')
  })
  try {
    const dir = join(root, 'g')
    const { answer, err } = await pull(dir, site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.match(err, /changed while they were read/)
    assert.equal(
      readFileSync(join(dir, 'live', 'tree', 'templates/t4/css/custom.css'), 'utf8'),
      '.a { moved }\n'
    )
    const manifest = JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))
    assert.equal(manifest['templates/t4/css/custom.css'], sha1(Buffer.from('.a { moved }\n')))
  } finally {
    site.server.close()
  }
  const busy = await engine({
    onList: (round, write) => write('templates/t4/css/custom.css', `.a { ${round} }\n`)
  })
  try {
    const { answer } = await pull(join(root, 'h'), busy.url)
    assert.equal(answer.code, 'LIVE_BUSY')
  } finally {
    busy.server.close()
  }
})

test("the import's guards: the administrator door, 503 halving with offset paging, a refused token, no credential", async () => {
  const gated = await engine({ gatedFront: true })
  try {
    assert.equal((await pull(join(root, 'i'), gated.url)).answer.ok, true)
  } finally {
    gated.server.close()
  }
  const busy = await engine({ fail503: 2, byOffset: true })
  try {
    const { answer } = await pull(join(root, 'j'), busy.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.deepEqual(busy.seen.limits.slice(0, 3), [2000, 1000, 500])
  } finally {
    busy.server.close()
  }
  const site = await engine()
  try {
    const refused = await pull(join(root, 'k'), site.url, { TRACY_SYNC_TOKEN: 'wrong-token-123456' })
    assert.equal(refused.answer.code, 'TOKEN_REFUSED')
    assert.equal(existsSync(join(root, 'k', 'live')), false)
    const missing = await pull(join(root, 'l'), '', { TRACY_SYNC_TOKEN: '' })
    assert.equal(missing.answer.code, 'NO_LIVE_CREDENTIAL')
  } finally {
    site.server.close()
  }
})

test('on a stand on one machine a .tracy.test site is reached through the door named, its name in Host', async () => {
  const site = await engine()
  try {
    const via = new URL(site.url).host
    const { answer } = await pull(
      join(root, 'm'),
      'http://shop-live.tracy.test:51710/index.php?option=com_claudecowork&task=api.exec&format=json',
      {
        TRACY_SYNC_CONNECT_VIA: via
      }
    )
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.deepEqual([...new Set(site.seen.hosts)], ['shop-live.tracy.test:51710'])
  } finally {
    site.server.close()
  }
})

// ── claude-cowork 0.24.51: the cheap questions (measured 21/10/2026: a sync with nothing new on a
// 34 000-file Joomla site took 13.5 min — every file hashed twice, the database read twice) ──────

const gone = (site) => ({
  many: site.seen.many.length,
  dumps: site.seen.limits.length,
  lists: site.seen.listLimits.length
})

test('with table checksums the database is read once; a table that moved during the read is read again alone', async () => {
  let moved = false
  const site = await engine({
    modern: true,
    onDump: (table, db) => {
      // The first page of jos_content: the live site edits a row in place while it is read.
      if (table === 'jos_content' && !moved) {
        moved = true
        db.jos_content[0][1] = 'Hello again'
      }
    }
  })
  try {
    const dir = join(root, 'fp-db')
    const { answer, err } = await pull(dir, site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbCheck, 'checksum')
    assert.deepEqual(
      site.seen.many,
      [['jos_content', 'jos_session'], ['jos_content']],
      'one whole read, then the table that moved'
    )
    assert.equal(site.seen.limits.length, 0, 'no table read one by one')
    assert.match(err, /jos_content changed while read/)
    assert.match(dump(dir), /'Hello again'/)
    assert.equal((dump(dir).match(/^-- table `/gm) ?? []).length, 2, 'every table once in the dump')
  } finally {
    site.server.close()
  }
})

test('a live site that did not move is answered by its fingerprint, and nothing is read', async () => {
  const site = await engine({ modern: true })
  try {
    const first = join(root, 'fp-1')
    const a = await pull(first, site.url)
    assert.equal(a.answer.ok, true, JSON.stringify(a.answer))
    assert.ok(existsSync(join(first, 'live', 'fingerprint.json')))
    const before = gone(site)
    const dir = join(root, 'fp-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.unchanged, 'fingerprint')
    assert.deepEqual(gone(site), before, 'no table and no file was asked for')
    assert.equal(existsSync(join(dir, 'live', 'db.sql.gz')), false)
    // A row, or a file, that moved: the fingerprint differs and the site is read.
    site.db.jos_content[2][1] = 'News!'
    const moved = await pull(join(root, 'fp-3'), site.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(moved.answer.unchanged, undefined)
    assert.match(dump(join(root, 'fp-3')), /'News!'/)
  } finally {
    site.server.close()
  }
})

test('the cheap listing hashes only files whose size or mtime moved, and keeps both in the manifest', async () => {
  const site = await engine({ modern: true })
  try {
    const first = join(root, 'stat-1')
    const a = await pull(first, site.url)
    assert.equal(a.answer.ok, true, JSON.stringify(a.answer))
    assert.equal(a.answer.list, 'stat')
    assert.equal(site.seen.sha1Lists, 0, 'the site never hashed a whole listing')
    const manifest = JSON.parse(readFileSync(join(first, 'live', 'manifest.json'), 'utf8'))
    const css = 'templates/t4/css/custom.css'
    assert.equal(manifest[css].sha1, sha1(readFileSync(join(site.webroot, css))))
    assert.equal(manifest[css].size, readFileSync(join(site.webroot, css)).length)
    assert.equal(typeof manifest[css].mtime, 'number')
    site.write(css, '.a { color: blue }\n')
    // Touched, same bytes: hashed, found the same, and not read.
    const future = new Date(Date.now() + 120_000)
    utimesSync(join(site.webroot, 'index.php'), future, future)
    site.seen.hashed.length = 0
    site.seen.reads.length = 0
    const dir = join(root, 'stat-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'incremental')
    assert.deepEqual([...new Set(site.seen.hashed)].sort(), ['index.php', css])
    assert.deepEqual(site.seen.reads, [css])
    assert.equal(readFileSync(join(dir, 'live', 'changes', css), 'utf8'), '.a { color: blue }\n')
  } finally {
    site.server.close()
  }
})

test('a protected file the cheap listing cannot hash: kept while it stands still, the whole tree once it moves', async () => {
  const site = await engine({ modern: true })
  try {
    const first = join(root, 'stat-p1')
    await pull(first, site.url)
    // Still: never asked about, never dropped from the manifest.
    const still = await pull(join(root, 'stat-p2'), site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(still.answer.mode, 'incremental', JSON.stringify(still.answer))
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'stat-p2', 'live', 'deleted.json'), 'utf8')), [])
    assert.ok(
      JSON.parse(readFileSync(join(root, 'stat-p2', 'live', 'manifest.json'), 'utf8'))['configuration.php']
        .sha1
    )
    site.write('configuration.php', "<?php class JConfig { public $sitename = 'Shop & Co'; }")
    const dir = join(root, 'stat-p3')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'full')
    assert.match(readFileSync(join(dir, 'live', 'tree', 'configuration.php'), 'utf8'), /Shop & Co/)
  } finally {
    site.server.close()
  }
})

test('db.dump_many cut differently on two reads still agrees: rows are compared, not INSERT statements', async () => {
  const site = await engine({ dumpManyOnly: true, manyRows: (call) => (call <= 3 ? 2 : 3) })
  try {
    const dir = join(root, 'many')
    const { answer } = await pull(dir, site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbCheck, 'two-reads')
    assert.equal(answer.dbRounds, 2, 'the two reads agreed at once')
    assert.equal(site.seen.limits.length, 0, 'no table read one by one')
    for (const title of ['Hello', 'About', 'News', 'Shop', 'Blog'])
      assert.match(dump(dir), new RegExp(`'${title}'`))
  } finally {
    site.server.close()
  }
})

test('an older engine: a read that brought nothing new from the last one is answered unchanged', async () => {
  const site = await engine()
  try {
    const first = join(root, 'cmp-1')
    await pull(first, site.url)
    const env = {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json'),
      TRACY_SYNC_DB_BASE: join(first, 'live', 'db.sql.gz')
    }
    const { answer } = await pull(join(root, 'cmp-2'), site.url, env)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.unchanged, 'compare')
    // The sessions table moves on every visit: still unchanged.
    site.db.jos_session[0][1] = 'y'
    assert.equal((await pull(join(root, 'cmp-3'), site.url, env)).answer.unchanged, 'compare')
    site.db.jos_content[4][1] = 'Blog!'
    assert.equal((await pull(join(root, 'cmp-4'), site.url, env)).answer.unchanged, undefined)
  } finally {
    site.server.close()
  }
})

test('a live site whose only moves are its own (page views, a login log) is still answered unchanged', async () => {
  const site = await engine({ modern: true, fpVersion: 2, noise: true })
  try {
    const first = join(root, 'noise-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.hits.jos_content = 41 // visitors read pages
    site.db.jos_action_logs.push([2, 'login again']) // someone logged in
    const env = {
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json'),
      TRACY_SYNC_DB_BASE: join(first, 'live', 'db.sql.gz')
    }
    const { answer } = await pull(join(root, 'noise-2'), site.url, env)
    assert.equal(answer.unchanged, 'fingerprint', JSON.stringify(answer))
  } finally {
    site.server.close()
  }
  // An engine of version 1 has no skip_columns: the same visits read as a change.
  const old = await engine({ modern: true, fpVersion: 1, noise: true })
  try {
    const a = join(root, 'noise-3')
    await pull(a, old.url)
    old.hits.jos_content = 41
    const b = await pull(join(root, 'noise-4'), old.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(a, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(a, 'live', 'manifest.json')
    })
    assert.equal(b.answer.unchanged, undefined)
  } finally {
    old.server.close()
  }
})

test('only the tables that moved since the last applied read are read; the others are that read', async () => {
  const site = await engine({ modern: true, fpVersion: 2, noise: true })
  try {
    const first = join(root, 'reuse-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.db.jos_content[3][1] = 'Shop!'
    site.seen.many.length = 0
    const dir = join(root, 'reuse-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json'),
      TRACY_SYNC_DB_BASE: join(first, 'live', 'db.sql.gz')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbCheck, 'checksum-incremental')
    assert.equal(answer.tablesRead, 1)
    assert.deepEqual(
      site.seen.many,
      [['jos_content']],
      'jos_session and jos_action_logs came from the last read'
    )
    const sqlText = dump(dir)
    assert.match(sqlText, /'Shop!'/)
    assert.match(sqlText, /-- table `jos_session`/)
    assert.match(sqlText, /'login'/)
    assert.equal((sqlText.match(/^-- table `/gm) ?? []).length, 3, 'every table once')
    // The dump is a gzip member a table, with its index: the next read takes an unmoved table's
    // member byte for byte from this one, nothing unpacked or packed again.
    const index = JSON.parse(readFileSync(join(dir, 'live', 'db.sql.gz.index.json'), 'utf8'))
    assert.deepEqual(index.parts.map((p) => p.table).sort(), [
      'jos_action_logs',
      'jos_content',
      'jos_session'
    ])
    site.db.jos_content[3][1] = 'Shop, again'
    site.seen.many.length = 0
    const third = join(root, 'reuse-3')
    const again = await pull(third, site.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(dir, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(dir, 'live', 'manifest.json'),
      TRACY_SYNC_DB_BASE: join(dir, 'live', 'db.sql.gz')
    })
    assert.equal(again.answer.ok, true, JSON.stringify(again.answer))
    assert.deepEqual(site.seen.many, [['jos_content']])
    const member = (file, idx, table) => {
      const at = idx.parts.find((p) => p.table === table)
      return readFileSync(file).subarray(at.offset, at.offset + at.length)
    }
    const index3 = JSON.parse(readFileSync(join(third, 'live', 'db.sql.gz.index.json'), 'utf8'))
    assert.ok(
      member(join(third, 'live', 'db.sql.gz'), index3, 'jos_action_logs').equals(
        member(join(dir, 'live', 'db.sql.gz'), index, 'jos_action_logs')
      ),
      'the unmoved table is the last read’s member as it was'
    )
    const sql3 = dump(third)
    assert.match(sql3, /'Shop, again'/)
    assert.match(sql3, /'login'/)
    assert.equal((sql3.match(/^-- table `/gm) ?? []).length, 3)
  } finally {
    site.server.close()
  }
})

/** A content table big enough to be cut into ranges when ranges are this small. */
const SMALL_RANGES = { TRACY_SYNC_RANGE_BYTES: '200', TRACY_SYNC_RANGE_MIN_BYTES: '100' }
const sinceRead = (dir, extra = {}) => ({
  ...SMALL_RANGES,
  TRACY_SYNC_FINGERPRINT_IN: join(dir, 'live', 'fingerprint.json'),
  TRACY_SYNC_MANIFEST_IN: join(dir, 'live', 'manifest.json'),
  TRACY_SYNC_DB_BASE: join(dir, 'live', 'db.sql.gz'),
  ...extra
})
const indexed = (dir, table) =>
  JSON.parse(readFileSync(join(dir, 'live', 'db.sql.gz.index.json'), 'utf8')).parts.find(
    (p) => p.table === table
  )
const contentRows = (dir) =>
  dump(dir)
    .split('-- table `jos_content`')[1]
    .split('-- table `')[0]
    .match(/\('[^']*','[^']*'\)/g)

test('a big table that moved is read range by range: only the ranges that moved, and the rows a whole read brings', async () => {
  const site = await engine({ modern: true, fpVersion: 2, createTables: true, ranges: true })
  site.db.jos_content = Array.from({ length: 200 }, (_, i) => [i + 1, `title ${i + 1}`])
  /** The same site read whole now, with nothing kept: what each read range by range must equal. */
  const wholeNow = async (name) => {
    const dir = join(root, name)
    assert.equal((await pull(dir, site.url, SMALL_RANGES)).answer.ok, true)
    return dir
  }
  try {
    const first = join(root, 'ranges-1')
    const one = await pull(first, site.url, SMALL_RANGES)
    assert.equal(one.answer.ok, true, JSON.stringify(one.answer))
    const kept = JSON.parse(readFileSync(join(first, 'live', 'db.sql.gz.ranges.json'), 'utf8'))
    assert.deepEqual(Object.keys(kept.tables), ['jos_content'], 'the sessions move by themselves: no ranges')
    const n = kept.tables.jos_content.ranges.length
    assert.ok(n >= 10, `${n} ranges`)

    // One title edited on the live site: its range alone is asked for again.
    site.db.jos_content[149][1] = 'title 150, edited'
    site.seen.many.length = 0
    site.seen.after.length = 0
    const second = join(root, 'ranges-2')
    const two = await pull(second, site.url, sinceRead(first))
    assert.equal(two.answer.ok, true, JSON.stringify(two.answer) + two.err)
    assert.deepEqual(site.seen.many.flat(), [], 'jos_content is not read whole')
    assert.equal(site.seen.after.length, 1, JSON.stringify(site.seen.after))
    assert.match(two.err, new RegExp(`jos_content: 1 of ${n} range\\(s\\) moved, \\d+ row\\(s\\) read`))
    let whole = await wholeNow('ranges-whole-2')
    assert.equal(indexed(second, 'jos_content').digest, indexed(whole, 'jos_content').digest)
    assert.deepEqual(contentRows(second), contentRows(whole), 'row for row, in key order')
    assert.match(dump(second), /AUTO_INCREMENT=201 /, 'headed by the table as it is now')

    // A row deleted in the middle and five added at the end: two ranges, from the read before.
    site.db.jos_content.splice(29, 1)
    for (let id = 201; id <= 205; id++) site.db.jos_content.push([id, `title ${id}`])
    site.seen.many.length = 0
    site.seen.after.length = 0
    const third = join(root, 'ranges-3')
    const three = await pull(third, site.url, sinceRead(second))
    assert.equal(three.answer.ok, true, JSON.stringify(three.answer) + three.err)
    assert.deepEqual(site.seen.many.flat(), [])
    assert.match(three.err, new RegExp(`jos_content: 2 of ${n} range\\(s\\) moved`))
    whole = await wholeNow('ranges-whole-3')
    assert.equal(indexed(third, 'jos_content').digest, indexed(whole, 'jos_content').digest)
    assert.deepEqual(contentRows(third), contentRows(whole))
    assert.match(dump(third), /AUTO_INCREMENT=206 /)

    // Most of the table rewritten: one whole read costs less than many range reads.
    for (const row of site.db.jos_content) row[1] = `${row[1]} (new)`
    site.seen.many.length = 0
    const fourth = join(root, 'ranges-4')
    const four = await pull(fourth, site.url, sinceRead(third))
    assert.equal(four.answer.ok, true, JSON.stringify(four.answer))
    assert.match(four.err, /jos_content: read whole \(\d+ of \d+ ranges moved\)/)
    assert.deepEqual(site.seen.many.flat(), ['jos_content'])
    whole = await wholeNow('ranges-whole-4')
    assert.deepEqual(contentRows(fourth), contentRows(whole))
  } finally {
    site.server.close()
  }
  // An engine that does not answer ranges: the read is as before, and leaves none beside it.
  const older = await engine({ modern: true, fpVersion: 2, createTables: true })
  older.db.jos_content = Array.from({ length: 200 }, (_, i) => [i + 1, `title ${i + 1}`])
  try {
    const dir = join(root, 'ranges-none')
    assert.equal((await pull(dir, older.url, SMALL_RANGES)).answer.ok, true)
    assert.equal(existsSync(join(dir, 'live', 'db.sql.gz.ranges.json')), false)
  } finally {
    older.server.close()
  }
})

test('a range the live site writes to while it is read is never half of two moments: the table is read again whole', async () => {
  let writes = 0
  const site = await engine({
    modern: true,
    fpVersion: 2,
    createTables: true,
    ranges: true,
    // The customer saves the next article just as its range is read.
    onAfter: (table, db) => {
      if (table === 'jos_content' && writes++ === 0) db.jos_content[150][1] = 'title 151, saved meanwhile'
    }
  })
  site.db.jos_content = Array.from({ length: 200 }, (_, i) => [i + 1, `title ${i + 1}`])
  try {
    const first = join(root, 'ranges-busy-1')
    assert.equal((await pull(first, site.url, SMALL_RANGES)).answer.ok, true)
    site.db.jos_content[149][1] = 'title 150, edited'
    site.seen.many.length = 0
    const second = join(root, 'ranges-busy-2')
    const two = await pull(second, site.url, sinceRead(first))
    assert.equal(two.answer.ok, true, JSON.stringify(two.answer) + two.err)
    assert.equal(two.answer.dbRounds, 2, 'the checksum after the read saw the write')
    assert.deepEqual(site.seen.many.flat(), ['jos_content'], 'read again whole')
    const whole = join(root, 'ranges-busy-whole')
    assert.equal((await pull(whole, site.url, SMALL_RANGES)).answer.ok, true)
    assert.deepEqual(contentRows(second), contentRows(whole))
    assert.match(dump(second), /'title 151, saved meanwhile'/)
  } finally {
    site.server.close()
  }
})

test('a table the merge never takes (the engine’s undo log) is the last read’s: never read again, and alone it is no change', async () => {
  const site = await engine({ modern: true, fpVersion: 2 })
  site.db.jos_claudecowork_apply_log = [[1, 'push one']]
  const never = {
    TRACY_SYNC_IGNORED_TABLES: execFileSync(
      'python3',
      [
        join(here, '..', 'scripts', 'lib', 'live_sync.py'),
        'never-taken',
        '--platform',
        'joomla',
        '--prefix',
        'jos_'
      ],
      { encoding: 'utf8' }
    ).trim()
  }
  try {
    const first = join(root, 'never-1')
    assert.equal((await pull(first, site.url, never)).answer.ok, true)
    const since = (dir) => ({
      ...never,
      TRACY_SYNC_FINGERPRINT_IN: join(dir, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(dir, 'live', 'manifest.json'),
      TRACY_SYNC_DB_BASE: join(dir, 'live', 'db.sql.gz')
    })
    // A Sync to live wrote on the live site: the engine logged its undo, and nothing else moved.
    site.db.jos_claudecowork_apply_log.push([2, 'push two'])
    site.seen.many.length = 0
    const quiet = await pull(join(root, 'never-2'), site.url, since(first))
    assert.equal(quiet.answer.unchanged, 'fingerprint', JSON.stringify(quiet.answer))
    assert.deepEqual(site.seen.many, [], 'nothing read')
    // The customer edits an article beside another logged write: only the article's table is read,
    // the undo log is the first read's.
    site.db.jos_claudecowork_apply_log.push([3, 'push three'])
    site.db.jos_content[3][1] = 'Shop!'
    const dir = join(root, 'never-3')
    const { answer } = await pull(dir, site.url, since(first))
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.deepEqual(site.seen.many, [['jos_content']])
    const sqlText = dump(dir)
    assert.match(sqlText, /'Shop!'/)
    assert.match(sqlText, /'push one'/)
    assert.doesNotMatch(sqlText, /'push three'/, 'the undo log as the first read held it')
  } finally {
    site.server.close()
  }
})

test("Tracy's own files on the live site are never read: the engine updating itself brings nothing to read", async () => {
  const site = await engine({ modern: true, fpVersion: 2 })
  try {
    site.write('administrator/components/com_claudecowork/lib/Engine.php', '<?php // 0.24.50')
    const first = join(root, 'tracy-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    const manifest = JSON.parse(readFileSync(join(first, 'live', 'manifest.json'), 'utf8'))
    assert.equal(
      Object.keys(manifest).some((p) => p.includes('com_claudecowork')),
      false,
      'not in the manifest'
    )
    // The engine updates itself (a release with every contract), and the customer edits twelve files.
    site.write('administrator/components/com_claudecowork/lib/Engine.php', '<?php // 0.24.51')
    for (let i = 0; i < 40; i++)
      site.write(
        `administrator/components/com_claudecowork/lib/contracts/t/j6/1.0.${i}/manifest.json`,
        `{"v":${i}}`
      )
    site.write('plugins/system/claudecoworkapi/claudecoworkapi.php', '<?php // new')
    for (let i = 0; i < 12; i++) site.write(`images/gallery/photo-${i}.txt`, `photo ${i}`)
    site.seen.reads.length = 0
    site.seen.hashed.length = 0
    const dir = join(root, 'tracy-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'incremental')
    assert.equal(
      site.seen.reads.some((p) => /claudecowork/.test(p)),
      false,
      site.seen.reads.join(' ')
    )
    assert.equal(
      site.seen.hashed.some((p) => /claudecowork/.test(p)),
      false,
      'not even hashed'
    )
    assert.equal(site.seen.reads.length, 12, 'the twelve photos, read a few at a time')
    for (let i = 0; i < 12; i++)
      assert.equal(
        readFileSync(join(dir, 'live', 'changes', `images/gallery/photo-${i}.txt`), 'utf8'),
        `photo ${i}`
      )
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'live', 'deleted.json'), 'utf8')), [])
  } finally {
    site.server.close()
  }
})

test('a manifest written before Tracy paths were left out never reads them as deleted', async () => {
  const site = await engine()
  try {
    const first = join(root, 'old-man-1')
    await pull(first, site.url)
    const path = join(first, 'live', 'manifest.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest['administrator/components/com_claudecowork/claudecowork.xml'] = 'f'.repeat(40)
    writeFileSync(path, JSON.stringify(manifest))
    const { answer } = await pull(join(root, 'old-man-2'), site.url, { TRACY_SYNC_MANIFEST_IN: path })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'old-man-2', 'live', 'deleted.json'), 'utf8')), [])
  } finally {
    site.server.close()
  }
})

test('files whose fingerprint did not move are not read at all; only the database is', async () => {
  const site = await engine({ modern: true, fpVersion: 2 })
  try {
    const first = join(root, 'fu-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.db.jos_content[1][1] = 'About us'
    const lists = site.seen.listLimits.length
    const dir = join(root, 'fu-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json'),
      TRACY_SYNC_DB_BASE: join(first, 'live', 'db.sql.gz')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'files-unchanged')
    assert.equal(site.seen.listLimits.length, lists, 'no file was listed')
    assert.ok(existsSync(join(dir, 'live', 'files-unchanged.json')))
    assert.match(dump(dir), /'About us'/)
  } finally {
    site.server.close()
  }
})

test('a changed configuration.php comes in a pack cut to it, with the other changes read alone', async () => {
  const site = await engine({ modern: true, packPaths: 2000 })
  try {
    const first = join(root, 'cut-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.write(
      'configuration.php',
      "<?php class JConfig { public $sitename = 'Shop'; public $MetaDesc = 'live'; }"
    )
    site.write('templates/t4/css/custom.css', '.a { color: red }\n')
    site.seen.reads.length = 0
    site.seen.packs.length = 0
    const dir = join(root, 'cut-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'incremental', 'not the whole tree')
    assert.deepEqual(site.seen.packs, [['configuration.php']])
    assert.deepEqual(site.seen.reads, ['templates/t4/css/custom.css'])
    assert.match(readFileSync(join(dir, 'live', 'changes', 'configuration.php'), 'utf8'), /MetaDesc = 'live'/)
    // Its sha1 is the packed bytes': the next read hashes it only if it moves again.
    const manifest = JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))
    assert.equal(
      manifest['configuration.php'].sha1,
      sha1(readFileSync(join(site.webroot, 'configuration.php')))
    )
    assert.equal(existsSync(join(dir, 'live', 'cut.tar')), false)
  } finally {
    site.server.close()
  }
})

test('a protected file the manifest names without a sha1 (stat-manifest) is read, never taken as unchanged', async () => {
  // webroot-sync.sh's `stat-manifest` (a sync that read no file) names configuration.php by size and
  // mtime only: the tree holds the copy's own, at another size. The site never hashes that file, so
  // "no sha1 then, none now" is no answer — a live Site Name edit stayed off the copy on dev (24/10/2026).
  const site = await engine({ modern: true, packPaths: 2000 })
  try {
    const first = join(root, 'nosha-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    const stat = Object.fromEntries(
      Object.entries(JSON.parse(readFileSync(join(first, 'live', 'manifest.json'), 'utf8'))).map(([p, f]) => [
        p,
        p === 'configuration.php' ? { size: f.size, mtime: f.mtime } : f
      ])
    )
    writeFileSync(join(root, 'nosha-manifest.json'), JSON.stringify(stat))
    site.write('configuration.php', "<?php class JConfig { public $sitename = 'Live S6 1840'; }")
    site.seen.reads.length = 0
    site.seen.packs.length = 0
    const dir = join(root, 'nosha-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(root, 'nosha-manifest.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'incremental', 'not the whole tree')
    assert.deepEqual(site.seen.packs, [['configuration.php']])
    assert.match(readFileSync(join(dir, 'live', 'changes', 'configuration.php'), 'utf8'), /Live S6 1840/)
    // From now on it has a sha1: the next read asks about it only when it moves again.
    const manifest = JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))
    assert.equal(
      manifest['configuration.php'].sha1,
      sha1(readFileSync(join(site.webroot, 'configuration.php')))
    )
    site.seen.packs.length = 0
    const still = await pull(join(root, 'nosha-3'), site.url, {
      TRACY_SYNC_MANIFEST_IN: join(dir, 'live', 'manifest.json')
    })
    assert.equal(still.answer.ok, true, JSON.stringify(still.answer))
    assert.deepEqual(site.seen.packs, [], 'standing still, it is not read again')
  } finally {
    site.server.close()
  }
})

test('a listed file the whole tree lacks and the site will not read alone stops the read, named', async () => {
  // Never kept as "no sha1 then, none now": the manifest would carry the gap into every later read.
  const site = await engine({ modern: true, packLeavesOut: ['configuration.php'] })
  try {
    const { answer } = await pull(join(root, 'leftout-1'), site.url)
    assert.equal(answer.ok, false, JSON.stringify(answer))
    assert.match(answer.detail, /configuration\.php/)
  } finally {
    site.server.close()
  }
})

test('an engine that cannot cut a pack still reads the whole tree for a changed configuration.php', async () => {
  const site = await engine({ modern: true })
  try {
    const first = join(root, 'nocut-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.write('configuration.php', "<?php class JConfig { public $sitename = 'Shop (moved)'; }")
    site.seen.packs.length = 0
    const { answer } = await pull(join(root, 'nocut-2'), site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.mode, 'full')
    assert.deepEqual(site.seen.packs, ['whole'])
  } finally {
    site.server.close()
  }
})

test('a read whose files stood still is not listed again: the fingerprint asked again says so', async () => {
  // `onList` present, so every listing is counted.
  const site = await engine({ modern: true, fpVersion: 2, onList: () => {} })
  try {
    const first = join(root, 'still-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.write('templates/t4/css/custom.css', '.a { still }\n')
    const lists = site.seen.lists
    const fingerprints = site.seen.fingerprints
    const { answer } = await pull(join(root, 'still-2'), site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json'),
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'incremental')
    assert.equal(answer.listedAgain, false)
    assert.equal(site.seen.lists - lists, 1, 'listed once, not twice')
    // Once before the read, once after the database, once more for the files: never a listing.
    assert.equal(site.seen.fingerprints - fingerprints, 3)
  } finally {
    site.server.close()
  }
})

test('a file that moves while the others are read makes the read list again, and it is read again', async () => {
  let once = false
  const site = await engine({
    modern: true,
    fpVersion: 2,
    onRead: (path, write) => {
      if (path === 'templates/t4/css/custom.css' && !once) {
        once = true
        write('images/logo.png', Buffer.alloc(4000, 9))
      }
    }
  })
  try {
    const first = join(root, 'moving-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.write('templates/t4/css/custom.css', '.a { moving }\n')
    const dir = join(root, 'moving-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json'),
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json')
    })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.listedAgain, true)
    const manifest = JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))
    assert.equal(manifest['images/logo.png'].sha1, sha1(Buffer.alloc(4000, 9)))
    assert.deepEqual(readFileSync(join(dir, 'live', 'changes', 'images/logo.png')), Buffer.alloc(4000, 9))
  } finally {
    site.server.close()
  }
})

test('a read that finds no file moved and has no manifest lists the files by size and mtime, reading none', async () => {
  const site = await engine({ modern: true, fpVersion: 2 })
  try {
    const first = join(root, 'stat-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    site.db.jos_content[1][1] = 'About (live)'
    site.seen.reads.length = 0
    const hashed = site.seen.hashed.length
    const dir = join(root, 'stat-2')
    const { answer } = await pull(dir, site.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
      TRACY_SYNC_DB_BASE: join(first, 'live', 'db.sql.gz')
    })
    assert.equal(answer.mode, 'files-unchanged', JSON.stringify(answer))
    const stat = JSON.parse(readFileSync(join(dir, 'live', 'stat.json'), 'utf8'))
    assert.deepEqual(stat['index.php'], {
      size: statSync(join(site.webroot, 'index.php')).size,
      mtime: Math.floor(statSync(join(site.webroot, 'index.php')).mtimeMs / 1000)
    })
    assert.equal(answer.stat, Object.keys(stat).length)
    assert.deepEqual(site.seen.reads, [], 'no file read')
    assert.equal(site.seen.hashed.length, hashed, 'no file hashed')
  } finally {
    site.server.close()
  }
})

test('a manifest naming files by their tree blobs: the whole tree, when it must be read, does not read them again', async () => {
  const site = await engine({ modern: true })
  try {
    const first = join(root, 'blob-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    // What webroot-sync.sh keeps after a read that found no file moved: blobs, sizes and mtimes.
    const named = Object.fromEntries(
      Object.entries(JSON.parse(readFileSync(join(first, 'live', 'manifest.json'), 'utf8'))).map(([p, f]) => [
        p,
        { ...f, sha1: `git:${'0'.repeat(40)}` }
      ])
    )
    writeFileSync(join(root, 'blob-manifest.json'), JSON.stringify(named))
    site.write('configuration.php', "<?php class JConfig { public $sitename = 'Shop (blob)'; }")
    site.seen.reads.length = 0
    const dir = join(root, 'blob-2')
    const { answer } = await pull(dir, site.url, { TRACY_SYNC_MANIFEST_IN: join(root, 'blob-manifest.json') })
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.mode, 'full')
    assert.deepEqual(site.seen.reads, [], 'nothing read one by one after the tree')
    const manifest = JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))
    assert.equal(manifest['index.php'].sha1, sha1(readFileSync(join(site.webroot, 'index.php'))))
  } finally {
    site.server.close()
  }
})

test("Tracy's table copies on the live site (a snapshot, a trashed table) are not read, and one taken since is no change (#1649)", async () => {
  const site = await engine({ modern: true })
  site.db._tracy_snap_20261023000000__jos_content = site.db.jos_content.map((r) => [...r])
  site.db._tracy_trash_20261001000000__jos_old = [[1, 'old']]
  try {
    const first = join(root, 'copies-1')
    const a = await pull(first, site.url)
    assert.equal(a.answer.ok, true, JSON.stringify(a.answer))
    assert.deepEqual(site.seen.many, [['jos_content', 'jos_session']], 'only the site’s own tables are read')
    assert.doesNotMatch(dump(first), /_tracy_/)
    assert.equal(a.answer.tables, 2)
    // The agent takes another snapshot on the live site: nothing of the site moved.
    site.db._tracy_snap_20261023000001__jos_session = [['s1', 'x']]
    const { answer } = await pull(join(root, 'copies-2'), site.url, {
      TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
      TRACY_SYNC_MANIFEST_IN: join(first, 'live', 'manifest.json')
    })
    assert.equal(answer.unchanged, 'fingerprint', JSON.stringify(answer))
  } finally {
    site.server.close()
  }
})

test('the check alone (a Sync anyway taking a held read): whether the live site moved, nothing read (#1649)', async () => {
  const site = await engine({ modern: true })
  try {
    const first = join(root, 'check-1')
    assert.equal((await pull(first, site.url)).answer.ok, true)
    const before = gone(site)
    const ask = () =>
      pull(join(root, `check-${Math.random()}`), site.url, {
        TRACY_SYNC_CHECK_ONLY: '1',
        TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json')
      })
    assert.equal((await ask()).answer.unchanged, 'fingerprint')
    site.db.jos_content[1][1] = 'About (moved)'
    const moved = (await ask()).answer
    assert.equal(moved.ok, true)
    assert.equal(moved.unchanged, null)
    assert.deepEqual(gone(site), before, 'no table and no file was read either time')
  } finally {
    site.server.close()
  }
})

// ── a WordPress live site's own housekeeping (#1664) ──────────────────────────────────────────────

const WP_LIB = join(here, '..', 'scripts', 'lib', 'live_sync_wordpress.py')
const wpRules = (extra = {}) => ({
  TRACY_SYNC_VOLATILE_ROWS: execFileSync('python3', [WP_LIB, 'volatile-rows'], { encoding: 'utf8' }).trim(),
  TRACY_SYNC_ROW_NAMES: execFileSync('python3', [WP_LIB, 'row-names'], { encoding: 'utf8' }).trim(),
  TRACY_SYNC_IGNORED_TABLES: execFileSync('python3', [WP_LIB, 'ignored-tables', '--prefix', 'wp_'], {
    encoding: 'utf8'
  }).trim(),
  ...extra
})
/** A post as WordPress's own `wp_posts` holds it, its columns in core's order (status the 8th). */
const wpPost = (id, title, status = 'publish', content = 'Text.') => [
  id,
  1,
  '2026-10-24 01:00:00',
  '2026-10-24 01:00:00',
  content,
  title,
  '',
  status,
  'open',
  'open',
  '',
  `p-${id}`
]
/** An engine whose database is a little WordPress: posts (one with quotes and commas), meta, options, users. */
async function wpEngine(options) {
  const site = await engine(options)
  delete site.db.jos_content
  delete site.db.jos_session
  Object.assign(site.db, {
    wp_options: [
      [1, 'blogname', 'Shop'],
      [2, 'cron', 'a:0:{}'],
      [3, 'home', 'https://shop.example'],
      [4, 'theme_mods_shop', 'a:0:{}'],
      [5, '_transient_feed', 'feed']
    ],
    wp_posts: [
      wpPost(1, 'Hello'),
      wpPost(2, 'About', 'publish', "it\\'s (here), 'auto-draft', yes"),
      wpPost(3, 'Contact')
    ],
    wp_postmeta: [
      [1, 1, '_thumbnail_id', '2'],
      [2, 2, '_edit_lock', '1700000000:1']
    ],
    wp_usermeta: [
      [1, 1, 'nickname', 'owner'],
      [2, 1, 'wp_user-settings-time', '1700000000']
    ],
    wp_actionscheduler_actions: [[1, 'pending']]
  })
  return site
}

test('a WordPress site opened in wp-admin while it is read — an auto-draft, an edit lock, a cron tick, its admin settings — is no busy site', async () => {
  // What a sign-in and "Add New" leave behind, and a WP-Cron tick, landing between and DURING the
  // reads: an auto-draft made (the table's count moves while it is read), its edit lock, transients
  // set, the user's wp-admin settings, the dashboard's widget options, Action Scheduler's queue.
  let posts = 0
  let tick = 0
  const site = await wpEngine({
    onDump: (table, db, first) => {
      tick++
      if (table === 'wp_posts' && !first) {
        posts++
        db.wp_posts.push(wpPost(100 + posts, 'Auto Draft', 'auto-draft', ''))
        db.wp_postmeta.push([100 + posts, 100 + posts, '_edit_lock', `${tick}:1`])
      }
      if (table === 'wp_options') {
        db.wp_options[1][2] = `a:1:{i:${tick};}`
        db.wp_options.push([100 + tick, `_transient_timeout_x${tick}`, String(tick)])
        if (tick === 3) db.wp_options.push([99, 'dashboard_widget_options', 'a:0:{}'])
      }
      if (table === 'wp_usermeta') db.wp_usermeta[1][3] = String(tick)
      if (table === 'wp_actionscheduler_actions') db.wp_actionscheduler_actions.push([100 + tick, 'ran'])
    }
  })
  try {
    const dir = join(root, 'wp-housekeeping')
    const { answer, err } = await pull(dir, site.url, wpRules())
    assert.equal(answer.ok, true, JSON.stringify(answer) + err)
    assert.equal(answer.dbRounds, 2, 'the first two reads agree')
    assert.doesNotMatch(err, /moved while/, 'no table read again on its count')
    // The rows themselves are in the read as they were: the merge decides what comes over.
    assert.match(dump(dir), /'Auto Draft'/)
  } finally {
    site.server.close()
  }
  // Without the rules, the same site never reads the same twice.
  const plain = await wpEngine({
    onDump: (table, db) => table === 'wp_options' && (db.wp_options[1][2] = `a:1:{i:${++tick};}`)
  })
  try {
    const { answer } = await pull(join(root, 'wp-housekeeping-plain'), plain.url)
    assert.equal(answer.code, 'LIVE_BUSY')
  } finally {
    plain.server.close()
  }
})

test('a real edit that keeps landing while a WordPress site is read is busy, and the answer names it — tables and row names, never a value', async () => {
  let n = 0
  const site = await wpEngine({
    onDump: (table, db, first) => {
      if (!first) return
      if (table === 'wp_posts') db.wp_posts[0][5] = `Hello ${++n}`
      if (table === 'wp_options') db.wp_options[0][2] = `Shop secret ${n}`
      // Housekeeping moving alongside is not named: it is not what kept the site busy.
      if (table === 'wp_usermeta') db.wp_usermeta[1][3] = String(n)
    }
  })
  try {
    const { answer, err } = await pull(join(root, 'wp-busy'), site.url, wpRules())
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'LIVE_BUSY')
    assert.deepEqual(
      answer.moved.tables.map((t) => [t.table, t.rows, t.names ?? null, t.housekeeping]),
      [
        ['wp_options', 1, ['blogname'], false],
        ['wp_posts', 1, null, false]
      ]
    )
    assert.match(answer.detail, /wp_options \(blogname\); wp_posts \(1 row\)/)
    assert.match(err, /changed between two reads \(wp_options \(blogname\); wp_posts \(1 row\)\)/)
    assert.doesNotMatch(JSON.stringify(answer), /secret|Hello \d/, 'no value of the site in the answer')
    assert.doesNotMatch(err, /once more/, 'a real edit is no housekeeping: no extra read')
  } finally {
    site.server.close()
  }
})

test('rows that look like a plugin’s housekeeping but are not listed are read once more, never more', async () => {
  // A plugin's own lock written by a cron tick between each of the first four reads, then quiet.
  let reads = 0
  const quiets = await wpEngine({
    onDump: (table, db, first) => {
      if (table !== 'wp_options' || !first) return
      if (++reads <= 4) db.wp_options[3] = [4, 'myplugin_cron_lock', String(reads)]
    }
  })
  try {
    const { answer, err } = await pull(join(root, 'wp-lock-quiet'), quiets.url, wpRules())
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.dbRounds, 5, 'DB_ROUNDS reads, and one more')
    assert.match(err, /only the site's own housekeeping moved; once more/)
  } finally {
    quiets.server.close()
  }
  // The same lock that never stops: busy after that one extra read, named.
  const busy = await wpEngine({
    onDump: (table, db, first) =>
      table === 'wp_options' && first && (db.wp_options[3] = [4, 'myplugin_cron_lock', String(++reads)])
  })
  try {
    const { answer, err } = await pull(join(root, 'wp-lock-busy'), busy.url, wpRules())
    assert.equal(answer.code, 'LIVE_BUSY')
    assert.deepEqual(answer.moved.tables, [
      { table: 'wp_options', rows: 1, names: ['myplugin_cron_lock'], housekeeping: true }
    ])
    assert.equal(err.match(/once more/g)?.length, 1)
  } finally {
    busy.server.close()
  }
  // A real option moving the same way gets no extra read.
  let n = 0
  const setting = await wpEngine({
    onDump: (table, db, first) =>
      table === 'wp_options' && first && (db.wp_options[3] = [4, 'theme_mods_shop', `a:1:{i:${++n};}`])
  })
  try {
    const { answer, err } = await pull(join(root, 'wp-setting-busy'), setting.url, wpRules())
    assert.equal(answer.code, 'LIVE_BUSY')
    assert.doesNotMatch(err, /once more/)
  } finally {
    setting.server.close()
  }
})

test("with table checksums, a WordPress site's own housekeeping moving wp_options' checksum is no busy site; a real edit that keeps landing is, named by row", async () => {
  // claude-cowork 0.18.25's fingerprint version 2: CHECKSUM TABLE moves with every WP-Cron tick,
  // which rewrites `cron` and sets transients each time wp_options is read (S1 on dev, 24/10/2026).
  let tick = 0
  const quiet = await wpEngine({
    modern: true,
    fpVersion: 2,
    onDump: (table, db, first) => {
      if (table !== 'wp_options' || !first) return
      tick++
      db.wp_options[1][2] = `a:1:{i:${tick};}`
      db.wp_options.push([100 + tick, `_transient_timeout_x${tick}`, String(tick)])
    }
  })
  try {
    const dir = join(root, 'wp-fp-housekeeping')
    const { answer, err } = await pull(dir, quiet.url, wpRules())
    assert.equal(answer.ok, true, JSON.stringify(answer) + err)
    assert.equal(answer.dbCheck, 'checksum')
    assert.equal(answer.dbRounds, 2, 'wp_options read again once: both reads agree on every row that counts')
    assert.deepEqual(quiet.seen.many.slice(1), [['wp_options']], 'only wp_options read again')
    assert.match(dump(dir), /'blogname','Shop'/)
  } finally {
    quiet.server.close()
  }
  // The same ticks, and the site's title edited on every read: busy, naming the option, no value.
  let n = 0
  const busy = await wpEngine({
    modern: true,
    fpVersion: 2,
    onDump: (table, db, first) => {
      if (table !== 'wp_options' || !first) return
      n++
      db.wp_options[1][2] = `a:1:{i:${n};}`
      db.wp_options.push([100 + n, `_transient_timeout_x${n}`, String(n)])
      db.wp_options[0][2] = `Shop secret ${n}`
    }
  })
  try {
    const { answer, err } = await pull(join(root, 'wp-fp-busy'), busy.url, wpRules())
    assert.equal(answer.code, 'LIVE_BUSY', JSON.stringify(answer) + err)
    assert.deepEqual(answer.moved.tables, [
      { table: 'wp_options', rows: 1, housekeeping: false, names: ['blogname'] }
    ])
    assert.match(answer.detail, /wp_options \(blogname\)/)
    assert.doesNotMatch(JSON.stringify(answer), /secret/, 'no value of the site in the answer')
  } finally {
    busy.server.close()
  }
})

test('a WordPress site whose only moves since the last read are its own housekeeping is answered unchanged by its rows, early; a real option edit is read', async () => {
  // Its tables as MariaDB dumps them: a transient set moves `AUTO_INCREMENT`, which says nothing.
  const site = await wpEngine({ modern: true, fpVersion: 2, createTables: true })
  site.db.wp_terms = [[1, 'Uncategorized', 'uncategorized']]
  try {
    const first = join(root, 'wp-rows-first')
    const read = await pull(first, site.url, wpRules())
    assert.equal(read.answer.ok, true, JSON.stringify(read.answer))
    const since = (extra = {}) =>
      wpRules({
        TRACY_SYNC_FINGERPRINT_IN: join(first, 'live', 'fingerprint.json'),
        TRACY_SYNC_DB_BASE: join(first, 'live', 'db.sql.gz'),
        ...extra
      })
    // WP-Cron ran: `cron` rewritten, a transient set, a session token renewed — no edit.
    site.db.wp_options[1][2] = 'a:1:{i:2;}'
    site.db.wp_options.push([50, '_transient_timeout_feed', '1761300000'])
    site.db.wp_usermeta[1][3] = '1761300000'
    const many = site.seen.many.length
    const quiet = await pull(join(root, 'wp-rows-quiet'), site.url, since())
    assert.equal(quiet.answer.ok, true, JSON.stringify(quiet.answer) + quiet.err)
    assert.equal(quiet.answer.unchanged, 'rows', JSON.stringify(quiet.answer))
    assert.deepEqual(quiet.answer.compared.tables.sort(), ['wp_options', 'wp_usermeta'])
    assert.deepEqual(
      site.seen.many.slice(many).flat().sort(),
      ['wp_options', 'wp_usermeta'],
      'only the tables that moved were read'
    )
    assert.equal(existsSync(join(root, 'wp-rows-quiet', 'live', 'db.sql.gz')), false, 'no read left to merge')
    assert.ok(quiet.answer.timing.compare >= 0)
    assert.match(quiet.err, /only the site's own housekeeping: unchanged/)
    // Without the last read's dump there is nothing to compare with: the site is read.
    const noBase = await pull(join(root, 'wp-rows-nobase'), site.url, since({ TRACY_SYNC_DB_BASE: '' }))
    assert.equal(noBase.answer.unchanged, undefined, JSON.stringify(noBase.answer))
    // The customer renames the site beside another cron tick: a row of substance, the whole way.
    site.db.wp_options[0][2] = 'Shop & Co'
    site.db.wp_options[1][2] = 'a:1:{i:3;}'
    const edited = await pull(join(root, 'wp-rows-edited'), site.url, since())
    assert.equal(edited.answer.ok, true, JSON.stringify(edited.answer))
    assert.equal(edited.answer.unchanged, undefined, JSON.stringify(edited.answer))
    assert.equal(edited.answer.mode, 'files-unchanged')
    assert.match(dump(join(root, 'wp-rows-edited')), /'blogname','Shop & Co'/)
    assert.match(edited.err, /a row of substance differs: reading the site/)
    // Which row, by its name alone (never its value), in a timed line the host keeps; the cron tick beside
    // it is the site's own and not named.
    assert.match(edited.err, /^==> \[\d+s\] live read: compare: wp_options \(blogname\)$/m)
    assert.doesNotMatch(edited.err, /Shop & Co/)
    // A post edited: its table has a rule too (auto-drafts), and the post differs row by row.
    site.db.wp_options[0][2] = 'Shop'
    site.db.wp_posts[0][5] = 'Hello again'
    const asked = site.seen.many.length
    const post = await pull(join(root, 'wp-rows-post'), site.url, since())
    assert.equal(post.answer.unchanged, undefined, JSON.stringify(post.answer))
    assert.match(post.err, /wp_posts.*a row of substance differs/)
    // The rows the comparison read are the read's own: each table asked for once, not again.
    const tablesAsked = site.seen.many.slice(asked).flat()
    assert.equal(tablesAsked.filter((t) => t === 'wp_posts').length, 1, JSON.stringify(tablesAsked))
    assert.match(dump(join(root, 'wp-rows-post')), /'Hello again'/)
    // A table with no such rules moved: nothing to compare row by row, the site is read.
    site.db.wp_posts[0][5] = 'Hello'
    site.db.wp_terms[0][1] = 'News'
    const term = await pull(join(root, 'wp-rows-term'), site.url, since())
    assert.equal(term.answer.unchanged, undefined, JSON.stringify(term.answer))
    assert.doesNotMatch(term.err, /row by row/)
    assert.match(dump(join(root, 'wp-rows-term')), /'News'/)
  } finally {
    site.server.close()
  }
})

test('a WordPress meta table moved only by an edit lock is compared range by range, and a real meta edit is read from those ranges, not whole', async () => {
  const site = await wpEngine({ modern: true, fpVersion: 2, createTables: true, ranges: true })
  site.db.wp_postmeta = Array.from({ length: 200 }, (_, i) => [
    i + 1,
    i + 1,
    i % 2 ? '_edit_lock' : '_price',
    `${i}`
  ])
  try {
    const first = join(root, 'wp-ranges-1')
    const one = await pull(first, site.url, wpRules(SMALL_RANGES))
    assert.equal(one.answer.ok, true, JSON.stringify(one.answer))
    const kept = JSON.parse(readFileSync(join(first, 'live', 'db.sql.gz.ranges.json'), 'utf8'))
    assert.ok(kept.tables.wp_postmeta, Object.keys(kept.tables).join(', '))
    const since = (extra = {}) => wpRules({ ...sinceRead(first), TRACY_SYNC_MANIFEST_IN: '', ...extra })
    // wp-admin opened a post: its edit lock moved, nothing else.
    site.db.wp_postmeta[99][3] = '1761300000:1'
    site.seen.many.length = 0
    site.seen.after.length = 0
    const quiet = await pull(join(root, 'wp-ranges-quiet'), site.url, since())
    assert.equal(quiet.answer.unchanged, 'rows', JSON.stringify(quiet.answer) + quiet.err)
    assert.deepEqual(site.seen.many.flat(), [], 'wp_postmeta is not read whole to be compared')
    assert.equal(site.seen.after.length, 1)
    // A price edited: a row of substance, read from its range; the read goes on without asking again.
    site.db.wp_postmeta[100][3] = '42.50'
    site.seen.many.length = 0
    site.seen.after.length = 0
    const dir = join(root, 'wp-ranges-edited')
    const edited = await pull(dir, site.url, since())
    assert.equal(edited.answer.ok, true, JSON.stringify(edited.answer) + edited.err)
    assert.equal(edited.answer.unchanged, undefined)
    assert.deepEqual(site.seen.many.flat(), [], 'never read whole')
    assert.equal(site.seen.after.length, 1, 'its range read once, for the comparison and the read both')
    assert.match(dump(dir), /'42\.50'/)
    assert.match(dump(dir), /'1761300000:1'/)
  } finally {
    site.server.close()
  }
})

test('a table whose count keeps moving while it is read is busy and named as such, unless the site moves rows of it by itself', async () => {
  let n = 0
  const site = await engine({
    onDump: (table, db, first) => table === 'jos_content' && !first && db.jos_content.push([100 + ++n, 'New'])
  })
  try {
    const { answer } = await pull(join(root, 'count-busy'), site.url)
    assert.equal(answer.code, 'LIVE_BUSY')
    assert.deepEqual(answer.moved, {
      tables: [{ table: 'jos_content', rows: null, count: true, housekeeping: false }]
    })
  } finally {
    site.server.close()
  }
})

test('a file the site deletes between listing it and reading it is gone, not a busy site; one it will not hand out is', async () => {
  let made = false
  const site = await engine({
    // A temporary file appears in the second listing and is gone by the time it is read.
    onList: (round, write) => {
      if (round === 2 && !made) {
        made = true
        write('tmp/upload-123.part', 'partial')
      }
    },
    onRead: (path) => path === 'tmp/upload-123.part' && rmSync(join(site.webroot, path), { force: true })
  })
  try {
    const dir = join(root, 'vanished')
    const { answer } = await pull(dir, site.url)
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(
      JSON.parse(readFileSync(join(dir, 'live', 'manifest.json'), 'utf8'))['tmp/upload-123.part'],
      undefined
    )
  } finally {
    site.server.close()
  }
  const busy = await engine({
    onList: (round, write) => write('templates/t4/css/custom.css', `.a { ${round} }\n`)
  })
  try {
    const { answer } = await pull(join(root, 'files-named'), busy.url)
    assert.equal(answer.code, 'LIVE_BUSY')
    assert.deepEqual(answer.moved, { files: ['templates/t4/css/custom.css'] })
  } finally {
    busy.server.close()
  }
})
