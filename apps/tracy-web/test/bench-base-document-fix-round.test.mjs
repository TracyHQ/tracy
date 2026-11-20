// A fix round whose round 0 was written by code, not by a model (the copy step's base copy, #705): its conversation has
// no turn, so it opens with the step's first message, the document so far and the failure list in one message, edits
// that document, and the next fix round continues that conversation (lib/bench-run-loop.js fixOpening). Before, the
// agent opened the empty conversation with the first message alone and the failure list was never sent. The shared
// loop over an in-memory store and the scripted model of _agent-over-door-fake.mjs: no database, no real model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import { changeRules, invalidChangesMessage } from '../src/lib/bench-changes.js'
import { BASE_DOCUMENT_INTRO, fixOpening, runBenchRun } from '../src/lib/bench-run-loop.js'
import { DOOR, finalReply, scriptedModel, usageOf } from './_agent-over-door-fake.mjs'

const PROMPT = Object.freeze({ text: 'You write a toy draft of notes.', sha256: 'a'.repeat(64) })
const CHANGES = '\nAnswer with only the changes that fix these failures, as {"changes": [...]}.\n'
const BASE = Object.freeze({
  notes: [
    { id: 'n1', text: 'fine' },
    { id: 'n2', text: 'bad' },
    { id: 'n3', text: 'bad' }
  ]
})

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

/** A toy step whose round 0 is the base document when the run has one (as the writer's mergeTurns with a base copy). */
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
    nextTurn: ({ row, answers }) => (row.harness.base && answers.length === 0 ? null : 'Write the draft.'),
    mergeTurns: (answers, { row }) => (answers.length === 0 ? row.harness.base : answers[0]),
    prepare: async () => ({ ok: true, kit: { platform: 'joomla' }, door: DOOR }),
    agentRequest: () => ({ firstUser: 'Write the draft.', tools: [] })
  })

const row = {
  id: '00000000-0000-4000-8000-000000000007',
  harness: { retry: { attempts: 1 }, base: BASE },
  prompt_sha256: PROMPT.sha256,
  checker_version: 'toy-check/1',
  door: { model: DOOR.model },
  step: 'waiting',
  round: 0,
  cancel_requested_at: null
}

const reply = (value) => finalReply({ content: JSON.stringify(value), usage: usageOf({ cost: 0.1 }) })
const textOf = (m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join(''))

test('a fix round after a round 0 written by code opens with the document so far and its failure list; the next fix round continues it', async () => {
  const store = memoryStore()
  // Fix round 1 corrects n2 only; fix round 2 corrects n3.
  const model = scriptedModel([
    reply({ changes: [{ note: 'n2', field: 'text', with: 'better' }] }),
    reply({ changes: [{ note: 'n3', field: 'text', with: 'clearer' }] })
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
  assert.equal(model.requests.length, 2, 'round 0 made no call; each fix round made one')

  // Fix round 1: one user message, the first message, the base document and the failure list with the instruction.
  const first = model.requests[0].body.messages.filter((m) => m.role !== 'system')
  assert.equal(first.length, 1)
  assert.equal(
    textOf(first[0]),
    `Write the draft.\n\n${BASE_DOCUMENT_INTRO}\n\n${JSON.stringify(BASE)}\n\nnote n2 says "bad"\nnote n3 says "bad"\n${CHANGES}`
  )
  // Fix round 2 continues that conversation: the opening, the answer of round 1, then its own failure list.
  const second = model.requests[1].body.messages.filter((m) => m.role !== 'system')
  assert.deepEqual(
    second.map((m) => m.role),
    ['user', 'assistant', 'user']
  )
  assert.equal(textOf(second[0]), textOf(first[0]))
  assert.equal(textOf(second[2]), `note n3 says "bad"\n${CHANGES}`)

  // The changes went onto the base document, not onto a new draft.
  const rounds = await store.roundsOf()
  assert.deepEqual(rounds.at(-1).plan, {
    notes: [
      { id: 'n1', text: 'fine' },
      { id: 'n2', text: 'better' },
      { id: 'n3', text: 'clearer' }
    ]
  })
})

test('a call with a conversation, a first call and a call with no document keep their first message and follow-up', () => {
  const turn = { n: 0, state: 'answered' }
  assert.deepEqual(fixOpening({ firstUser: 'F', followUp: 'U', base: BASE, conversation: [turn] }), {
    firstUser: 'F',
    followUp: 'U'
  })
  assert.deepEqual(fixOpening({ firstUser: 'F', base: BASE, conversation: [] }), {
    firstUser: 'F',
    followUp: undefined
  })
  assert.deepEqual(fixOpening({ firstUser: 'F', followUp: 'U', base: null, conversation: [] }), {
    firstUser: 'F',
    followUp: 'U'
  })
  // A first message in parts (text and pictures) gets the document and the follow-up as one more text part.
  const parts = [
    { type: 'text', text: 'F' },
    { type: 'image_url', image_url: { url: 'data:x' } }
  ]
  const opened = fixOpening({ firstUser: parts, followUp: 'U', base: { a: 1 }, conversation: [] })
  assert.equal(opened.followUp, undefined)
  assert.deepEqual(opened.firstUser.slice(0, 2), parts)
  assert.equal(opened.firstUser[2].text, `\n\n${BASE_DOCUMENT_INTRO}\n\n{"a":1}\n\nU`)
})
