// The build store contract (#612): the durable store over Postgres (`build-draft/site-builds.js`) answers every call of
// the interface `step-chain-draft-builds.js` publishes exactly as its memory store does. Each scenario runs on both
// stores and compares every answer, so a difference shows as the call where they part. Invented data only.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-builds-contract.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { siteBuildStore } from '../src/build-draft/site-builds.js'
import { BUILD_STORE_METHODS, memoryBuildStore, missingBuildMethods } from '../src/step-chain-draft-builds.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const A = { siteKey: 'larkfen-racquets.example' }
const B = { siteKey: 'meadowlight-flowers.example' }
const build = (ref, previous = null) => ({
  ref,
  previous,
  pages: [{ id: 'page-home', written: [`home of ${ref}`] }]
})

/** Run `scenario(store, say)` on both stores; `say(label, answer)` records each answer to compare. */
async function bothAnswer(scenario) {
  const answers = {}
  for (const [name, store] of [
    ['memory', memoryBuildStore()],
    ['postgres', siteBuildStore(db.pool)]
  ]) {
    const said = []
    await scenario(store, (label, value) => said.push([label, value]))
    answers[name] = said
  }
  assert.deepEqual(answers.postgres, answers.memory)
  return answers.memory
}

test('both stores answer the whole interface', opts, () => {
  assert.deepEqual(missingBuildMethods(siteBuildStore(db.pool)), [])
  assert.deepEqual(missingBuildMethods(memoryBuildStore()), [])
  assert.ok(BUILD_STORE_METHODS.includes('forget'))
})

test('keep compares then sets, per site; read and current follow', opts, async () => {
  const said = await bothAnswer(async (s, say) => {
    say('blank current', await s.current(A))
    say('blank read', await s.read('run-1', A))
    say('first keep, wrong expected', await s.keep(build('run-1'), A, { expected: 'run-0' }))
    say('first keep', await s.keep(build('run-1'), A, { expected: null }))
    say('current', await s.current(A))
    say('read', await s.read('run-1', A))
    say('other site untouched', await s.current(B))
    say('other site cannot read it', await s.read('run-1', B))
    say('stale keep', await s.keep(build('run-2', 'run-1'), A, { expected: null }))
    say('revision keep', await s.keep(build('run-2', 'run-1'), A, { expected: 'run-1' }))
    say('earlier build stays', await s.read('run-1', A))
    // A restore keeps the earlier build again under its own ref.
    say('restore keep', await s.keep(build('run-1'), A, { expected: 'run-2' }))
    say('current after restore', await s.current(A))
    say('keep without expected', await s.keep(build('run-3', 'run-1'), A))
    say('current after unchecked keep', await s.current(A))
  })
  assert.equal(said.find(([l]) => l === 'revision keep')[1], true)
})

test('two keeps at once: exactly one wins on both stores', opts, async () => {
  await bothAnswer(async (s, say) => {
    await s.keep(build('run-1'), A, { expected: null })
    const both = await Promise.all([
      s.keep(build('run-2a', 'run-1'), A, { expected: 'run-1' }),
      s.keep(build('run-2b', 'run-1'), A, { expected: 'run-1' })
    ])
    say('one won', both.filter(Boolean).length)
    say('current is a winner', ['run-2a', 'run-2b'].includes(await s.current(A)))
  })
})

test('begin marks one run per site, a resume marks again, end clears only its run', opts, async () => {
  await bothAnswer(async (s, say) => {
    await s.keep(build('run-1'), A, { expected: null })
    say('none', await s.unfinished(A))
    say('begin', await s.begin({ runId: 'run-2', from: 'run-1' }, A))
    say('mark', await s.unfinished(A))
    say('other run refused', await s.begin({ runId: 'run-3', from: 'run-1' }, A))
    say('resume', await s.begin({ runId: 'run-2', from: 'run-1' }, A))
    say('mark after resume', await s.unfinished(A))
    say('other site free', await s.begin({ runId: 'run-9', from: null }, B))
    await s.end('run-3', A)
    say('end of another run leaves it', await s.unfinished(A))
    await s.end('run-2', A)
    say('ended', await s.unfinished(A))
    say('next run', await s.begin({ runId: 'run-3', from: 'run-1' }, A))
  })
})

// A run that read the site's build, then lost it to another run, must not mark itself and write over the
// winner: `begin` compares the site's build with `from` and sets the mark in one step (on Postgres: in the
// transaction that holds the head row `for update`, the head's build compared with `from`, false and no
// mark on a difference).
test(
  'begin is a compare and set on the site build: a run from another build is refused, nothing marked',
  opts,
  async () => {
    const said = await bothAnswer(async (s, say) => {
      say('blank site, from a build', await s.begin({ runId: 'run-2', from: 'run-1' }, A))
      say('no mark', await s.unfinished(A))
      await s.keep(build('run-1'), A, { expected: null })
      await s.keep(build('run-2', 'run-1'), A, { expected: 'run-1' })
      say('from the build before', await s.begin({ runId: 'run-3', from: 'run-1' }, A))
      say('still no mark', await s.unfinished(A))
      say('from the site build', await s.begin({ runId: 'run-3', from: 'run-2' }, A))
      await s.keep(build('run-1'), A, { expected: 'run-2' })
      say('resume after the build moved on', await s.begin({ runId: 'run-3', from: 'run-2' }, A))
      const both = await Promise.all([
        s.begin({ runId: 'run-4', from: 'run-1' }, B),
        s.begin({ runId: 'run-5', from: null }, B)
      ])
      say('one of two on a blank site', both)
    })
    assert.deepEqual(
      said.filter(([l]) => l !== 'still no mark' && l !== 'no mark').map(([, v]) => v),
      [false, false, true, false, [false, true]]
    )
  }
)

test('forget drops the build; keeping the ref again brings it back', opts, async () => {
  await bothAnswer(async (s, say) => {
    await s.keep(build('run-1'), A, { expected: null })
    await s.keep(build('run-2', 'run-1'), A, { expected: 'run-1' })
    await s.forget('run-1', A, { reason: 'restore_shows_held_text' })
    say('forgotten read', await s.read('run-1', A))
    say('current unchanged', await s.current(A))
    say('other kept', (await s.read('run-2', A))?.ref)
    say('keep again', await s.keep(build('run-1'), A, { expected: 'run-2' }))
    say('read again', (await s.read('run-1', A))?.ref)
  })
})

test('what a store gives back is a copy: changing it changes nothing kept', opts, async () => {
  await bothAnswer(async (s, say) => {
    const kept = build('run-1')
    await s.keep(kept, A, { expected: null })
    kept.pages[0].written.push('changed after keep')
    const read = await s.read('run-1', A)
    read.pages[0].written.push('changed after read')
    say('as kept', await s.read('run-1', A))
  })
})
