// Fix rounds, the safe version and the cost cap of the brand bench (brand step trial bench, #320): a gate rejection goes
// back to the same conversation listing only the rejected fields, at most two fix rounds, each rejection tagged agent
// or gate fault; then, or at the 1 USD cap, code builds the safe version and marks the run with the reason.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { faultOf, NO_FILE } from '../src/brand-step/brand-rounds.js'
import { callsOf } from '../src/brand-step/brand-call-store.js'
import { toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { openKit } from '../src/site-planner/kit-source.js'
import { fileDb } from './_db.mjs'
import { brandCase, done, fakeTools, KIT_REF, runOnce, saveCall } from './_brand-bench.mjs'

const SPOTS = openKit(KIT_REF).doc.site.logoSpots.length

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

/** The invented case with the business name misspelled: the gate rejects name.value. */
const wrongName = (c) => ({ ...c.brand, name: { ...c.brand.name, value: 'Saffron Lane Pilatez' } })

test('a rejection is blamed on the gate only when the gate could not check', () => {
  assert.equal(faultOf([{ field: 'name.value', why: 'x' }]), 'agent')
  assert.equal(faultOf([NO_FILE]), 'agent')
  assert.equal(faultOf([{ field: '(kit)', why: 'x' }]), 'gate')
  assert.equal(
    faultOf([
      { field: '(brand file)', why: 'x' },
      { field: '(files)', why: 'y' }
    ]),
    'gate'
  )
  assert.equal(
    faultOf([
      { field: '(kit)', why: 'x' },
      { field: 'name.value', why: 'y' }
    ]),
    'agent'
  )
})

test(
  'a rejected file is fixed in round 1: only the rejected fields go back, in the same conversation',
  opts,
  async () => {
    const { pool } = db
    const c = await brandCase()
    const { run, model } = await runOnce(pool, c, {
      agent: [saveCall(wrongName(c)), done(), saveCall(c.brand), done()]
    })
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.outcome, 'brand-file')
    assert.deepEqual(run.brandFile, c.brand)
    assert.deepEqual(
      run.rounds.map((r) => r.state),
      ['rejected', 'accepted']
    )
    const [first, second] = run.rounds
    assert.equal(first.gateResult.ok, false)
    assert.deepEqual(
      first.sentBack.map((r) => r.field),
      ['name.value']
    )
    assert.equal(first.fault, 'agent')
    assert.deepEqual(first.attempt, wrongName(c))
    assert.equal(second.fault, null)
    // The fix message is the next user turn of the SAME conversation, naming only the rejected field.
    const msgs = model.agent.requests[2].body.messages
    const roles = msgs.map((m) => m.role)
    assert.equal(roles.filter((r) => r === 'user').length, 2)
    assert.equal(msgs.at(-1).role, 'user')
    const text = JSON.stringify(msgs.at(-1).content)
    assert.match(text, /name\.value/)
    assert.equal(text.match(/- [a-zA-Z.[\]0-9]+:/g).length, first.sentBack.length)
    assert.equal(model.agent.requests.length, 4)
  }
)

test('two fix rounds that still fail end with the safe version, marked gate', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const bad = wrongName(c)
  const { run, model } = await runOnce(pool, c, {
    agent: [saveCall(bad), done(), saveCall(bad), done(), saveCall(bad), done()]
  })
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(run.outcome, 'safe-version')
  assert.equal(run.safeVersionReason, 'gate')
  assert.deepEqual(
    run.rounds.map((r) => [r.round, r.state, r.fault]),
    [
      [0, 'rejected', 'agent'],
      [1, 'rejected', 'agent'],
      [2, 'rejected', 'agent']
    ]
  )
  // No third fix round: three agent conversations' worth of calls and no more.
  assert.equal(model.agent.requests.length, 6)
  // The safe version: the template's own accent, an initials lettermark and the name per spot, a favicon from the mark, an owner task.
  const safe = run.brandFile
  assert.equal(safe.kind, 'brand-file')
  assert.equal(safe.safeVersion.reason, 'gate')
  assert.equal(safe.colours.decision, 'kept-template')
  assert.equal(safe.colours.accent, safe.colours.replaces)
  assert.equal(safe.logo.mark.decision, 'lettermark')
  assert.equal(
    safe.logo.mark.letters,
    c.brief.brand.name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  )
  assert.equal(safe.logo.spots.length, SPOTS)
  assert.ok(safe.logo.spots.every((s) => s.shows === 'logo'))
  assert.equal(safe.favicon.png32, 'f32.png')
  assert.deepEqual(
    safe.ownerTasks.map((t) => t.kind),
    ['replace-temporary-logo']
  )
})

test('a safe version asks the tools that are code only: no model is called to build it', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const bad = wrongName(c)
  const seen = []
  const { run, model } = await runOnce(pool, c, {
    agent: [saveCall(bad), done(), saveCall(bad), done(), saveCall(bad), done()],
    tools: fakeTools({ onCall: (name) => seen.push(name) })
  })
  assert.equal(run.outcome, 'safe-version')
  assert.deepEqual(seen, [
    'name_slots',
    'set_name',
    'make_lettermark',
    'compose_logo',
    ...Array(SPOTS).fill('fit_logo'),
    'make_favicon'
  ])
  assert.equal(model.requests.length, 6)
})

test(
  'the cost cap is checked before every call: at 1 USD the agent stops and the safe version is built',
  opts,
  async () => {
    const { pool } = db
    const c = await brandCase()
    const open = (cost) =>
      toolCallReply({ calls: [['open_image', { id: 'page-home-1440' }]], usage: usageOf({ cost }) })
    const { run, model } = await runOnce(pool, c, { agent: [open(0.6), open(0.6)] })
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.outcome, 'safe-version')
    assert.equal(run.safeVersionReason, 'cost-cap')
    assert.equal(run.brandFile.safeVersion.reason, 'cost-cap')
    assert.equal(model.agent.requests.length, 2, 'the third call never went out')
    assert.equal(run.costUsd, 1.2)
    const calls = await callsOf(pool, run.id)
    assert.equal(calls.filter((x) => x.kind === 'agent').length, 2)
  }
)

test(
  'reviewer spend counts toward the cap and the reviewer is not called once the cap is reached',
  opts,
  async () => {
    const { pool } = db
    const c = await brandCase()
    const looks = toolCallReply({
      calls: [
        ['look_logo', { question: 'one' }],
        ['look_logo', { question: 'two' }]
      ],
      usage: usageOf({ cost: 0.01 })
    })
    const { run, model } = await runOnce(pool, c, {
      agent: [looks, done()],
      reviewer: [{ body: { choices: [{ message: { content: 'yes' } }], usage: { cost: 1.5 } } }]
    })
    assert.equal(model.reviewer.requests.length, 1, 'the second look was refused before it went out')
    assert.equal(run.safeVersionReason, 'cost-cap')
    assert.equal(run.cost.reviewer, 1.5)
    assert.equal(model.agent.requests.length, 1)
  }
)
