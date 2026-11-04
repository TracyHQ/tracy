// The write step bench's command line (ADR 0044), site creator part: create-site, site-status, site-list. The site door and the
// run store are fakes; the kit is a made-up one read from a temporary contract folder.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step/bench-site-cli.js'
import { fakeClock, fakeDoor, kitIndex, memoryStore } from './_write-step-bench.mjs'

const kits = kitIndex()
const newer = kitIndex({ contract: 'demo-gym/j6/9.9.9' })
after(() => {
  kits.done()
  newer.done()
})

async function cli(argv, { door = fakeDoor(), store = memoryStore(), index = kits.index } = {}) {
  const out = []
  const err = []
  const made = []
  const clock = fakeClock()
  const code = await runCli(argv, {
    store,
    index,
    makeDoor: (input) => (made.push(input), door),
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    now: clock.now,
    sleep: clock.sleep,
    pollMs: 1000
  })
  return { code, out, err, made, door, store }
}

test('create-site prints the site, the creation time and the confirmed contract', async () => {
  const { code, out, made, door } = await cli([
    'create-site',
    '--kit',
    'demo-gym/j6/1.2.3',
    '--account',
    'bench@example.test'
  ])
  assert.equal(code, 0)
  assert.match(out[0], /^write-bench-[a-z0-9]+\.sites\.example$/)
  assert.match(out[1], /^creation time 1\.0 s /)
  assert.equal(out[2], 'contract demo-gym/j6/1.2.3 confirmed by content.contract inspect')
  assert.deepEqual(made, [{ account: 'bench@example.test', platform: 'joomla' }])
  assert.equal(door.calls.find(([k]) => k === 'create')[1].quickstart, 'demo-gym/j6')
})

test('a kit naming another version is checked against that version: nothing is pinned in the command', async () => {
  const { code, err } = await cli(
    ['create-site', '--kit', 'demo-gym/j6/9.9.9', '--account', 'a@example.test'],
    {
      index: newer.index
    }
  )
  assert.equal(code, 1)
  assert.match(err[0], /CONTRACT_MISMATCH/)
  assert.match(err[0], /demo-gym\/j6\/9\.9\.9/)
  assert.match(err[0], /demo-gym\/j6\/1\.2\.3/)
})

test('an unknown kit is refused with the readable ones named', async () => {
  const { code, err } = await cli(['create-site', '--kit', 'nope/j6/1.0.0', '--account', 'a@example.test'])
  assert.equal(code, 1)
  assert.match(err[0], /demo-gym\/j6\/1\.2\.3/)
})

test('a second create-site names the previous site it removed', async () => {
  const store = memoryStore()
  await cli(['create-site', '--kit', 'demo-gym/j6/1.2.3', '--account', 'a@example.test'], { store })
  const first = store.rows[0].siteKey
  // The second run gets a later label, as it would a minute later.
  store.rows[0].label = 'write-bench-first01'
  store.rows[0].siteKey = 'write-bench-first01.sites.example'
  const second = await cli(['create-site', '--kit', 'demo-gym/j6/1.2.3', '--account', 'a@example.test'], {
    store
  })
  assert.equal(second.code, 0)
  assert.ok(second.out.includes('removed the previous bench site write-bench-first01.sites.example'))
  assert.ok(first)
})

test('site-status and site-list read the record; usage errors exit 2', async () => {
  const store = memoryStore()
  await cli(['create-site', '--kit', 'demo-gym/j6/1.2.3', '--account', 'a@example.test'], { store })
  const status = await cli(['site-status'], { store })
  assert.equal(status.code, 0)
  assert.match(status.out[0], /ready/)
  assert.equal((await cli(['site-status', 'missing'], { store })).code, 1)
  assert.equal((await cli(['site-list'], { store })).out.length, 1)
  assert.equal((await cli(['create-site', '--kit', 'x'])).code, 2)
  assert.equal((await cli([])).code, 2)
  assert.equal((await cli(['site-list', '--limit', '0'])).code, 2)
})
