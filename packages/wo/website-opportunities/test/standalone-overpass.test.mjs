// `OVERPASS_URL`: a self-hoster points OpenStreetMap search at their own Overpass instead of the public ones, which
// rate-limit busy addresses (a stranger's test run on 24/10/2026 got 429/504 from all four).
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { readStandaloneConfig } from '../src/standalone/config.js'
import { startStandaloneServer } from '../src/standalone/server.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const OWN = 'https://overpass.example.org/api/interpreter'
const quiet = { info() {}, warn() {}, error() {}, log() {} }
const OVERPASS = {
  elements: [
    { type: 'node', id: 7, lat: 38.71, lon: -9.137, tags: { name: 'Tasca do Bairro', amenity: 'restaurant' } }
  ]
}

let scratch
let dataDir
let running
const fetched = []

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  scratch = await scratchDatabase()
  dataDir = await mkdtemp(join(tmpdir(), 'wo-overpass-'))
  running = await startStandaloneServer({
    env: { DATABASE_URL: scratch.url, PORT: '0', DATA_DIR: dataDir, OVERPASS_URL: OWN },
    fetchImpl: async (input) => {
      const href = String(input instanceof Request ? input.url : input)
      fetched.push(href)
      return href === OWN ? Response.json(OVERPASS) : new Response('busy', { status: 429 })
    },
    resolve: async () => [{ address: '2606:4700:4700::1111', family: 6 }],
    log: quiet
  })
})

after(async () => {
  await running?.close()
  await scratch?.close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('an area search asks the Overpass OVERPASS_URL names, and only it', opts, async () => {
  const res = await fetch(`${running.url}/api/website-opportunities/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lat: 38.71, lon: -9.137, radiusM: 1000 })
  })
  const body = await res.json()
  assert.equal(res.status, 200, JSON.stringify(body))
  assert.deepEqual(
    (body.candidates ?? body.places ?? []).map((c) => c.name),
    ['Tasca do Bairro']
  )
  assert.deepEqual(
    fetched.filter((h) => /overpass|interpreter/.test(h)),
    [OWN]
  )
})

test('OVERPASS_URL must be an http(s) address', () => {
  assert.throws(
    () => readStandaloneConfig({ DATABASE_URL: 'postgres://x/y', OVERPASS_URL: 'overpass.local' }),
    /OVERPASS_URL/
  )
})
