// `cli.mjs baseline` (#419): step 0 writes the demo baseline tracy-web measured on the untouched quickstart site beside the
// contract as demo-baseline.json, which tracy-web reads first. A made-up contract and measurement; every value is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { baselineOfContract } from '../../../../apps/tracy-web/src/lib/template-kit/demo-baseline-file.js'
import { contractBaselineOf } from '../template-kit/lib/demo-baseline-file.mjs'

const CLI = fileURLToPath(new URL('../template-kit/cli.mjs', import.meta.url))
const ID = 'demo-gym/j6/2.0.0'
/** A documentation address (RFC 5737), built at run time so the public tree holds no address literal. */
const DOC_ADDRESS = [192, 0, 2, 7].join('.')

/** What the bench's baseline folder holds for a version, as `ensureBaseline` stored it. */
const measured = (over = {}) => ({
  schema: 'demo-baseline/1',
  quickstart: ID,
  source: 'host',
  measuredAt: '2026-01-02T03:04:05.000Z',
  texts: ['0123456789abcdef'],
  labels: [],
  pictures: { files: ['images/demo/coach.jpg'], shas: ['a'.repeat(64)] },
  unread: [{ path: '/index.php/blog/author/demo', why: 'answered 404' }],
  over: [
    {
      page: '/',
      width: 1440,
      side: 'dark',
      key: '#hero|h1',
      fg: [255, 255, 255],
      under: { p50: 0.1 },
      large: true
    }
  ],
  blocks: [{ page: '/', width: 390, selector: 'div#t4-hero', height: 2000 }],
  textBlocks: [],
  maps: [{ page: '/contact', width: 1440, kind: 'link', address: '12 Made Up Road, Nowhere 00000' }],
  ...over
})

test('the file keeps the demo and drops the measuring time', () => {
  const r = contractBaselineOf(measured(), { contractId: ID })
  assert.equal(r.error, null)
  assert.equal(r.doc.measuredAt, undefined)
  assert.deepEqual(Object.keys(r.doc), [
    'schema',
    'quickstart',
    'source',
    'texts',
    'labels',
    'pictures',
    'unread',
    'over',
    'blocks',
    'textBlocks',
    'maps'
  ])
  assert.deepEqual(r.doc.maps, measured().maps)
})

test('a measurement of another version, a kit stopgap, or one naming a machine is refused', () => {
  const refused = (over) => contractBaselineOf(measured(over), { contractId: ID }).error
  assert.match(refused({ quickstart: 'demo-gym/j6/1.9.0' }), /not of the contract/)
  assert.match(refused({ source: 'kit' }), /untouched site/)
  assert.match(
    refused({ pictures: { files: ['http://bench.example/images/a.jpg'], shas: [] } }),
    /absolute URL/
  )
  assert.match(refused({ unread: [{ path: '/', why: `no answer from ${DOC_ADDRESS}` }] }), /IP address/)
  assert.match(refused({ labels: ['seen 2026-01-02T03:04'] }), /timestamp/)
})

test('the command writes demo-baseline.json beside the contract, and tracy-web reads it back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-baseline-'))
  try {
    const contract = join(dir, 'contract')
    mkdirSync(contract)
    writeFileSync(join(contract, 'manifest.json'), JSON.stringify({ id: ID }))
    writeFileSync(join(dir, 'measured.json'), JSON.stringify(measured()))
    const run = spawnSync(
      process.execPath,
      [CLI, 'baseline', '--from', join(dir, 'measured.json'), '--contract', contract],
      {
        encoding: 'utf8'
      }
    )
    assert.equal(run.status, 0, run.stderr)
    assert.match(
      run.stdout,
      /demo-baseline\.json of demo-gym\/j6\/2\.0\.0: 1 texts, 1 picture files, 1 pages with no demo/
    )
    const written = JSON.parse(readFileSync(join(contract, 'demo-baseline.json'), 'utf8'))
    assert.equal(written.measuredAt, undefined)
    const read = baselineOfContract({ id: ID, dir: contract })
    assert.equal(read.state, 'read')

    writeFileSync(join(dir, 'other.json'), JSON.stringify(measured({ quickstart: 'demo-gym/j6/1.0.0' })))
    rmSync(join(contract, 'demo-baseline.json'))
    const wrong = spawnSync(
      process.execPath,
      [CLI, 'baseline', '--from', join(dir, 'other.json'), '--contract', contract],
      {
        encoding: 'utf8'
      }
    )
    assert.equal(wrong.status, 1)
    assert.match(wrong.stderr, /nothing written/)
    assert.equal(existsSync(join(contract, 'demo-baseline.json')), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
