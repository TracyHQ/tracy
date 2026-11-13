// What a build keeps for its next revision (ticket #599): the model replies under the hash of their request
// (`keptModel`: an unchanged request is answered with no call, a changed one calls); the build result and whether it
// can start a revision (`revisionBaseProblem`); and the page writer's kept words (`writePages` with `reuse`: a kept page
// takes no call, a page asked for some blocks asks those fields only, every page is still checked).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-revision-kept.test.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { BUILD_RESULT_SCHEMA, buildResultOf, revisionBaseProblem } from '../domain/build-result.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { keptModel, requestKeyOf } from '../domain/revision-model-replay.mjs'
import { keptWordsOf } from '../domain/revision-impact.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

const site = await boxingSite()
const WORDS = [
  'fresh',
  'stems',
  'posy',
  'petal',
  'meadow',
  'bloom',
  'ribbon',
  'garden',
  'sprig',
  'basket',
  'fern'
]
/** Words no other field has, with no digit and no space a cut could leave at the end, from a hash of the key. */
const wordsOf = (key) => {
  const hash = createHash('sha256').update(key).digest()
  return [...hash.subarray(0, 6)].map((b) => WORDS[b % WORDS.length]).join('')
}
const writer = () => scriptedWriter((key) => wordsOf(key))

test('a request asked before is answered from the kept reply, with no call; another request calls', async () => {
  assert.equal(requestKeyOf({ a: 1, b: { c: 2, d: 3 } }), requestKeyOf({ b: { d: 3, c: 2 }, a: 1 }))
  assert.notEqual(
    requestKeyOf({ images: [new Uint8Array([1, 2])] }),
    requestKeyOf({ images: [new Uint8Array([1, 3])] })
  )
  assert.equal(requestKeyOf({ user: 'x', signal: new AbortController().signal }), requestKeyOf({ user: 'x' }))
  let calls = 0
  const model = async (request) => `reply to ${request.user} ${(calls += 1)}`
  const first = keptModel(model)
  await first({ user: 'icons of the home page' })
  const again = keptModel(model, first.replies)
  assert.equal(await again({ user: 'icons of the home page' }), 'reply to icons of the home page 1')
  assert.equal(calls, 1)
  assert.equal(await again({ user: 'icons of a renamed service' }), 'reply to icons of a renamed service 2')
  assert.deepEqual([again.asked, again.replayed, again.replies.length], [1, 1, 2])
})

test('a build result starts a revision of its own plan on its own kit only, finished, and says why not', () => {
  const build = buildResultOf({
    ref: 'run-1',
    plan: { id: 'plan-larkspur', revision: 1 },
    profile: {},
    kit: 'ja-boxing@1.0.11',
    copy: { pages: [], prompt: null },
    replies: [],
    state: { mark: {}, ids: {}, paths: {}, pending: {}, done: [] },
    ops: [{ key: 'article:service-a', kind: 'article.create', hash: 'a'.repeat(64), addresses: [] }]
  })
  assert.equal(build.schema, BUILD_RESULT_SCHEMA)
  const next = { plan: { id: 'plan-larkspur', revision: 2 }, kit: 'ja-boxing@1.0.11' }
  assert.equal(revisionBaseProblem(build, next), null)
  assert.equal(revisionBaseProblem(null, next), 'previous_build_missing')
  assert.equal(revisionBaseProblem({ ...build, schema: 'other' }, next), 'previous_build_unreadable')
  assert.equal(revisionBaseProblem({ ...build, status: 'failed' }, next), 'previous_build_unfinished')
  const pending = structuredClone(build)
  pending.write.state.pending = { 'article:x': true }
  assert.equal(revisionBaseProblem(pending, next), 'previous_build_unfinished')
  assert.equal(
    revisionBaseProblem(build, { ...next, plan: { id: 'plan-other' } }),
    'previous_build_other_plan'
  )
  assert.equal(revisionBaseProblem(build, { ...next, kit: 'ja-boxing@1.0.12' }), 'previous_build_other_kit')
})

const written = (model, reuse) =>
  writePages({
    plan: site.build.approval.plan,
    profile: site.build.approval.profile,
    blockStore: site.aiq.blockStore,
    library: site.aiq.library,
    model,
    reuse
  })

test('a kept page takes no call; a page asked for one block asks only its fields; the words come back as kept', async () => {
  const full = await written(writer())
  const kept = new Map(full.pages.map((p) => [p.id, keptWordsOf(p)]))
  kept.set('class', { ...kept.get('class'), ask: new Set(['class-b3']) })
  const model = writer()
  const again = await written(model, kept)
  assert.equal(model.calls.length, 1)
  const asked = JSON.parse(model.calls[0].user)
  assert.equal(asked.page.id, 'class')
  assert.deepEqual([...new Set(asked.blocks.map((b) => b.id))], ['class-b3'])
  assert.deepEqual(
    again.pages.map((p) => p.fields),
    full.pages.map((p) => p.fields)
  )
  assert.deepEqual(again.pages.find((p) => p.id === 'home').attempts, [])
})

test('a kept page is still checked: a kept field that now fails is written again (the whole site check sees it)', async () => {
  const full = await written(writer())
  const kept = new Map(full.pages.map((p) => [p.id, keptWordsOf(p)]))
  // The same body sentence kept on the home page and on the contact page: the repeat rule fails the later page.
  const sentence = 'Fresh stems are tied by hand every single morning.'
  kept.get('home').values['home-b5/paragraph'] = sentence
  kept.get('contact').values['contact-b4/paragraph'] = sentence
  const model = writer()
  await written(model, kept)
  assert.equal(model.calls.length, 1)
  assert.equal(JSON.parse(model.calls[0].user).page.id, 'contact')
  assert.ok(JSON.parse(model.calls[0].user).rewrite)
})
