#!/usr/bin/env node
/**
 * Engine calls of the export (`exportDatabase`) against a fake engine over real HTTP: the user agent
 * they carry, a firewall answering instead of the engine, and a site that runs out of PHP resources.
 *
 * Real time, on purpose: the retry ladder waits 1 s, 2 s, 4 s, engine calls are paced about 1 s
 * apart, and the point of the `site_resource_limit` case is what happens once that ladder is exhausted.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

let exporter

before(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/host/export.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    packages: 'external',
    write: false
  })
  exporter = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

/**
 * A fake engine with one table of `rows` rows. `onCall(params, res)` may answer a call itself and
 * returns true when it did. Every call is recorded with its action, params and user agent.
 */
async function fakeEngine({ rows = 3000, onCall } = {}) {
  const calls = []
  let stored = null
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    if (req.method === 'PUT') {
      stored = body
      return void res.writeHead(200).end()
    }
    const { action, params = {} } = JSON.parse(body.toString('utf8'))
    calls.push({ action, params, userAgent: req.headers['user-agent'] })
    if (onCall?.(action, params, res)) return
    const json = (value) =>
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (action === 'db.tables') return json({ ok: true, tables: ['wp_posts'] })
    if (action === 'db.dump') {
      const from = Number(params.cursor || 0)
      const to = Math.min(rows, from + Math.min(5000, params.limit))
      const sql = `-- rows ${from}..${to}\n`
      return json({
        ok: true,
        sql_b64: Buffer.from(sql).toString('base64'),
        next_cursor: String(to),
        done: to >= rows,
        rows: to - from,
        total: rows
      })
    }
    res.writeHead(400).end('0')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    endpoint: `${base}/wp-admin/admin-ajax.php?action=claude_cowork`,
    calls,
    stored: () => stored,
    artifacts: { signPut: async () => ({ url: `${base}/store/db`, key: 'db-key' }) },
    close: () => new Promise((resolve) => server.close(resolve))
  }
}

async function withEngine(opts, run) {
  const engine = await fakeEngine(opts)
  try {
    await run(engine)
  } finally {
    await engine.close()
  }
}

async function exportFixture({ tableReply, responseFor, options = {} }) {
  const calls = []
  let stored
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    if (req.method === 'PUT') {
      stored = body
      return void res.writeHead(200).end()
    }
    const request = JSON.parse(body.toString())
    calls.push(request)
    const result =
      request.action === 'db.tables' ? tableReply : responseFor(request.action, request.params, calls)
    if (result.__status) {
      const body = result.__body ?? { ok: false, error: 'dump_failed' }
      return void res
        .writeHead(result.__status, { 'content-type': 'application/json' })
        .end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, ...result }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const result = await exporter.exportDatabase(
      `${base}/${options.platform === 'joomla' ? 'index.php' : 'wp-admin/admin-ajax.php'}`,
      'tok',
      { signPut: async () => ({ url: `${base}/store`, key: 'db' }) },
      options.onTable,
      {
        ...options,
        link: { ready: async () => {}, answeredWith() {}, failed() {} }
      }
    )
    return { result, calls, sql: gunzipSync(stored).toString() }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('every engine call carries the Tracy user agent, the same one the sign-in uses', async () => {
  await withEngine({}, async (engine) => {
    const result = await exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts)
    assert.equal(result.tables, 1)
    assert.ok(engine.calls.length >= 2)
    for (const call of engine.calls) assert.match(call.userAgent ?? '', /^Tracy\//, call.action)
  })
})

test('a ModSecurity 406 on an engine call is blocked_by_firewall, not call_failed', async () => {
  const onCall = (_action, _params, res) => {
    res
      .writeHead(406, { 'content-type': 'text/html' })
      .end('<html>This error was generated by Mod_Security.</html>')
    return true
  }
  await withEngine({ onCall }, async (engine) => {
    await assert.rejects(exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts), (error) => {
      assert.equal(error.name, 'ExportFailed')
      assert.equal(error.reason, 'blocked_by_firewall')
      assert.equal(error.detail, 'modsecurity')
      return true
    })
    assert.equal(engine.calls.length, 1, 'a firewall is not retried')
  })
})

test('a site that answers 500 above 1250 rows: the page halves until it fits, and the dump is whole', async () => {
  const onCall = (action, params, res) => {
    if (action !== 'db.dump' || params.limit <= 1250) return false
    res
      .writeHead(500, { 'content-type': 'text/html' })
      .end('<b>Fatal error</b>: Allowed memory size exhausted')
    return true
  }
  await withEngine({ rows: 3000, onCall }, async (engine) => {
    const result = await exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts)
    assert.equal(result.tables, 1)
    const limits = engine.calls.filter((c) => c.action === 'db.dump').map((c) => c.params.limit)
    assert.deepEqual(limits, [5000, 2500, 1250, 1250, 1250], 'halved twice, then kept for the rest')
    const sql = gunzipSync(engine.stored()).toString('utf8')
    assert.equal(sql, '-- rows 0..1250\n-- rows 1250..2500\n-- rows 2500..3000\n')
  })
})

test('a site that answers 500 to every page, past every retry, is site_resource_limit', async () => {
  const onCall = (action, _params, res) => {
    if (action !== 'db.dump') return false
    res.writeHead(500, { 'content-type': 'text/html' }).end('Internal Server Error')
    return true
  }
  await withEngine({ onCall }, async (engine) => {
    await assert.rejects(exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts), (error) => {
      assert.equal(error.name, 'ExportFailed')
      assert.equal(error.reason, 'site_resource_limit')
      return true
    })
    const limits = engine.calls.filter((c) => c.action === 'db.dump').map((c) => c.params.limit)
    assert.deepEqual(limits, [5000, 2500, 1250, 625], 'each retry asked for less')
  })
})

/**
 * What Cloudflare's edge answers for an origin that is down (#1616): measured on a quick tunnel whose
 * origin port refused connections — its own 502 page, never the engine's JSON.
 */
const CLOUDFLARE_BAD_GATEWAY = [
  502,
  {
    'content-type': 'text/html; charset=UTF-8',
    server: 'cloudflare',
    'cf-ray': '8d1f2e3a4b5c6d7e-AMS',
    'retry-after': '60'
  },
  readFileSync(path.join(here, 'fixtures/cloudflare-tunnel-origin-down-502.html'), 'utf8')
]

/** nginx's own 502 — what a host's proxy answers when php-fpm is overloaded or crashed. */
const NGINX_BAD_GATEWAY =
  '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n'

for (const [label, server] of [
  ['bare', 'nginx'],
  ['relayed through Cloudflare', 'cloudflare']
])
  test(`#1616: nginx's own 502 Bad Gateway (${label}), past every retry, stays site_resource_limit`, async () => {
    const onCall = (action, _params, res) => {
      if (action !== 'db.dump') return false
      res.writeHead(502, { 'content-type': 'text/html', server }).end(NGINX_BAD_GATEWAY)
      return true
    }
    await withEngine({ onCall }, async (engine) => {
      await assert.rejects(exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts), (error) => {
        assert.equal(error.reason, 'site_resource_limit')
        return true
      })
    })
  })

test('#1616: a Cloudflare 502 for a dead origin, past every retry, is site_offline, not site_resource_limit', async () => {
  const onCall = (action, _params, res) => {
    if (action !== 'db.dump') return false
    const [status, headers, body] = CLOUDFLARE_BAD_GATEWAY
    res.writeHead(status, headers).end(body)
    return true
  }
  await withEngine({ onCall }, async (engine) => {
    await assert.rejects(exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts), (error) => {
      assert.equal(error.name, 'ExportFailed')
      assert.equal(error.reason, 'site_offline')
      assert.equal(error.detail, 'cloudflare 502')
      return true
    })
    const limits = engine.calls.filter((c) => c.action === 'db.dump').map((c) => c.params.limit)
    assert.deepEqual(limits, [5000, 5000, 5000, 5000], 'retried as before, and the page is not halved')
  })
})

test('#1616: a site that sends its headers and then closes the socket mid-body is site_offline', async () => {
  const onCall = (action, _params, res) => {
    if (action !== 'db.dump') return false
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '4096' })
    res.write('{"ok":true,"sql_b64":"', () => res.socket.destroy())
    return true
  }
  await withEngine({ onCall }, async (engine) => {
    await assert.rejects(exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts), (error) => {
      assert.equal(error.name, 'ExportFailed')
      assert.equal(error.reason, 'site_offline')
      assert.equal(error.detail, 'UND_ERR_SOCKET')
      return true
    })
    const dumps = engine.calls.filter((c) => c.action === 'db.dump')
    assert.equal(dumps.length, 4, 'retried on every rung of the ladder, not stopped as a ban')
  })
})

test('#1616: a PHP fatal 500 behind Cloudflare is still site_resource_limit', async () => {
  const onCall = (action, _params, res) => {
    if (action !== 'db.dump') return false
    res
      .writeHead(500, { 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': '8d1f2e3a4b5c6d7e-AMS' })
      .end(
        '<br /><b>Fatal error</b>: Allowed memory size of 134217728 bytes exhausted (tried to allocate 20480 bytes)'
      )
    return true
  }
  await withEngine({ onCall }, async (engine) => {
    await assert.rejects(exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts), (error) => {
      assert.equal(error.reason, 'site_resource_limit')
      return true
    })
  })
})

test('filters to a site prefix and uses db.dump_many progress and cursors when advertised', async () => {
  const calls = []
  let stored
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    if (req.method === 'PUT') {
      stored = body
      return void res.writeHead(200).end()
    }
    const { action, params = {} } = JSON.parse(body.toString())
    calls.push({ action, params })
    const json = (value) =>
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (action === 'db.tables')
      return json({
        ok: true,
        prefix: 'wp_',
        tables: [
          'wp_posts',
          'wp_options',
          'wp_postmeta',
          'wp_shop_options',
          'wp_shop_posts',
          'wp_shop_postmeta',
          'other_posts'
        ]
      })
    if (action === 'db.dump_many') {
      if (params.cursor === null)
        return json({
          ok: true,
          sql_b64: Buffer.from('posts;').toString('base64'),
          next_cursor: { table: 1, row: '0' },
          done: false,
          tables_done: 1,
          progress: [{ index: 0, table: 'wp_posts', rows: 1, total: 1, done: true }]
        })
      return json({
        ok: true,
        sql_b64: Buffer.from('options;postmeta;').toString('base64'),
        next_cursor: null,
        done: true,
        tables_done: 2,
        progress: [
          { index: 1, table: 'wp_options', rows: 1, total: 1, done: true },
          { index: 2, table: 'wp_postmeta', rows: 1, total: 1, done: true }
        ]
      })
    }
    res.writeHead(400).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const progress = []
    const result = await exporter.exportDatabase(
      `${base}/wp-admin/admin-ajax.php`,
      'tok',
      { signPut: async () => ({ url: `${base}/store`, key: 'db' }) },
      (value) => progress.push(value),
      { dbDumpMany: { max_tables: 5000 }, platform: 'wordpress' }
    )
    assert.equal(result.tables, 3)
    assert.deepEqual(progress, [
      { tables: 3, table: 'wp_posts', rows: 1, done: 1 },
      { tables: 3, table: 'wp_options', rows: 1, done: 2 },
      { tables: 3, table: 'wp_postmeta', rows: 1, done: 3 }
    ])
    assert.deepEqual(
      calls.map((call) => call.action),
      ['db.tables', 'db.dump_many', 'db.dump_many']
    )
    assert.deepEqual(
      calls.filter((call) => call.action === 'db.dump_many').map((call) => call.params.tables),
      [
        ['wp_posts', 'wp_options', 'wp_postmeta'],
        ['wp_posts', 'wp_options', 'wp_postmeta']
      ]
    )
    assert.deepEqual(
      calls.filter((call) => call.action === 'db.dump_many').map((call) => call.params.cursor),
      [null, { table: 1, row: '0' }]
    )
    assert.equal(gunzipSync(stored).toString(), 'posts;options;postmeta;')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('prefix filtering covers Joomla, WordPress single, multisite, nested sites, plugin tables, and legacy engines', async () => {
  const cases = [
    {
      platform: 'joomla',
      reply: {
        prefix: 'jos_',
        tables: [
          'jos_content',
          'jos_extensions',
          'jos_menu',
          'jos_assets',
          'jos_shop_extensions',
          'jos_shop_content',
          'jos_shop_menu',
          'jos_shop_assets',
          'other_content'
        ]
      },
      expected: ['jos_content', 'jos_extensions', 'jos_menu', 'jos_assets']
    },
    {
      platform: 'wordpress',
      reply: { prefix: 'wp_', tables: ['wp_options', 'wp_posts', 'wp_postmeta', 'other_posts'] },
      expected: ['wp_options', 'wp_posts', 'wp_postmeta']
    },
    {
      platform: 'wordpress',
      reply: {
        prefix: 'wp_',
        base_prefix: 'wp_',
        tables: [
          'wp_options',
          'wp_posts',
          'wp_postmeta',
          'wp_blogs',
          'wp_2_options',
          'wp_2_posts',
          'wp_2_postmeta'
        ]
      },
      expected: [
        'wp_options',
        'wp_posts',
        'wp_postmeta',
        'wp_blogs',
        'wp_2_options',
        'wp_2_posts',
        'wp_2_postmeta'
      ]
    },
    {
      platform: 'wordpress',
      reply: {
        prefix: 'wp_2_',
        base_prefix: 'wp_',
        tables: ['wp_options', 'wp_posts', 'wp_postmeta', 'wp_2_options', 'wp_2_posts', 'wp_2_postmeta']
      },
      expected: ['wp_options', 'wp_posts', 'wp_postmeta', 'wp_2_options', 'wp_2_posts', 'wp_2_postmeta']
    },
    {
      platform: 'wordpress',
      reply: {
        prefix: 'wp_',
        base_prefix: 'wp_',
        tables: [
          'wp_options',
          'wp_posts',
          'wp_postmeta',
          'wp_shop_options',
          'wp_shop_posts',
          'wp_shop_postmeta',
          'wp_wpforms_options',
          'wp_wpforms_logs'
        ]
      },
      expected: ['wp_options', 'wp_posts', 'wp_postmeta', 'wp_wpforms_options', 'wp_wpforms_logs']
    },
    {
      platform: 'wordpress',
      reply: { tables: ['wp_options', 'other_posts'] },
      expected: ['wp_options', 'other_posts']
    }
  ]
  for (const { platform, reply, expected } of cases) {
    const { calls } = await exportFixture({
      tableReply: reply,
      responseFor: (action) =>
        action === 'db.dump' ? { sql_b64: '', next_cursor: '1', done: true, rows: 0, total: 0 } : {},
      options: { platform }
    })
    assert.deepEqual(
      calls.filter((call) => call.action === 'db.dump').map((call) => call.params.table),
      expected
    )
  }
})

test('db.dump_many honors max_tables, resumes byte/time budgets and a stopped error without repeating SQL', async () => {
  const progress = []
  const many = []
  const { calls, sql } = await exportFixture({
    tableReply: { prefix: 'wp_', tables: ['wp_posts', 'wp_options'] },
    options: {
      platform: 'wordpress',
      dbDumpMany: { max_tables: 1 },
      onTable: (entry) => progress.push(entry)
    },
    responseFor: (action, params) => {
      assert.equal(action, 'db.dump_many')
      many.push(params)
      if (params.tables[0] === 'wp_posts' && params.cursor === null)
        return {
          sql_b64: Buffer.from('posts-a;').toString('base64'),
          next_cursor: { table: 0, row: '1' },
          done: false,
          stopped: 'bytes',
          progress: [{ index: 0, table: 'wp_posts', rows: 1, total: 2, done: false }]
        }
      if (params.tables[0] === 'wp_posts')
        return {
          sql_b64: Buffer.from('posts-b;').toString('base64'),
          next_cursor: null,
          done: true,
          stopped: 'done',
          progress: [{ index: 0, table: 'wp_posts', rows: 1, total: 2, done: true }]
        }
      if (params.cursor === null)
        return {
          sql_b64: Buffer.from('options-a;').toString('base64'),
          next_cursor: { table: 0, row: '1' },
          done: false,
          stopped: 'time',
          progress: [{ index: 0, table: 'wp_options', rows: 1, total: 2, done: false }]
        }
      if (params.cursor.row === '1')
        return {
          sql_b64: Buffer.from('options-b;').toString('base64'),
          next_cursor: { table: 0, row: '2' },
          done: false,
          stopped: 'error',
          progress: []
        }
      return {
        sql_b64: Buffer.from('options-c;').toString('base64'),
        next_cursor: null,
        done: true,
        stopped: 'done',
        progress: [{ index: 0, table: 'wp_options', rows: 1, total: 3, done: true }]
      }
    }
  })
  assert.deepEqual(
    many.map((params) => params.tables),
    [['wp_posts'], ['wp_posts'], ['wp_options'], ['wp_options'], ['wp_options']]
  )
  assert.deepEqual(
    many.map((params) => params.cursor),
    [null, { table: 0, row: '1' }, null, { table: 0, row: '1' }, { table: 0, row: '2' }]
  )
  assert.equal(sql, 'posts-a;posts-b;options-a;options-b;options-c;')
  assert.deepEqual(progress, [
    { tables: 2, table: 'wp_posts', rows: 2, done: 1 },
    { tables: 2, table: 'wp_options', rows: 3, done: 2 }
  ])
  assert.equal(calls.filter((call) => call.action === 'db.dump_many').length, 5)
})

test('db.dump_many SQL and progress match db.dump for the same fake rows; missing capability falls back', async () => {
  const legacyProgress = []
  const modernProgress = []
  const legacy = await exportFixture({
    tableReply: { tables: ['wp_posts'] },
    responseFor: (action, params) => {
      assert.equal(action, 'db.dump')
      if (params.cursor === '')
        return {
          sql_b64: Buffer.from('INSERT 1;').toString('base64'),
          next_cursor: '1',
          done: false,
          rows: 1,
          total: 2
        }
      return {
        sql_b64: Buffer.from('INSERT 2;').toString('base64'),
        next_cursor: '2',
        done: true,
        rows: 1,
        total: 2
      }
    },
    options: { platform: 'wordpress', onTable: (entry) => legacyProgress.push(entry) }
  })
  const modern = await exportFixture({
    tableReply: { tables: ['wp_posts'] },
    responseFor: (action, params) => {
      assert.equal(action, 'db.dump_many')
      if (params.cursor === null)
        return {
          sql_b64: Buffer.from('INSERT 1;').toString('base64'),
          next_cursor: { table: 0, row: '1' },
          done: false,
          stopped: 'bytes',
          progress: [{ index: 0, table: 'wp_posts', rows: 1, total: 2, done: false }]
        }
      return {
        sql_b64: Buffer.from('INSERT 2;').toString('base64'),
        next_cursor: null,
        done: true,
        stopped: 'done',
        progress: [{ index: 0, table: 'wp_posts', rows: 1, total: 2, done: true }]
      }
    },
    options: {
      platform: 'wordpress',
      dbDumpMany: { max_tables: 5000 },
      onTable: (entry) => modernProgress.push(entry)
    }
  })
  assert.equal(modern.sql, legacy.sql)
  assert.deepEqual(modernProgress, legacyProgress)
  assert.deepEqual(
    modern.calls.map((call) => call.action),
    ['db.tables', 'db.dump_many', 'db.dump_many']
  )
  assert.deepEqual(
    legacy.calls.map((call) => call.action),
    ['db.tables', 'db.dump', 'db.dump']
  )
})

test('db.dump_many dump_failed is a table error and is not retried', async () => {
  const limits = []
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress', dbDumpMany: { max_tables: 5000 } },
      responseFor: (_action, params) => {
        limits.push(params.limit)
        return { ok: false, error: 'dump_failed', message: 'Unknown column' }
      }
    }),
    (error) => error.reason === 'call_failed'
  )
  assert.deepEqual(limits, [5000])
})

test('db.dump_many site 5xx retries and halves the row limit', async () => {
  const limits = []
  const { sql } = await exportFixture({
    tableReply: { tables: ['wp_posts'] },
    options: { platform: 'wordpress', dbDumpMany: { max_tables: 5000 } },
    responseFor: (_action, params) => {
      limits.push(params.limit)
      if (params.limit > 1250) return { __status: 500, __body: '<html>memory exhausted</html>' }
      return {
        sql_b64: Buffer.from('complete;').toString('base64'),
        next_cursor: null,
        done: true,
        stopped: 'done',
        progress: [{ index: 0, table: 'wp_posts', rows: 1, total: 1, done: true }]
      }
    }
  })
  assert.deepEqual(limits, [5000, 2500, 1250])
  assert.equal(sql, 'complete;')
})

test('legacy db.dump dump_failed is call_failed after one dump call', async () => {
  const calls = []
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress' },
      responseFor: (action) => {
        calls.push(action)
        return { ok: false, error: 'dump_failed', message: 'Unknown column' }
      }
    }),
    (error) => error.reason === 'call_failed'
  )
  assert.deepEqual(calls, ['db.dump'])
})

test('PHP 8.5 notices printed before each engine reply (curl_close deprecated) do not stop the export', async () => {
  // What PHP 8.5 prints with display_errors on, measured with php:8.5-cli (28/10/2026).
  const NOTICE =
    '<br />\n<b>Deprecated</b>:  Function curl_close() is deprecated since 8.5, as it has no effect since PHP 8.0 in <b>/home/u1/public_html/wp-content/plugins/claude-cowork/lib/Uploader.php</b> on line <b>53</b><br />\n'
  const onCall = (action, params, res) => {
    if (action !== 'db.dump') return false
    const sql = '-- all rows\n'
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      NOTICE +
        JSON.stringify({
          ok: true,
          sql_b64: Buffer.from(sql).toString('base64'),
          next_cursor: '3',
          done: true,
          rows: 3,
          total: 3
        })
    )
    return true
  }
  await withEngine({ rows: 3, onCall }, async (engine) => {
    const result = await exporter.exportDatabase(engine.endpoint, 'tok', engine.artifacts)
    assert.equal(result.tables, 1)
    assert.match(gunzipSync(engine.stored()).toString(), /-- all rows/)
  })
})

test('call_failed keeps where it stopped, from closed sets: the call, the status, what came back or the engine’s code', async () => {
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress' },
      responseFor: () => ({ __status: 200, __body: '<!DOCTYPE html><html><body>Please wait…</body></html>' })
    }),
    (error) => {
      assert.equal(error.reason, 'call_failed')
      assert.deepEqual(error.diagnostic, {
        at: 'export',
        check: 'no_engine_reply',
        status: 200,
        action: 'db.dump',
        answer: 'html'
      })
      assert.match(error.detail, /db\.dump answered 200 without an engine reply/)
      return true
    }
  )
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress' },
      responseFor: () => ({ ok: false, error: 'dump_failed', message: 'Unknown column' })
    }),
    (error) => {
      assert.deepEqual(error.diagnostic, {
        at: 'export',
        check: 'engine_refused',
        status: 200,
        action: 'db.dump',
        engine_error: 'dump_failed'
      })
      return true
    }
  )
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress' },
      responseFor: () => ({ ok: false, error: 'hunter2', message: 'x' })
    }),
    (error) => error.diagnostic?.engine_error === 'other'
  )
})

test('db.dump_many dump_failed is call_failed without retrying', async () => {
  const calls = []
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress', dbDumpMany: { max_tables: 5000 } },
      responseFor: (action, params) => {
        calls.push({ action, params })
        return { ok: false, error: 'dump_failed', message: 'Unknown column' }
      }
    }),
    (error) => error.reason === 'call_failed'
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].action, 'db.dump_many')
})

test('stopped error resumes at its cursor and completes without repeating SQL', async () => {
  const cursors = []
  const { sql } = await exportFixture({
    tableReply: { tables: ['wp_posts'] },
    options: { platform: 'wordpress', dbDumpMany: { max_tables: 5000 } },
    responseFor: (_action, params) => {
      cursors.push(params.cursor)
      if (cursors.length === 1)
        return {
          sql_b64: Buffer.from('first;').toString('base64'),
          next_cursor: { table: 0, row: '1' },
          done: false,
          stopped: 'bytes'
        }
      if (cursors.length === 2)
        return {
          sql_b64: Buffer.from('partial;').toString('base64'),
          next_cursor: { table: 0, row: '1' },
          done: false,
          stopped: 'error'
        }
      return {
        sql_b64: Buffer.from('resumed;').toString('base64'),
        next_cursor: null,
        done: true,
        stopped: 'done'
      }
    }
  })
  assert.deepEqual(cursors, [null, { table: 0, row: '1' }, { table: 0, row: '1' }])
  assert.equal(sql, 'first;partial;resumed;')
})

test('repeated stopped error at the same cursor ends after two calls', async () => {
  const cursors = []
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress', dbDumpMany: { max_tables: 5000 } },
      responseFor: (_action, params) => {
        cursors.push(params.cursor)
        return {
          sql_b64: Buffer.from('partial;').toString('base64'),
          next_cursor: { table: 0, row: '1' },
          done: false,
          stopped: 'error'
        }
      }
    }),
    (error) => error.reason === 'call_failed'
  )
  assert.deepEqual(cursors, [null, { table: 0, row: '1' }])
})

test('stopped error followed by first-page dump_failed ends as call_failed', async () => {
  const calls = []
  await assert.rejects(
    exportFixture({
      tableReply: { tables: ['wp_posts'] },
      options: { platform: 'wordpress', dbDumpMany: { max_tables: 5000 } },
      responseFor: (_action, params) => {
        calls.push(params.cursor)
        if (calls.length === 1)
          return {
            sql_b64: Buffer.from('partial;').toString('base64'),
            next_cursor: { table: 0, row: '1' },
            done: false,
            stopped: 'error'
          }
        return { ok: false, error: 'dump_failed', message: 'Unknown column' }
      }
    }),
    (error) => error.reason === 'call_failed'
  )
  assert.deepEqual(calls, [null, { table: 0, row: '1' }])
})
