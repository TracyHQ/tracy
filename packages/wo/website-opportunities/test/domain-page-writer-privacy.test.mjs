// The created Privacy page's text (#575, item B), copied from the step chain's site writer (its `pages` entry, W13 and
// W14): written after every other page, a heading of its own and at least five paragraphs covering at least four of
// the six themes the writer names per paragraph. The invented club, scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-page-writer-privacy.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { PRIVACY_PROMPT, privacyFailing } from '../domain/page-writer-system.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

/** A long dash, written by its code point so no source line carries one. */
const LONG_DASH = String.fromCodePoint(0x2014)

/** An invented policy in five paragraphs, each naming what it covers. */
const POLICY = [
  {
    text: 'What we collect. Your name and message when you write to us or book a court.',
    covers: ['collected']
  },
  { text: 'Photos. We share pictures of members only with their consent.', covers: ['photos'] },
  { text: 'Sharing. Your details stay with the club and reach no other company.', covers: ['sharing'] },
  { text: 'Keeping your data. We hold enquiries only as long as we need to answer them.', covers: ['kept'] },
  {
    text: 'Your rights. Ask us to see, correct or delete what we hold about you.',
    covers: ['rights', 'contact']
  }
]

async function approved() {
  const profile = clubProfile()
  const { plan } = await composePlan({
    profile,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  return { plan, profile }
}

/** Pages answered field by field; the privacy call answered by `privacy(user)`. */
function scripted(privacy) {
  const calls = []
  const model = async (request) => {
    const user = JSON.parse(request.user)
    calls.push({ system: request.system, user })
    if (request.system === PRIVACY_PROMPT) return JSON.stringify(privacy(user))
    const fields = {}
    for (const block of user.blocks)
      for (const field of block.fields)
        fields[field.key] = `${field.name} of ${user.page.id}`.slice(0, field.limit)
    return JSON.stringify({ fields })
  }
  return Object.assign(model, { calls })
}

const run = async (model, legal = true) => {
  const { plan, profile } = await approved()
  return writePages({ plan, profile, blockStore: blockStore(), library: library(), model, legal })
}

test('the plan creates a Privacy page: its text is written last, from its facts, with the site before it', async () => {
  const { plan } = await approved()
  assert.equal(plan.legalPages[0].id, 'legal:privacy')
  const model = scripted(() => ({ title: 'Privacy Policy', body: POLICY }))
  const out = await run(model)
  assert.equal(model.calls.at(-1).system, PRIVACY_PROMPT)
  const user = model.calls.at(-1).user
  assert.equal(user.page.id, 'legal:privacy')
  assert.ok(user.facts.length > 0)
  assert.ok(user.written.length > 0, 'the copy of the other pages is context')
  assert.deepEqual(
    out.systemPages.map((p) => [p.id, p.title, p.body.length]),
    [['legal:privacy', 'Privacy Policy', 5]]
  )
})

test('a thin policy, a browser title or an unknown theme is sent back once, then the build stops typed', async () => {
  const model = scripted((user) =>
    user.rewrite
      ? { title: 'Privacy Policy', body: POLICY }
      : {
          title: 'Privacy | Brindlewick Tennis Club',
          body: POLICY.slice(0, 3).map((p) => ({ ...p, covers: ['other'] }))
        }
  )
  const out = await run(model)
  const rewrite = model.calls.find((c) => c.user.rewrite).user.rewrite
  const keys = rewrite.map((f) => f.key)
  assert.ok(keys.includes('title') && keys.includes('body'))
  assert.equal(out.systemPages[0].attempts.length, 2)
  const stubborn = scripted(() => ({ title: 'Privacy', body: POLICY.slice(0, 2) }))
  await assert.rejects(run(stubborn), (error) => {
    assert.equal(error.code, 'copy_check_failed')
    assert.equal(error.noRerun, true)
    assert.ok(error.details.failing.some((f) => f.key === 'body' && f.problems[0].code === 'privacy_thin'))
    return true
  })
})

test('four themes named in five paragraphs pass; a paragraph with a long dash or an invented phone does not', () => {
  const context = { known: [], templateNames: [] }
  const four = POLICY.map((p, i) => (i === 4 ? { ...p, covers: ['rights'] } : p))
  assert.deepEqual(privacyFailing({ title: 'Privacy Policy', body: four }, { context, others: [] }), [])
  const bad = POLICY.map((p, i) =>
    i === 0 ? { ...p, text: `Call us on +44 20 7946 0999 ${LONG_DASH} any time.` } : p
  )
  const failing = privacyFailing({ title: 'Privacy Policy', body: bad }, { context, others: [] })
  assert.deepEqual(
    failing.map((f) => f.key),
    ['body.1']
  )
  assert.deepEqual(failing[0].problems.map((p) => p.code).sort(), ['dash', 'invented_data'])
})

test('a call that writes some pages only leaves the Privacy page alone', async () => {
  const model = scripted(() => assert.fail('no privacy call'))
  const out = await run(model, false)
  assert.equal(out.systemPages, undefined)
})
