/**
 * A `brand:<host>` build's `copy` stage against the REAL copy door of `tracy-design-inspiration`.
 *
 *   node --test packages/site/tracy-site-build-core/test/brand-copy-road.test.mjs
 *
 * Measured 29/09/2026 on a private stand: the WordPress build's `copy` stage answered
 * `404 UNKNOWN_ID` for `brand:basecamp.com` while `Brand/basecamp.com/` sat in the site folder.
 * `copy-home-via.test.mjs` pins the header the build sends; this file pins the whole road — the
 * build's client, the door's folder rule and the files the next stage reads — so the two plugins
 * cannot drift apart again without a red test.
 *
 * Two findings are pinned here:
 * 1. Without `x-dsh-allowed-folders` the door stands where dsh stands (the sites root), finds no
 *    `Brand/`, and refuses the brand by id. That was the stand's `UNKNOWN_ID`.
 * 2. A build owned by a session keeps its own snapshot of the take, and `seed` opens it by the
 *    door's file name (`brand--<host>.json`, `copyFileName`). The snapshot used to be written as
 *    `brand-<host with dots as dashes>.json`, a file nobody reads: the build would pass `copy` and
 *    stop at `seed`.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { apply } from '../../../design/tracy-design-inspiration/lib/index.js'
import { copyHomeVia } from '../src/host/host.ts'
import { copyStage, inputRootFor } from '../src/host/stages-shared.mjs'

const HOST = 'acme.example'
const ID = `brand:${HOST}`
const SLOTS = [{ id: 'h1.1', role: 'headline', words: 6, chars: 40, text: 'Acme makes things' }]

let root
let siteDir
let server
let loopback

function stream(chunks) {
  return (async function* () {
    for (const c of chunks) yield c
  })()
}

before(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'tracy-brand-copy-road-'))
  const lib = path.join(root, 'lib')
  mkdirSync(path.join(lib, 'systems', 'apple'), { recursive: true })
  writeFileSync(
    path.join(lib, 'design-catalog.json'),
    JSON.stringify({ systems: [{ id: 'apple', name: 'Apple', category: 'Test' }] })
  )
  writeFileSync(path.join(lib, 'slots.json'), JSON.stringify({ systems: { apple: { slots: SLOTS } } }))
  // The site folder a build dresses, with the brand the engine extracted into it.
  siteDir = path.join(root, 'site', 'brandwp')
  const brand = path.join(siteDir, 'Brand', HOST)
  mkdirSync(brand, { recursive: true })
  mkdirSync(path.join(siteDir, 'docs', 'agents'), { recursive: true })
  writeFileSync(
    path.join(brand, 'manifest.json'),
    JSON.stringify({ id: ID, name: 'Acme', kind: 'reference', category: 'Reference' })
  )
  writeFileSync(path.join(brand, 'artifact-slots.json'), JSON.stringify({ artifacts: { landing: SLOTS } }))

  let handler = null
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (route) => ((handler = route), () => undefined) },
    tools: { register: () => () => undefined },
    llm: {
      stream: () =>
        stream([
          {
            type: 'text-delta',
            index: 0,
            text: JSON.stringify({ title: 'Acme', slots: { 'h1.1': 'Acme' } })
          },
          { type: 'finish', reason: { kind: 'stop' } }
        ])
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) }
  }
  // No `siteDir` in the config: like the host image, the door takes its folder from the request.
  apply(ctx, {
    catalog: path.join(lib, 'design-catalog.json'),
    libraryUrl: false,
    tracyOrigin: 'http://127.0.0.1:9'
  })
  server = http.createServer((req, res) => handler.handler(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  loopback = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  server?.close()
  rmSync(root, { recursive: true, force: true })
})

const job = (extra = {}) => ({
  job: 'job-1',
  inspiration: ID,
  answers: { name: 'Acme', about: 'Makes things.' },
  ...extra
})

test('without the folder header the door cannot see the brand: UNKNOWN_ID, the stand measurement', async () => {
  const r = await copyStage({ root: siteDir, copyHome: copyHomeVia(loopback, undefined, fetch, 5) })(job())
  assert.equal(r.status, 'failed')
  assert.match(r.detail, /UNKNOWN_ID/)
})

test('with the build folder named, the brand take is written where the door keeps copy', async () => {
  const r = await copyStage({ root: siteDir, copyHome: copyHomeVia(loopback, siteDir, fetch, 5) })(job())
  assert.equal(r.status, 'done', r.detail)
  assert.ok(existsSync(path.join(siteDir, 'docs', 'agents', 'design-copy', `brand--${HOST}.json`)))
})

test("a session's build snapshots the take under the name seed opens", async () => {
  const owned = job({ ownerSessionId: 'session-1' })
  const r = await copyStage({ root: siteDir, copyHome: copyHomeVia(loopback, siteDir, fetch, 5) })(owned)
  assert.equal(r.status, 'done', r.detail)
  // The same name `seedStage` passes as `--copy` (and the seeder's `copyFileName` for extra languages).
  const seedReads = path.join(
    inputRootFor(siteDir, owned),
    'docs',
    'agents',
    'design-copy',
    `brand--${HOST}.json`
  )
  assert.ok(existsSync(seedReads), `seed opens ${path.basename(seedReads)}`)
})
