// A stored build a revision cannot read stops typed (ticket #599, `revisionBaseProblem`): every part a revision reads
// (the kept replies, the kept copy, the ops record, the run record's ids, paths, write count and written hashes) is
// checked for the shape `buildResultOf` writes, so a build broken or changed in the store gives
// `previous_build_unreadable`, never an untyped error, a string write count or a wrong site. Invented data only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-revision-base.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildResultOf, revisionBaseProblem } from '../domain/build-result.mjs'

const NEXT = { plan: { id: 'plan-larkspur', revision: 2 }, kit: 'ja-boxing@1.0.11' }
const good = () =>
  buildResultOf({
    ref: 'run-1:r1:w1',
    plan: { id: 'plan-larkspur', revision: 1 },
    profile: {},
    kit: 'ja-boxing@1.0.11',
    copy: {
      pages: [{ id: 'home', fields: [{ key: 'home-b3/heading', from: 'writer', value: 'Fresh stems' }] }],
      prompt: null
    },
    replies: [{ key: 'a'.repeat(64), reply: '{"labels":[]}' }],
    state: {
      mark: {},
      seq: 1,
      ids: { 'article:service-a': 3000 },
      paths: { 'picture:home.home-b3.hero-image': 'images/tracy/0df0005a4e2ef240.jpg' },
      pending: {},
      done: ['article:service-a'],
      wrote: { 'record:article:3000:title': 'b'.repeat(64) }
    },
    ops: [{ key: 'article:service-a', kind: 'article.create', hash: 'c'.repeat(64), addresses: ['title'] }]
  })

test('a build result as written is read; one with no kept copy is read too (every page is written again)', () => {
  assert.equal(revisionBaseProblem(good(), NEXT), null)
  assert.equal(revisionBaseProblem({ ...good(), copy: null }, NEXT), null)
})

test('every broken part a revision reads is unreadable, typed', () => {
  const cases = {
    'not an object': () => 'a build',
    'replies missing': (b) => delete b.replies,
    'a reply null': (b) => b.replies.push(null),
    'a reply without a key': (b) => b.replies.push({ reply: 'x' }),
    'a reply holding null': (b) => b.replies.push({ key: 'd'.repeat(64), reply: null }),
    'copy pages not a list': (b) => (b.copy.pages = {}),
    'a kept page without fields': (b) => (b.copy.pages[0] = { id: 'home' }),
    'a kept field without a key': (b) => b.copy.pages[0].fields.push({ from: 'writer', value: 'x' }),
    'ops empty': (b) => (b.write.ops = []),
    'an op without a hash': (b) => (b.write.ops[0].hash = undefined),
    'an op without addresses': (b) => delete b.write.ops[0].addresses,
    'ids missing': (b) => delete b.write.state.ids,
    'done missing': (b) => delete b.write.state.done,
    'write count as text': (b) => (b.write.state.seq = '7'),
    'write count zero': (b) => (b.write.state.seq = 0),
    'a path not a text': (b) => (b.write.state.paths.x = { path: 'y' }),
    'written hashes not a map': (b) => (b.write.state.wrote = ['x']),
    'ref missing': (b) => delete b.ref,
    'profile a text': (b) => (b.profile = 'x')
  }
  for (const [name, spoil] of Object.entries(cases)) {
    const build = good()
    const out = spoil(build)
    const stored = typeof out === 'string' && name === 'not an object' ? out : build
    assert.equal(revisionBaseProblem(stored, NEXT), 'previous_build_unreadable', name)
  }
})

test('a missing, unfinished, other plan or other kit build keeps its own code', () => {
  assert.equal(revisionBaseProblem(null, NEXT), 'previous_build_missing')
  assert.equal(revisionBaseProblem(undefined, NEXT), 'previous_build_missing')
  assert.equal(revisionBaseProblem({ ...good(), status: 'running' }, NEXT), 'previous_build_unfinished')
  const pending = good()
  pending.write.state.pending = { 'article:service-a': true }
  assert.equal(revisionBaseProblem(pending, NEXT), 'previous_build_unfinished')
  assert.equal(
    revisionBaseProblem(good(), { ...NEXT, plan: { id: 'plan-other' } }),
    'previous_build_other_plan'
  )
  assert.equal(revisionBaseProblem(good(), { ...NEXT, kit: 'ja-boxing@1.0.12' }), 'previous_build_other_kit')
})
