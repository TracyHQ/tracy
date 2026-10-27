import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import noWebsite from '../domain/scoring/no-website.mjs'
import {
  BUILT_IN_SCORING_RULES,
  loadScoringRules,
  scoreWithRules,
  scoringRules
} from '../src/plugins/scoring.js'
import { scoreOpportunity } from '../domain/opportunity-score.mjs'
import { scoreInputs } from './fixtures/plugins/golden-inputs.mjs'

const NOW = new Date('2026-10-18T00:00:00Z')

test('no-website: full web points without a website, the social-only reason when a page exists', () => {
  assert.deepEqual(noWebsite.score({ candidate: {} }), { points: 40, reason: 'web.none' })
  assert.deepEqual(noWebsite.score({ candidate: { socials: { instagram: 'https://instagram.com/x' } } }), {
    points: 40,
    reason: 'web.socialOnly'
  })
  assert.equal(
    noWebsite.score({ candidate: { website: 'https://x.example/' } }),
    null,
    'a website is not this rule'
  )
})

test('golden: the built-in rules score the fixture set exactly as the single function did before the split', () => {
  // sha256 of one JSON line per input, recorded from `scoreOpportunity` before the score was made of rules. Since
  // 26/10/2026 the demand reason leaves out a count or rating Google never gave (it printed "0 reviews · ★0.0"); the
  // old 0 is put back here, so the hash still proves every score and reason is unchanged.
  const asBefore = (score) => ({
    ...score,
    reasons: score.reasons.map(([key, points, params]) =>
      key === 'demand.reviews'
        ? [key, points, { reviews: params.reviews ?? 0, rating: params.rating ?? 0 }]
        : params === undefined
          ? [key, points]
          : [key, points, params]
    )
  })
  const lines = scoreInputs().map((input) => JSON.stringify(asBefore(scoreOpportunity(input))))
  assert.equal(lines.length, 7776)
  assert.equal(
    createHash('sha256').update(lines.join('\n')).digest('hex'),
    '10f9e204cbca60b534ee7e019307cb3a7e22ced42b43423e048502458d8985ac'
  )
})

test('an added rule adds its reason after the built-in ones; points are kept within 0..weight', () => {
  const generous = {
    id: 'booking-link',
    weight: 5,
    score: () => ({ points: 9, reason: 'booking.thirdPartyOnly' })
  }
  const r = scoreWithRules(scoringRules([...BUILT_IN_SCORING_RULES, generous]), { candidate: {}, now: NOW })
  assert.deepEqual(r.reasons.at(-1), ['booking.thirdPartyOnly', 5])
  // web 40 + demand 2 (no reviews: round(6·log10 2)) + contact 0 + the added rule cut to its weight 5.
  assert.equal(r.score, 47)
  const r2 = scoreWithRules(
    scoringRules([{ id: 'harsh', weight: 5, score: () => ({ points: -3, reason: 'x' }) }]),
    { now: NOW }
  )
  assert.deepEqual(r2.reasons, [['x', 0]])
})

test('a rule that does not apply adds no reason; an unknown answer holds the score only when the rule says so', () => {
  const skip = { id: 'skip', weight: 1, score: () => null }
  const unknown = { id: 'unknown', weight: 1, score: () => ({ points: null, reason: 'u' }) }
  assert.deepEqual(scoreWithRules(scoringRules([skip, unknown]), { now: NOW }), {
    score: 0,
    grade: 'C',
    pending: false,
    reasons: [['u', null]]
  })
  const holding = scoreWithRules(scoringRules([{ ...unknown, holdsScore: true }]), { now: NOW })
  assert.equal(holding.pending, true)
})

test('scoringRules refuses a malformed rule and an id used twice', () => {
  assert.throws(() => scoringRules([{ id: 'Bad Id', weight: 1, score: () => null }]), /kebab-case/)
  assert.throws(() => scoringRules([{ id: 'a', weight: 0, score: () => null }]), /weight/)
  assert.throws(() => scoringRules([{ id: 'a', weight: 1 }]), /score/)
  assert.throws(() => scoringRules([noWebsite, noWebsite]), /twice/)
})

test('loadScoringRules: the rule files of a folder come after the built-in ones, in name order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wo-scoring-'))
  await writeFile(
    join(dir, 'b-rule.js'),
    "export default { id: 'b-rule', weight: 2, score: () => ({ points: 2, reason: 'b' }) }\n"
  )
  await writeFile(
    join(dir, 'a-rule.mjs'),
    "export default { id: 'a-rule', weight: 1, score: () => ({ points: 1, reason: 'a' }) }\n"
  )
  await writeFile(join(dir, 'notes.txt'), 'not a rule')
  const rules = await loadScoringRules(dir)
  assert.deepEqual(
    rules.map((r) => r.id),
    [...BUILT_IN_SCORING_RULES.map((r) => r.id), 'a-rule', 'b-rule']
  )
  await writeFile(join(dir, 'c-rule.js'), 'export const rule = 1\n')
  await assert.rejects(loadScoringRules(dir), /no default export/)
})
