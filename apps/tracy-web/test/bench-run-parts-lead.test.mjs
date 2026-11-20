// Round 0 in parts with a leading part (lib/bench-run-parts.js, the planner's framed plan): the leading part is asked
// first and alone, the other parts are made from its answer (a part with nothing to write makes no call), the answers
// are merged with the leading part's last, and the fix round continues the leading part's conversation. The shared
// loop over an in-memory store and the scripted model of _agent-over-door-fake.mjs: no database, no real model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import { changeRules, invalidChangesMessage } from '../src/lib/bench-changes.js'
import { runBenchRun } from '../src/lib/bench-run-loop.js'
import { DOOR, finalReply, scriptedModel, usageOf } from './_agent-over-door-fake.mjs'

const PROMPT = Object.freeze({ text: 'You write a toy draft of notes.', sha256: 'a'.repeat(64) })
const CHANGES = '\nAnswer with only the changes that fix these failures, as {"changes": [...]}.\n'

/** The bench store's interface (lib/bench-run-store.js) in memory. */
function memoryStore() {
  const rounds = new Map()
  const turns = new Map()
  const clone = (x) => (x === undefined ? undefined : structuredClone(x))
  return {
    tables: Object.freeze({ docColumn: 'plan' }),
    rounds,
    async setProgress() {
      return true
    },
    async saveBalance() {
      return true
    },
    async cancelAsked() {
      return false
    },
    async saveRound(_pool, input) {
      const was = rounds.get(input.round) ?? {}
      const keep = (field) => (input[field] !== undefined ? clone(input[field]) : (was[field] ?? null))
      rounds.set(input.round, {
        round: input.round,
        state: input.state,
        answer: keep('answer'),
        plan: keep('plan'),
        checkResult: keep('checkResult'),
        failureList: keep('failureList'),
        changes: keep('changes'),
        reading: keep('reading'),
        error: input.error ?? null
      })
      return true
    },
    async roundsOf() {
      return [...rounds.values()].sort((a, b) => a.round - b.round).map(clone)
    },
    async saveTurn(_pool, { round, turn }) {
      const had = turns.get(turn.n)
      if (turn.state === 'dispatched') {
        if (had) return false
      } else if (had?.state !== 'dispatched') return false
      turns.set(turn.n, { ...clone(turn), round })
      return true
    },
    async saveTurnProgress() {
      return true
    },
    async abandonTurn() {
      return false
    },
    async turnCountOf(_pool, _runId, round) {
      return [...turns.values()].filter((t) => t.round === round).length
    },
    async roundSent(_pool, _runId, round, content) {
      return [...turns.values()].some(
        (t) =>
          t.round === round &&
          (t.sent ?? []).some((m) => m?.role === 'user' && isDeepStrictEqual(m.content, content))
      )
    },
    async turnsOf() {
      return [...turns.values()].sort((a, b) => a.n - b.n).map(({ round: _round, ...turn }) => clone(turn))
    }
  }
}

const rules = changeRules({
  partKinds: { note: 'id' },
  removable: ['note'],
  sections: ['notes'],
  *partArrays(draft) {
    yield ['note', 'id', draft.notes]
  },
  noun: 'draft'
})

const merged = []
const toyStep = (store) =>
  Object.freeze({
    name: 'toy-bench',
    codePrefix: 'TOY_BENCH',
    store,
    maxFixRounds: 2,
    prompt: () => PROMPT,
    checker: {
      version: 'toy-check/1',
      check: ({ doc }) => {
        const bad = (doc.notes ?? []).filter((n) => n.text === 'bad').map((n) => n.id)
        return { summary: { pass: bad.length ? 0 : 1, fail: bad.length, skip: 0 }, bad }
      },
      failureListText: (result) => result.bad.map((id) => `note ${id} says "bad"\n`).join('')
    },
    changes: {
      applyValidChanges: rules.applyValidChanges,
      oversized: () => [],
      smallEditsMessage: () => 'unused',
      invalidChangesMessage: (rejected, applied) =>
        invalidChangesMessage(rejected, applied, { noun: 'draft' })
    },
    messages: {
      changesInstruction: CHANGES,
      wholeDoc: 'Send the whole draft.\n',
      notADoc: 'Your answer is not a draft.\n'
    },
    parts: () => [
      { about: ['a'], firstUserFor: (lead) => `PART A, from the ${lead.theme} frame` },
      { about: ['b'], firstUserFor: () => null },
      { about: ['frame'], leads: true, firstUser: 'THE FRAME FIRST' }
    ],
    mergeParts: (values) => {
      merged.push(values)
      const lead = values.at(-1)
      return { notes: [...lead.notes, ...values.slice(0, -1).flatMap((v) => v?.notes ?? [])] }
    },
    prepare: async () => ({ ok: true, kit: { platform: 'joomla' }, door: DOOR }),
    agentRequest: () => ({ firstUser: 'unused', tools: [] })
  })

const row = {
  id: '00000000-0000-4000-8000-000000000009',
  harness: { retry: { attempts: 1 } },
  prompt_sha256: PROMPT.sha256,
  checker_version: 'toy-check/1',
  door: { model: DOOR.model },
  step: 'waiting',
  round: 0,
  cancel_requested_at: null
}
const reply = (value) => finalReply({ content: JSON.stringify(value), usage: usageOf({ cost: 0.1 }) })
const textOf = (m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join(''))

test('the leading part goes first and alone, the others are made from its answer, the fix round continues it', async () => {
  const store = memoryStore()
  const model = scriptedModel([
    reply({ theme: 'blue', notes: [{ id: 'n1', text: 'fine' }] }),
    reply({ notes: [{ id: 'n2', text: 'bad' }] }),
    reply({ changes: [{ note: 'n2', field: 'text', with: 'better' }] })
  ])
  let end = null
  const lease = { token: 1, finish: async (fields) => ((end = fields), true) }
  await runBenchRun(
    toyStep(store),
    { pool: null, fetchImpl: model.fetchImpl, retry: { attempts: 1 } },
    row,
    lease
  )
  assert.equal(end.status, 'succeeded', end.error)
  assert.equal(model.left(), 0)
  const users = model.requests.map((r) => r.body.messages.filter((m) => m.role !== 'system').map(textOf))
  // Round 0: the frame alone, then part A from its answer; part B had nothing to write and made no call.
  assert.deepEqual(users[0], ['THE FRAME FIRST'])
  assert.deepEqual(users[1], ['PART A, from the blue frame'])
  assert.equal(model.requests.length, 3)
  assert.deepEqual(merged[0], [
    { notes: [{ id: 'n2', text: 'bad' }] },
    {},
    { theme: 'blue', notes: [{ id: 'n1', text: 'fine' }] }
  ])
  // The fix round continues the frame's conversation, not part A's.
  assert.equal(users[2][0], 'THE FRAME FIRST')
  assert.equal(users[2].at(-1), `note n2 says "bad"\n${CHANGES}`)
  const rounds = await store.roundsOf()
  assert.deepEqual(
    rounds.at(-1).plan.notes.map((n) => n.text),
    ['fine', 'better']
  )
})

test('a leading part with no JSON object makes round 0 not a document, and no other part is asked', async () => {
  const store = memoryStore()
  const model = scriptedModel([
    finalReply({ content: 'not json' }),
    finalReply({ content: 'still not json' })
  ])
  let end = null
  const lease = { token: 1, finish: async (fields) => ((end = fields), true) }
  await runBenchRun(
    { ...toyStep(store), maxFixRounds: 0 },
    { pool: null, fetchImpl: model.fetchImpl, retry: { attempts: 1 } },
    row,
    lease
  )
  const users = model.requests.map((r) => r.body.messages.filter((m) => m.role !== 'system').map(textOf))
  assert.ok(
    users.every((u) => u[0] === 'THE FRAME FIRST'),
    'only the frame was asked'
  )
  const rounds = await store.roundsOf()
  assert.equal(rounds[0].state, 'not_a_plan')
  assert.ok(end, 'the run ended')
})
