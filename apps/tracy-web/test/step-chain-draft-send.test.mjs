// The transport of the draft write on a real site (#597, `step-chain-draft-send.js`) against a recording `applyAs`
// reached through the Apply door's own allowlist (`_apply-door.mjs`): every call is the run's person and setup run,
// carries the operation and payload as given, answers the plugin's answer; a refusal throws its code; a call the run
// stopped is fatal; the wiring hands the door factory this transport and keeps every apply id on the run's row.
// That `setupRun` becomes the origin `{kind: 'setup', ref}` of the site_write row: `site-write-origin.test.mjs`.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-send.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setupTurnOf } from '../src/sites/setup-moment.js'
import { draftSendOf } from '../src/step-chain-draft-send.js'
import { siteWriteOf } from '../src/step-chain-draft-site.js'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { throughDoor } from './_apply-door.mjs'
import { applyOverMemory, memorySiteDoors } from './draft-site-doors-memory.mjs'
import { blankSite, FIXED_NOW, floristPlan, openStored, runOn, snapshotOf } from './draft-write-fixtures.mjs'

const RUN = '7c1e8a52-3b9d-4f60-9a21-5d4e3c2b1a00'
const EMAIL = 'owner@larkspur-florist.example'
const SITE = 'site-larkspur-1'

/** A recording `applyAs` over a fake plugin, through the Apply door's allowlist, and `applyFor` as `app.js` has it. */
function recording(plugin = async () => ({ ok: true, id: 41 })) {
  const calls = []
  const door = throughDoor(plugin)
  const applyAs = async (email, call, { setupRun = null } = {}) => {
    calls.push(structuredClone({ email, setupRun, ...call }))
    return door(call)
  }
  return { calls, applyFor: (email, setupRun) => (call) => applyAs(email, call, { setupRun }) }
}
const failure = (promise) =>
  promise.then(
    () => assert.fail('the call passed'),
    (e) => e
  )

test('send carries one plugin call through the Apply door as the run person and setup run, and answers the answer', async () => {
  const r = recording()
  const send = draftSendOf({ apply: r.applyFor(EMAIL, RUN), siteKey: SITE })
  const payload = { apply_id: `${RUN}:menu-1:create`, kind: 'menuItem', id: 0, fields: { title: 'Bouquets' } }
  assert.deepEqual(await send('content.update', payload), { ok: true, id: 41 })
  assert.deepEqual(r.calls, [
    { email: EMAIL, setupRun: RUN, siteKey: SITE, action: 'content.update', params: payload }
  ])
  // The frame holds the webroot under this turn and closes the setup moment around the run's writes.
  assert.equal(setupTurnOf(RUN), `setup-${RUN}:1`)
})

test('a refusal throws its code: the allowlist, and the plugin', async () => {
  const r = recording(async () => ({ ok: false, code: 'NOT_FOUND', message: 'no such module' }))
  const send = draftSendOf({ apply: r.applyFor(EMAIL, RUN), siteKey: SITE })
  const refused = await failure(send('system.shell', { command: 'x' }))
  assert.ok(typeof refused.code === 'string' && refused.code !== 'NOT_FOUND', refused.code)
  assert.equal((await failure(send('content.get', { kind: 'module', id: 9 }))).code, 'NOT_FOUND')
  const silent = draftSendOf({ apply: async () => undefined, siteKey: SITE })
  assert.equal((await failure(silent('content.get', {}))).code, 'door_refused')
})

test('a call the run stopped is fatal; a throw of a live run is not', async () => {
  const stop = new AbortController()
  const throwing = async () => {
    throw new Error('connection reset')
  }
  const live = await failure(
    draftSendOf({ apply: throwing, siteKey: SITE, signal: stop.signal })('content.get', {})
  )
  assert.equal(live.fatal, undefined)
  stop.abort(new Error('the run is over'))
  const over = await failure(
    draftSendOf({ apply: throwing, siteKey: SITE, signal: stop.signal })('content.get', {})
  )
  assert.equal(over.fatal, true)
})

test('the wiring hands the door factory this transport; no factory, no Apply door or no site key is no wiring', async () => {
  const r = recording()
  const applied = []
  const seen = []
  const site = {
    siteDoors: (input) => {
      seen.push(input)
      return { marker: true }
    },
    publicFile: async (key, path) => (key === SITE ? Buffer.from(path) : null)
  }
  const ctx = { runId: RUN, siteKey: SITE, applied: (id) => applied.push(id) }
  const how = { door: { apply: r.applyFor(EMAIL, RUN) } }
  const wiring = siteWriteOf({ site }, ctx, how, {}, new Map())
  const doors = await wiring.doors(ctx)
  assert.deepEqual(Object.keys(doors).sort(), ['marker', 'presence'])
  // With no `filePresence` wired, a file's presence reads unread, never absent.
  assert.equal(await doors.presence({ path: 'images/a.jpg' }), 'unread')
  const [input] = seen
  assert.equal(input.siteKey, SITE)
  assert.deepEqual(await input.publicFile('images/a.jpg'), Buffer.from('images/a.jpg'))
  await input.send('media.upload', {
    apply_id: `${RUN}:p1:upload`,
    path: 'images/a.jpg',
    content_b64: 'AA=='
  })
  assert.deepEqual(applied, [`${RUN}:p1:upload`])
  assert.equal(r.calls[0].setupRun, RUN)
  assert.equal(r.calls[0].siteKey, SITE)
  assert.equal(siteWriteOf({ site: { publicFile: site.publicFile } }, ctx, how, {}, new Map()), null)
  assert.equal(siteWriteOf({ site }, ctx, {}, {}, new Map()), null)
  assert.equal(siteWriteOf({ site }, { runId: RUN }, how, {}, new Map()), null)
})

/** The write of the florist plan on a memory site, every door call through this transport. */
function writeThrough(memory, record) {
  const over = applyOverMemory(memory)
  const send = draftSendOf({ apply: over.applyFor(EMAIL, RUN), siteKey: SITE })
  const doors = memorySiteDoors(memory)({ send, siteKey: SITE, publicFile: null, signal: null })
  return {
    over,
    done: runDraftWrite({ plan: floristPlan, doors, record, openStored, runId: RUN, now: FIXED_NOW })
  }
}

test('the write through the transport ends as on the memory doors, every call the setup run', async () => {
  const memory = blankSite()
  const { over, done } = writeThrough(memory, {})
  assert.equal((await done).status, 'done')
  assert.ok(over.calls.every((c) => c.setupRun === RUN && c.email === EMAIL && c.siteKey === SITE))
  const reference = blankSite()
  await runOn(reference)
  assert.deepEqual(snapshotOf(memory), snapshotOf(reference))
})

test('a write that crashes at every mutating call, after or before it acts, resumes through the transport', async () => {
  const reference = blankSite()
  await runOn(reference)
  const problems = []
  for (let at = 1; at <= reference.calls; at++)
    for (const before of [false, true]) {
      const memory = blankSite({ crash: before ? { at, before } : { at } })
      const record = {}
      const first = await writeThrough(memory, record).done.then(
        () => null,
        (e) => e
      )
      const name = `call ${at}${before ? ' before' : ''}`
      if (!first?.fatal) {
        problems.push(`${name}: no crash (${first?.code ?? 'done'})`)
        continue
      }
      const again = await writeThrough(memory, record).done
      if (again.status !== 'done') problems.push(`${name}: resume ${again.status}`)
      else if (JSON.stringify(snapshotOf(memory)) !== JSON.stringify(snapshotOf(reference)))
        problems.push(`${name}: the site differs from a clean run`)
    }
  assert.deepEqual(problems, [])
})
