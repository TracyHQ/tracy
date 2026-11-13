// The brand step before the site exists as one step (ticket #616): a failing attempt runs once more, then the step
// stops with a typed error; every attempt keeps its record line. The brand step is scripted; no model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BRAND_STEP_PROMPT, runBrandBeforeSite } from '../domain/brand-before-site-run.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import { fernAndFoxglove, harrowLaneBakery } from './fixtures/plan-composer/invented-brands.mjs'
import { template } from './fixtures/plan-composer/invented-club.mjs'

const clock = () => {
  let t = Date.UTC(2026, 10, 13, 9, 0, 0)
  return () => (t += 1000)
}
/** A scripted brand step: each attempt answers the next script entry, an Error is thrown. */
const scripted = (...answers) => {
  const seen = []
  const run = async ({ attempt }) => {
    seen.push(attempt)
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { run, seen }
}
const inputs = { revisionId: 'rev-invented-1', kit: 'example-court@1.0.0' }

test('one attempt that answers: the record, its record line and the locked prompt it ran with', async () => {
  const { brief, brandFile } = harrowLaneBakery()
  const { run, seen } = scripted({
    brandFile,
    usd: 0.42,
    runId: 'brand-run-1',
    file: 'brand/brand-file.json'
  })
  const out = await runBrandBeforeSite({ run, brief, inputs, now: clock() })
  assert.deepEqual(seen, [1])
  assert.equal(out.record.accent.hex, '#8a2c6c')
  assert.equal(out.usd, 0.42)
  assert.deepEqual(out.prompt, BRAND_STEP_PROMPT)
  assert.equal(out.records.length, 1)
  assert.deepEqual(
    { ...out.records[0], output: undefined },
    {
      step: 'brand',
      attempt: 1,
      startedAt: '2026-11-13T09:00:01.000Z',
      endedAt: '2026-11-13T09:00:02.000Z',
      inputs,
      prompt: BRAND_STEP_PROMPT,
      usd: 0.42,
      runId: 'brand-run-1',
      outcome: 'done',
      output: undefined
    }
  )
  assert.equal(out.records[0].output.file, 'brand/brand-file.json')
})

test('a failing attempt runs once more and the second answer is kept', async () => {
  const { brief, brandFile } = fernAndFoxglove()
  const failed = Object.assign(new Error('the brand run failed its gate'), { usd: 0.3 })
  const { run, seen } = scripted(failed, { brandFile, usd: 0.5 })
  const out = await runBrandBeforeSite({ run, brief, inputs, now: clock() })
  assert.deepEqual(seen, [1, 2])
  assert.deepEqual(
    out.records.map((r) => [r.attempt, r.outcome, r.usd]),
    [
      [1, 'failed', 0.3],
      [2, 'done', 0.5]
    ]
  )
  assert.equal(out.usd, 0.8)
})

test('a second failure stops the step with every record line; an unreadable file counts as a failure', async () => {
  const { brief } = fernAndFoxglove()
  const { run, seen } = scripted(new Error('first'), {
    brandFile: { kind: 'brand-file', version: 3 },
    usd: 0.1
  })
  await assert.rejects(
    runBrandBeforeSite({ run, brief, inputs, now: clock() }),
    (e) =>
      e.code === 'brand_step_failed' &&
      e.noRerun === true &&
      e.details.records.map((r) => r.error.code).join() === ',brand_file_unreadable'
  )
  assert.deepEqual(seen, [1, 2])
})

test('a failure that says a second run cannot change it stops at once', async () => {
  const { brief } = fernAndFoxglove()
  const refused = Object.assign(new Error('BRAND_AGENT_DOOR_UNSET'), { noRerun: true })
  const { run, seen } = scripted(refused)
  await assert.rejects(runBrandBeforeSite({ run, brief, inputs }), (e) => e.code === 'brand_step_failed')
  assert.deepEqual(seen, [1])
})

test('the look check flags the template accent, the template logo and a line that names them', () => {
  const plan = {
    look: {
      template: { slug: 'example-court', name: 'Example Court', version: '1.0.0' },
      accent: '#225588',
      logo: { kind: 'own', source: 'Example Court' }
    },
    assumptions: [
      { id: 'accent', field: 'look.accent', said: 'The colour of the template is kept.' },
      { id: 'x', field: 'facts[a].value', said: 'Your buttons use #225588.' },
      { id: 'y', field: 'look.accent', said: 'Your green reads well on the dark background.' }
    ]
  }
  assert.deepEqual(
    lookProblemsOf({ plan, template: template() }).map((p) => [p.code, p.at]),
    [
      ['template_accent', 'look.accent'],
      ['template_logo', 'look.logo'],
      ['template_look_said', 'assumptions[0]'],
      ['template_look_said', 'assumptions[1]']
    ]
  )
  // Only the no logo case may show the template's accent, and say so; any other source is flagged.
  const noLogo = {
    ...plan,
    look: { ...plan.look, logo: { kind: 'text' } },
    assumptions: [plan.assumptions[0]]
  }
  assert.deepEqual(
    lookProblemsOf({
      plan: noLogo,
      template: template(),
      lookSources: { accent: { from: 'template-accent-no-logo' } }
    }),
    []
  )
  for (const from of ['logo', 'customer', undefined])
    assert.deepEqual(
      lookProblemsOf({ plan: noLogo, template: template(), lookSources: { accent: { from } } }).map(
        (p) => p.code
      ),
      ['template_accent', 'template_look_said']
    )
})
