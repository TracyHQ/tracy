// A build refusal that names an entry or a slot several probed places share blames only the place that causes it
// (ticket #586, review 4 W2). An invented shop: the search description of the home page holds the codes of the business
// name and of its address; only the name's probe is too long for it. Each place stored there is built alone in memory
// (a build step, never a site step) before it is blamed; a place stored there alone is blamed by the refusal itself.
import assert from 'node:assert/strict'
import test from 'node:test'
import { stepBudget } from '../ai-quickstart/gate/bisect.mjs'
import { buildCulprits } from '../ai-quickstart/gate/write-safety-trials.mjs'

const ENTRY = 'seo:home.description'
const plainIndex = new Map([
  ['QXAAA', [{ op: 'menuItem:mainmenu:home', entry: ENTRY, loc: { column: 'params' } }]],
  ['QXAAB', [{ op: 'menuItem:mainmenu:home', entry: ENTRY, loc: { column: 'params' } }]],
  ['QXAAC', [{ op: 'article:about', entry: 'about.about-b1.title', loc: { column: 'title' } }]]
])
const used = new Map([
  ['fact:business.name#0', { id: 'long', code: 'QxAAA' }],
  ['fact:contact.address#0', { id: 'long', code: 'QxAAB' }],
  ['fact:about.title#0', { id: 'long', code: 'QxAAC' }]
])
const refusal = (entries) => ({
  kind: 'refused_by_build',
  code: 'text_over_limit',
  details: { problems: entries.map((entry) => ({ code: 'text_over_limit', entry })) }
})
/** A memory build that refuses when the guilty places carry their probe. */
const buildOf = (guilty) => {
  const trials = []
  const attempt = async (assignment) => {
    trials.push([...assignment.keys()])
    const hit = [...assignment.keys()].filter((k) => guilty.has(k))
    const entries = hit.map((k) => (k === 'fact:about.title#0' ? 'about.about-b1.title' : ENTRY))
    return hit.length
      ? {
          opts: { used: assignment },
          built: { orderProblems: entries.map((at) => ({ code: 'text_over_limit', at })) }
        }
      : { opts: { used: assignment }, built: {} }
  }
  return { attempt, trials }
}

test('W2: a refusal at an entry two places share blames only the place built alone that refuses', async () => {
  const { attempt, trials } = buildOf(new Set(['fact:business.name#0']))
  const buildBudget = stepBudget(Number.MAX_SAFE_INTEGER)
  const found = await buildCulprits(refusal([ENTRY]), { opts: { used } }, new Map(used), {
    attempt,
    buildBudget,
    plainGaps: new Set(),
    plainIndex
  })
  assert.deepEqual(
    found.culprits.map((c) => c.unit),
    ['fact:business.name#0']
  )
  assert.equal(found.culprits[0].failure.evidence, 'built_alone')
  // Each of the two places that share the entry was built alone: two builds, no site step.
  assert.deepEqual(trials, [['fact:business.name#0'], ['fact:contact.address#0']])
  assert.equal(buildBudget.spent, 2)
  assert.deepEqual(found.cleared, ['fact:contact.address#0'])
})

test('W2: a place stored alone at the entry a refusal names is blamed by that refusal, with no build', async () => {
  const { attempt, trials } = buildOf(new Set(['fact:about.title#0']))
  const found = await buildCulprits(refusal(['about.about-b1.title']), { opts: { used } }, new Map(used), {
    attempt,
    buildBudget: stepBudget(10),
    plainGaps: new Set(),
    plainIndex
  })
  assert.deepEqual(
    found.culprits.map((c) => [c.unit, c.failure.evidence]),
    [['fact:about.title#0', 'named_alone']]
  )
  assert.equal(trials.length, 0)
})

test('W2: two places that share an entry and both refuse alone are both blamed, each with its own build', async () => {
  const { attempt } = buildOf(new Set(['fact:business.name#0', 'fact:contact.address#0']))
  const found = await buildCulprits(refusal([ENTRY]), { opts: { used } }, new Map(used), {
    attempt,
    buildBudget: stepBudget(10),
    plainGaps: new Set(),
    plainIndex
  })
  assert.deepEqual(found.culprits.map((c) => c.unit).sort(), [
    'fact:business.name#0',
    'fact:contact.address#0'
  ])
})
