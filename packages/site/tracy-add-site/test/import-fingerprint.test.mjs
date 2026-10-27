#!/usr/bin/env node
/**
 * The live site's fingerprint the import takes before it reads (`takeFingerprint`, export.ts), for
 * the first Sync from live to compare with: against a fake engine over real HTTP.
 *
 *   node --test packages/site/tracy-add-site/test/import-fingerprint.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
let exporter

before(async () => {
  const built = await require('esbuild').build({
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

/** An engine whose `info` says `version`; two pages of files; `fingerprint` may be refused. */
async function fakeEngine({ version = 2, refuse = false } = {}) {
  const calls = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { action, params = {} } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    calls.push({ action, params })
    const json = (value) =>
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (action === 'info')
      return json({ ok: true, info: { site_fingerprint: { version, max_files: 50000 } } })
    if (action === 'site.fingerprint') {
      if (refuse) return json({ ok: false, error: 'checksum_failed' })
      const first = !params.after
      return json({
        ok: true,
        fingerprint: {
          version,
          files: {
            count: first ? 3 : 1,
            bytes: first ? 30 : 7,
            digest: (first ? 'a' : 'b').repeat(40),
            next_after: first ? 'c.php' : null
          },
          tables: params.checksums ? { jos_content: '5:123', jos_session: null } : null,
          seconds: 0
        }
      })
    }
    return json({ ok: false, error: 'unknown_action' })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    calls,
    server,
    url: `http://127.0.0.1:${server.address().port}/index.php?option=com_claudecowork&task=api.exec&format=json`
  }
}

test('an engine with substance checksums: every page, the tables once, the skipped columns named', async () => {
  const engine = await fakeEngine()
  try {
    const got = await exporter.takeFingerprint(engine.url, 't'.repeat(40))
    assert.deepEqual(got, {
      version: 1,
      pageSize: 50000,
      skip: got.skip,
      files: { count: 4, bytes: 37, pages: ['a'.repeat(40), 'b'.repeat(40)] },
      tables: { jos_content: '5:123', jos_session: null }
    })
    const pages = engine.calls.filter((c) => c.action === 'site.fingerprint').map((c) => c.params)
    assert.equal(pages.length, 2)
    assert.equal(pages[0].checksums, true)
    assert.deepEqual(pages[0].skip_columns, got.skip)
    assert.equal(pages[1].checksums, false)
    assert.equal(pages[1].after, 'c.php')
    assert.equal(pages[1].skip_columns, undefined)
    // Compared by live-pull.mjs, so taken the way it takes one: the same columns, in the same order.
    const pull = readFileSync(
      path.join(pkgRoot, '../../fleet/tracy-fleet-operation/scripts/lib/live-pull.mjs'),
      'utf8'
    )
    const literal = /const SKIP_COLUMNS = \[([\s\S]*?)\]/.exec(pull)[1]
    assert.deepEqual(
      got.skip,
      [...literal.matchAll(/'([^']+)'/g)].map((m) => m[1])
    )
  } finally {
    engine.server.close()
  }
})

test('an engine without them, or one that refuses: no fingerprint, and the import is not stopped', async () => {
  const old = await fakeEngine({ version: 1 })
  try {
    assert.equal(await exporter.takeFingerprint(old.url, 't'.repeat(40)), undefined)
    assert.equal(
      old.calls.some((c) => c.action === 'site.fingerprint'),
      false
    )
  } finally {
    old.server.close()
  }
  const refusing = await fakeEngine({ refuse: true })
  try {
    assert.equal(await exporter.takeFingerprint(refusing.url, 't'.repeat(40)), undefined)
  } finally {
    refusing.server.close()
  }
})
