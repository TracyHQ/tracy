import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildQualityDossier,
  deterministicFacts,
  qualityHash,
  sourceSpans
} from '../src/opportunities-build/quality-dossier.js'
import { qualityFactsTask } from '../src/opportunities-build/quality-editorial.js'
import {
  qualityExecutionInput,
  qualityExecutionLimits,
  qualityExecutionProfile
} from '../src/opportunities-build/quality-execution-profile.js'
import { qualityCallBudget } from '../src/opportunities-build/quality-model.js'
import {
  QUALITY_FACTS_SYSTEM,
  qualityCompactFactsInput,
  qualitySourceInput
} from '../src/opportunities-build/quality-sources.js'

const config = {
  hash: 'synthetic-facts-config',
  role: 'facts',
  capabilities: { reasoning: true, vision: false },
  reasoning: { effort: 'high' },
  price: { inputCentsPerM: 132, outputCentsPerM: 396, maxImageTokens: 1024 }
}
const profile = qualityExecutionProfile()
const budgetFor = (input) =>
  qualityCallBudget({
    config,
    system: QUALITY_FACTS_SYSTEM,
    input: qualityExecutionInput(input, profile),
    ...qualityExecutionLimits(profile, 'a-facts')
  })
function decode(input) {
  assert.equal(input.schemaVersion, 'tracy-wo-facts-wire/v1')
  assert.deepEqual(input.sourceSpanColumns, ['start', 'end', 'textIndex'])
  assert.deepEqual(input.sourceRefColumns, ['sourceId', 'start', 'end'])
  const spanByCoordinates = new Map()
  const sources = input.sources.map(({ spans, ...metadata }) => ({
    ...metadata,
    spans: spans.map(([start, end, index]) => {
      assert.ok(Number.isInteger(index) && index >= 0 && index < input.sourceSpanTexts.length)
      const text = input.sourceSpanTexts[index]
      spanByCoordinates.set(`${metadata.id}:${start}:${end}`, text)
      return { start, end, text }
    })
  }))
  const candidates = input.deterministicCandidates.map((row) =>
    Object.fromEntries(
      input.deterministicCandidateColumns.map((column, i) => [
        column,
        column === 'sourceRefs'
          ? row[i].map(([sourceId, start, end]) => ({
              sourceId,
              start,
              end,
              quote: spanByCoordinates.get(`${sourceId}:${start}:${end}`)
            }))
          : row[i]
      ])
    )
  )
  return { sources, candidates }
}
test('exact text interning preserves Unicode, overlapping spans, contradictory contacts and source provenance', () => {
  const sources = [
    {
      id: 'official-one',
      kind: 'official-website',
      branch: 'Hoi An',
      observedAt: null,
      body: '  Café ☕ opened in 2015.\n\nOpening hours 7AM–10PM. Happy hour 2PM–6PM.\n\nCall +84 123 456 789 only on weekdays until Friday.  '
    },
    {
      id: 'official-two',
      kind: 'official-website',
      branch: 'Hoi An',
      observedAt: '2026-10-20T12:00:00Z',
      body: 'Café ☕ opened in 2015.\n\nCall +84 987 654 321 only on weekdays until Friday.'
    }
  ]
  const before = qualityHash(sources),
    candidates = deterministicFacts(sources)
  const packed = qualityCompactFactsInput(sources, candidates),
    decoded = decode(packed)
  assert.deepEqual(decoded.candidates, candidates)
  assert.deepEqual(
    decoded.sources,
    sources.map(({ body, ...metadata }) => ({
      ...metadata,
      spans: sourceSpans({ body, ...metadata }).map(({ start, end, text }) => ({ start, end, text }))
    }))
  )
  for (const source of decoded.sources)
    for (const span of source.spans)
      assert.equal(sources.find((s) => s.id === source.id).body.slice(span.start, span.end), span.text)
  assert.ok(packed.sourceSpanTexts.length < packed.sources.reduce((n, s) => n + s.spans.length, 0))
  const dossier = (proposals) =>
    buildQualityDossier({
      accountId: 'synthetic-account',
      snapshotId: 'synthetic-snapshot',
      overlay: {},
      business: { name: 'Synthetic café' },
      sources,
      proposals,
      at: '2026-10-20T12:00:00Z'
    })
  assert.deepEqual(dossier(decoded.candidates), dossier(candidates))
  assert.equal(qualityHash(sources), before)
  assert.deepEqual(qualityCompactFactsInput(sources, candidates), packed)
})
test('an admitted legacy task retains its exact wire and cache hash', () => {
  const sources = [{ id: 'small', kind: 'official-website', body: 'Open daily 7AM to 10PM.' }]
  const legacy = {
    sources: qualitySourceInput(sources),
    deterministicCandidates: deterministicFacts(sources)
  }
  const selected = qualityFactsTask(sources, config, profile)
  assert.deepEqual(selected, legacy)
  assert.equal(JSON.stringify(selected), JSON.stringify(legacy))
  assert.equal(qualityHash(selected), qualityHash(legacy))
  assert.deepEqual(budgetFor(selected), budgetFor(legacy))
})
test('only an over-limit legacy task switches encoding and dispatch preflight receives the same bounded task', () => {
  const sources = [
    {
      id: 'large',
      kind: 'official-website',
      branch: 'main',
      body: `${'Original café evidence. '.repeat(250)} ${Array.from({ length: 18 }, (_, i) => `Call +84 123 456 ${100 + i}.`).join(' ')}`
    }
  ]
  const legacy = {
    sources: qualitySourceInput(sources),
    deterministicCandidates: deterministicFacts(sources)
  }
  assert.throws(() => budgetFor(legacy), { code: 'QUALITY_INPUT_LIMIT' })
  const selected = qualityFactsTask(sources, config, profile),
    before = qualityHash(sources)
  assert.equal(selected.schemaVersion, 'tracy-wo-facts-wire/v1')
  assert.ok(budgetFor(selected).maxInputTokens <= 70000)
  assert.deepEqual(decode(selected).candidates, deterministicFacts(sources))
  assert.equal(qualityHash(sources), before)
  assert.deepEqual(qualityFactsTask(sources, config, profile), selected)
})
test('a compact task that is still too large remains a typed refusal before any attempt', () => {
  const sources = [{ id: 'too-large', kind: 'official-website', body: 'e'.repeat(80000) }]
  assert.throws(() => qualityFactsTask(sources, config, profile), { code: 'QUALITY_INPUT_LIMIT' })
  assert.throws(() => qualityFactsTask([], { ...config, role: 'review' }, profile), {
    code: 'QUALITY_VISION_INPUT_MISSING'
  })
})
test('mismatched source quotes or candidate columns cannot be silently lost in table encoding', () => {
  const sources = [{ id: 'own', kind: 'official-website', body: 'Call +84 123 456 789.' }]
  const candidates = deterministicFacts(sources)
  const broken = structuredClone(candidates)
  broken[0].sourceRefs[0].quote = 'Different evidence.'
  assert.throws(() => qualityCompactFactsInput(sources, broken), { code: 'QUALITY_FACTS_REFERENCE' })
  assert.throws(
    () => qualityCompactFactsInput(sources, [candidates[0], { ...candidates[0], extra: 'retained?' }]),
    { code: 'QUALITY_FACTS_COLUMNS' }
  )
})
