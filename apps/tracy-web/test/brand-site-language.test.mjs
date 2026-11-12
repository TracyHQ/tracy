import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBrief } from '../../../packages/wo/website-opportunities/domain/brief.mjs'
import { briefWithSiteLanguage } from '../src/brand-step/brand-input.js'
import { brandBriefProblems } from '../src/brand-step/brand-brief-shape.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'

const productionBrief = () =>
  buildBrief({
    opportunity: {
      name: 'Invented Training Club',
      candidate: { name: 'Invented Training Club', trade: 'fitness' }
    },
    profile: { name: 'Invented Training Club' },
    brand: { logo: null, colors: [] },
    madeAt: '2026-11-11T13:00:00.000Z'
  })

test('a production research brief without a social voice reproduces the brand refusal', () => {
  const brief = productionBrief()
  assert.equal(Object.hasOwn(brief.brand, 'voice'), false)
  assert.deepEqual(brandBriefProblems(brief), ['brand.voice must start with the site language'])
})
for (const [tag, label] of [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['vi-VN', 'Vietnamese (Vietnam)']
]) {
  test(`the selected ${tag} site language repairs only the missing brand input without adding a tone`, () => {
    const brief = productionBrief()
    const before = JSON.stringify(brief)
    const result = briefWithSiteLanguage(brief, tag)
    assert.equal(result.ok, true)
    assert.equal(result.brief.brand.voice, label)
    assert.deepEqual(brandBriefProblems(result.brief), [])
    assert.equal(JSON.stringify(brief), before)
    const { voice: _voice, ...brand } = result.brief.brand
    assert.deepEqual(brand, brief.brand)
    assert.equal(result.brief.assets, brief.assets)
    assert.equal(result.brief.facts, brief.facts)
    assert.deepEqual(result.projection, {
      version: 'brand-brief-language/1',
      source: 'selected-site-language',
      tag,
      language: label
    })
  })
}
test('authored voice is preserved verbatim and no projection is recorded', () => {
  const brief = { brand: { name: 'Invented Club', voice: 'Spanish; direct, friendly (observed from bio)' } }
  const result = briefWithSiteLanguage(brief, 'en')
  assert.equal(result.brief, brief)
  assert.equal(result.projection, null)
})
test('missing or invalid selected languages refuse instead of guessing English', () => {
  for (const language of [undefined, null, '', ' ', 'English', 'zz', 'und', 'mul', 'zxx', []]) {
    const result = briefWithSiteLanguage(productionBrief(), language)
    assert.equal(result.ok, false, String(language))
    assert.equal(result.code, 'BRAND_SITE_LANGUAGE_REQUIRED')
  }
})
test('a malformed authored voice remains a shape refusal', () => {
  const brief = { brand: { name: 'Invented Club', voice: { language: 'es' } } }
  const result = briefWithSiteLanguage(brief, 'en')
  assert.equal(result.brief, brief)
  assert.deepEqual(brandBriefProblems(result.brief), ['brand.voice must start with the site language'])
})
test('the production chain passes its selected normalized language to the shared brand boundary', async () => {
  const calls = []
  const steps = createStepChainSteps({
    config: {},
    pool: {},
    benchCli: {
      brand: async (argv, io) => {
        calls.push(argv)
        io.err('captured before queueing')
        return 1
      }
    }
  })
  const ctx = {
    runId: 'language-boundary',
    brief: { researchRevisionId: 'revision' },
    normalized: { languages: ['es', 'en'], languagesFrom: 'answer' }
  }
  try {
    await assert.rejects(
      steps.brand(ctx, { kit: { ref: 'test-kit' } }, { signal: new AbortController().signal }),
      /captured before queueing/
    )
    const argv = calls[0]
    assert.equal(argv[argv.indexOf('--site-language') + 1], 'es')
    assert.equal(argv[argv.indexOf('--brief-revision') + 1], 'revision')
    assert.equal(calls.length, 1)
  } finally {
    await steps.dispose(ctx)
  }
})
