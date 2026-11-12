import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { exportContractMapping } from '../src/lib/site-copy/contract-mapping.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { fixedPart } from '../src/site-writer/writer-turns.js'
import { runStep } from './_write-step-run.mjs'
import { brief, copy, kit, plan } from './_site-copy-check.mjs'

// Reduced from a real dev article: a correct original-post citation accompanied invented crowd claims.
const original =
  'Huge thanks to everyone who supported these fighters and coaches! To our sponsors: thank you!'
function fixture(text = original) {
  const b = brief(),
    k = kit(),
    p = plan(),
    c = copy()
  b.facts.push({ id: 'owner-post', field: 'posts', onSite: true, value: { kind: 'post', text: original } })
  k.blocks[1].slots[1] = {
    ...k.blocks[1].slots[1],
    role: 'article.lead',
    demoChars: { total: 190, lead: 190, bullets: [] }
  }
  p.pages[0].blocks[0].copy[1].factIds = ['owner-post']
  Object.assign(
    c.slots.find((s) => s.slot === 'block-2.2'),
    { text, factIds: ['owner-post'] }
  )
  return { brief: b, kit: k, plan: p, copy: c }
}
const rule = (input, id) => checkCopy(input).rules.find((r) => r.id === id)

test('a valid post citation does not authorize invented event narrative', () => {
  const input = fixture(
    'The crowd filled the room. Nobody left early. The noise stayed loud through every round.'
  )
  const result = rule(input, 'W04')
  assert.equal(result.status, 'fail')
  assert.ok(result.failures.some((f) => /original post excerpt/.test(f.detail)))
})

test('a faithful short post excerpt passes without padding to the demo length', () => {
  const input = fixture('To our sponsors: thank you!')
  assert.equal(rule(input, 'W04').status, 'pass')
  assert.equal(rule(input, 'W03').status, 'pass')
})

test('other known business facts do not invalidate a faithful excerpt of the single original post', () => {
  const input = fixture()
  input.plan.pages[0].blocks[0].copy[1].factIds.push('f-name')
  input.copy.slots.find((s) => s.slot === 'block-2.2').factIds.push('f-name')
  assert.equal(rule(input, 'W04').status, 'pass')
})

test('whitespace and typographic quote normalization preserve faithful excerpts', () => {
  const input = fixture('Huge thanks to everyone who supported these fighters and coaches!')
  input.brief.facts.at(-1).value.text = original.replace('everyone who', 'everyone\nwho')
  assert.equal(rule(input, 'W04').status, 'pass')
})

test('a word fragment, reordered passages and a different cited post do not pass', () => {
  for (const text of ['veryone who supported', 'To our sponsors: thank you! Huge thanks to everyone']) {
    assert.equal(rule(fixture(text), 'W04').status, 'fail')
  }
  const input = fixture()
  input.copy.slots.find((s) => s.slot === 'block-2.2').factIds = ['f-name']
  assert.equal(rule(input, 'W04').status, 'fail')
})

test('a hidden, non-post or missing fact cannot exempt the length floor', () => {
  for (const change of [
    (f) => {
      f.onSite = false
    },
    (f) => {
      f.value.kind = 'review'
    },
    (f) => {
      f.field = 'services'
    }
  ]) {
    const input = fixture('To our sponsors: thank you!')
    change(input.brief.facts.at(-1))
    assert.equal(rule(input, 'W04').status, 'fail')
    assert.equal(rule(input, 'W03').status, 'fail')
  }
})

test('verified excerpts retain maximum characters and paragraph limits', () => {
  const input = fixture()
  input.kit.blocks[1].slots[1].maxCharacters = 20
  assert.equal(rule(input, 'W03').status, 'fail')
  const paragraphs = fixture(['Huge thanks to everyone', 'who supported these fighters and coaches!'])
  paragraphs.kit.blocks[1].slots[1].paragraphs = 1
  assert.equal(rule(paragraphs, 'W03').status, 'fail')
})

test('ordinary editorial prose retains the demo length floor', () => {
  const input = fixture('To our sponsors: thank you!')
  input.kit.blocks[1].slots[1].role = 'editorial.paragraph'
  assert.equal(rule(input, 'W03').status, 'fail')
})

test('faithful lead-and-point excerpts keep their shape without a second contradictory length floor', () => {
  const input = fixture([
    'Huge thanks to everyone who supported these fighters and coaches!',
    'To our sponsors: thank you!'
  ])
  input.kit.blocks[1].slots[1].demoChars = { total: 190, lead: 120, bullets: [70] }
  input.kit.blocks[1].slots[1].bullets = 1
  assert.equal(rule(input, 'W03').status, 'pass')
  assert.equal(rule(input, 'W15').status, 'pass')
})

test('export refuses invented article bodies even when a failed copy is selected', () => {
  const input = fixture('Nobody left early.')
  for (const platform of [undefined, 'wordpress']) {
    const result = exportContractMapping({ ...input, contract: 'demo', revision: 'one', platform })
    assert.ok(result.problems.some((p) => p.code === 'ARTICLE_EXCERPT'))
    assert.ok(!Object.values(result.mapping.changes).some((v) => v.includes('Nobody left early.')))
  }
})

test('provenance and excerpt export guards both survive reconciliation', () => {
  const input = fixture('Nobody left early.')
  input.kit.blocks[1].slots[0].role = 'article.title'
  const before = JSON.stringify(input)
  for (const platform of [undefined, 'wordpress']) {
    const result = exportContractMapping({ ...input, contract: 'demo', revision: 'one', platform })
    assert.ok(result.problems.some((p) => p.code === 'ARTICLE_PROVENANCE'))
    assert.ok(result.problems.some((p) => p.code === 'ARTICLE_EXCERPT'))
    assert.equal(result.mapping.changes['module-2.1'], undefined)
    assert.equal(result.mapping.changes['module-2.2'], undefined)
  }
  assert.equal(JSON.stringify(input), before, 'both guards preserve frozen inputs')
})

test('the writer receives the original-post rule and truthful length exception in its kit input', () => {
  const input = fixture()
  assert.match(fixedPart(writerInput(input)), /faithful contiguous excerpt/)
  assert.match(fixedPart(writerInput(input)), /no demo minimum length/)
})

test('the write step stops before applying invented article copy', async () => {
  const input = fixture('Nobody left early.')
  input.plan.site.legalPages = []
  const { report, site } = await runStep(
    { copy: input.copy, plan: input.plan, brief: input.brief },
    {},
    { kit: { ref: 'demo-gym/j6/1.0.0', doc: input.kit } }
  )
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'BAD_FILE')
  assert.match(report.cause.reason, /Article copy needs correction/)
  assert.equal(site.applies().length, 0)
})
