/**
 * The LLM label judge of the content coverage audit (spec #37, issue #44): given a content map, the audit's page
 * snapshots and a judge, the audit asks once per component whether each slot's role is right, caches the answer per
 * slot content hash, and never calls a slot passed it did not judge. The judge here is a stub; no model is called.
 * Every business, person, phone and page is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoverageFile } from '../content-coverage/lib/coverage-file.mjs'
import { judgeLabels, slotHash } from '../content-coverage/lib/label-judge.mjs'
import { createVisionJudge } from '../content-coverage/lib/label-judge-vision.mjs'

const V3 = 'place-content-roles/3'
const text = (key, sample, role, extra = {}) => ({
  key,
  entity: key.replace(/\.[^.]+$/, ''),
  type: 'text',
  sample,
  role,
  ...extra
})

/** A fictional boxing club: module-12 shows coaches with a phone and a claim, module-13 the class intro. */
function mapOf(version = V3, over = {}) {
  return {
    roleVocabularyVersion: version,
    entities: [
      { key: 'module-12', kind: 'module', identity: { title: 'Our coaches', position: 'section-3' } },
      { key: 'module-13', kind: 'module', identity: { title: 'Classes', position: 'section-4' } }
    ],
    slots: [
      text('module-12.title', 'Meet the coaches', 'editorial.heading', { column: 'title' }),
      text('module-12.phone', '(555) 014-2290', 'editorial.paragraph'),
      text('module-12.claim', 'No1 boxing club since 2009', 'editorial.heading'),
      text('module-13.title', 'Find your class', 'editorial.heading', { column: 'title' }),
      text('module-13.intro', 'Train hard, rest well', 'editorial.paragraph', over.intro ?? {}),
      {
        key: 'module-13.link',
        entity: 'module-13',
        type: 'url',
        sample: '/classes',
        role: 'editorial.navigation_url'
      }
    ]
  }
}

const at = (y) => ({ visible: true, rect: { x: 40, y, w: 400, h: 30 }, selector: '' })
const item = (key, y, value) => ({
  status: 'matched',
  matchBy: 'exact',
  kind: 'text',
  value,
  slots: [key],
  viewports: { desktop: at(y), phone: at(y) }
})
const FINDINGS = {
  pages: [
    {
      n: 1,
      url: 'https://ironreed-boxing.example/',
      title: 'Ironreed Boxing Club',
      shots: {
        desktop: { file: 'shots/001-desktop.jpg', width: 1440, height: 4000 },
        phone: { file: 'shots/001-phone.jpg', width: 390, height: 6000 }
      },
      items: [
        item('module-12.title', 100, 'Meet the coaches'),
        item('module-12.phone', 150, '(555) 014-2290'),
        item('module-12.claim', 200, 'No1 boxing club since 2009'),
        item('module-13.title', 3000, 'Find your class'),
        item('module-13.intro', 3050, 'Train hard, rest well')
      ]
    }
  ]
}

/** A stub judge: wrong for the phone and the claim, a finer mismatch on the intro, right for the rest. */
function stubJudge(answers = {}) {
  const calls = []
  return {
    calls,
    model: 'stub-vision',
    ceilingCents: 2,
    async judge(unit) {
      calls.push(unit)
      const say = {
        'module-12.phone': { verdict: 'wrong', suggestedRole: 'contact.phone', why: 'a phone number' },
        'module-12.claim': { verdict: 'wrong', suggestedRole: 'claim.heading', why: 'a ranking and a year' },
        'module-13.intro': { verdict: 'wrong', suggestedRole: 'editorial.heading', why: 'set as a heading' },
        ...answers
      }
      return {
        slots: unit.slots.map((s) => ({ n: s.n, ...(say[s.key] ?? { verdict: 'right' }) })),
        cents: 1
      }
    }
  }
}
const crop = async (components) => new Map(components.map((c) => [c.id, 'data:image/jpeg;base64,AAAA']))
const run = (over = {}) =>
  judgeLabels({ map: mapOf(), findings: FINDINGS, mods: {}, crop, previous: null, ...over })
const entry = (block, key) => block.slots.find((s) => s.key === key)

test('a fact slot labelled editorial is reported wrong with a suggested role, one call per component', async () => {
  const ask = stubJudge()
  const block = await run({ ask })
  assert.equal(ask.calls.length, 2)
  assert.equal(block.state, 'judged')
  const phone = entry(block, 'module-12.phone')
  assert.deepEqual(
    [phone.verdict, phone.role, phone.suggested, phone.groupWrong],
    ['wrong', 'editorial.paragraph', 'contact.phone', true]
  )
  const claim = entry(block, 'module-12.claim')
  assert.deepEqual([claim.verdict, claim.suggested, claim.groupWrong], ['wrong', 'claim.heading', true])
  const intro = entry(block, 'module-13.intro')
  assert.deepEqual([intro.verdict, intro.suggested, intro.groupWrong], ['wrong', 'editorial.heading', false])
  assert.equal(entry(block, 'module-12.title').verdict, 'right')
  assert.deepEqual(block.counts, {
    slots: 5,
    located: 5,
    notLocated: 0,
    judged: 5,
    notJudged: 0,
    right: 2,
    wrongGroup: 2,
    mismatch: 1
  })
  // URL slots are left to the mechanical rules.
  assert.equal(entry(block, 'module-13.link'), undefined)
})

test('the judge sees the crop, the slot table and the page, module and neighbour context', async () => {
  const ask = stubJudge()
  await run({ ask })
  const unit = ask.calls.find((u) => u.module.entity === 'module-12')
  assert.equal(unit.image, 'data:image/jpeg;base64,AAAA')
  assert.deepEqual(unit.page, { title: 'Ironreed Boxing Club', url: 'https://ironreed-boxing.example/' })
  assert.deepEqual(unit.module, { entity: 'module-12', title: 'Our coaches', position: 'section-3' })
  assert.deepEqual(unit.neighbours, ['Classes'])
  assert.deepEqual(unit.slots[1], {
    n: 2,
    key: 'module-12.phone',
    sample: '(555) 014-2290',
    role: 'editorial.paragraph',
    group: null,
    fit: null
  })
})

test('a second run on unchanged content makes no model call', async () => {
  const first = await run({ ask: stubJudge() })
  const ask = stubJudge()
  const second = await run({ ask, previous: { labelJudge: first } })
  assert.equal(ask.calls.length, 0)
  assert.equal(second.state, 'judged')
  assert.deepEqual(second.slots, first.slots)
  assert.equal(second.calls, 0)
})

test('a changed slot asks again for its component only', async () => {
  const first = await run({ ask: stubJudge() })
  const ask = stubJudge()
  const map = mapOf(V3, { intro: { sample: 'Train hard, then rest' } })
  const second = await run({ ask, map, previous: { labelJudge: first } })
  assert.deepEqual(
    ask.calls.map((u) => u.module.entity),
    ['module-13']
  )
  assert.notEqual(entry(second, 'module-13.intro').hash, entry(first, 'module-13.intro').hash)
  assert.equal(entry(second, 'module-13.intro').hash, slotHash(map.slots[4]))
})

test('with no model the result is not judged, never passed', async () => {
  const block = await run({ ask: null })
  assert.equal(block.state, 'not-judged')
  assert.equal(block.reason, 'NO_VISION_MODEL')
  assert.equal(block.slots.length, 0)
  assert.equal(block.counts.judged, 0)
  assert.equal(block.counts.notJudged, 5)
})

test('a model that fails leaves its component not judged', async () => {
  const ask = stubJudge()
  ask.judge = async () => {
    throw Object.assign(new Error('vision 503'), { code: 'VISION_REFUSED' })
  }
  const block = await run({ ask })
  assert.equal(block.state, 'not-judged')
  assert.equal(block.reason, 'VISION_FAILED')
})

test('cost is bounded: past the call cap the rest is not judged', async () => {
  const ask = stubJudge()
  const block = await run({ ask, limits: { maxCalls: 1, maxCents: 100 } })
  assert.equal(ask.calls.length, 1)
  assert.equal(block.state, 'partly')
  assert.equal(block.reason, 'BUDGET_EXCEEDED')
  assert.equal(block.counts.notJudged, 2)
  const cents = await run({ ask: stubJudge(), limits: { maxCalls: 10, maxCents: 2 } })
  assert.equal(cents.calls, 1)
  assert.equal(cents.reason, 'BUDGET_EXCEEDED')
})

test('a suggested role outside the version 3 vocabulary is not taken: that slot is not judged', async () => {
  const ask = stubJudge({ 'module-12.phone': { verdict: 'wrong', suggestedRole: 'business.hotline' } })
  const block = await run({ ask })
  assert.equal(entry(block, 'module-12.phone'), undefined)
  assert.equal(block.state, 'partly')
  assert.equal(block.reason, 'ANSWER_UNREADABLE')
})

test('a version 2 map is not sent to the model', async () => {
  const ask = stubJudge()
  const block = await run({ ask, map: mapOf('place-content-roles/2') })
  assert.equal(ask.calls.length, 0)
  assert.deepEqual([block.state, block.reason, block.applies], ['not-judged', 'VOCABULARY_NOT_V3', false])
})

test('the verdicts are written into the committed coverage file beside labelRules', async () => {
  const labelJudge = await run({ ask: stubJudge() })
  const contract = {
    manifest: { id: 'quickstart/ironreed/j6/1.0.0' },
    sha256: { contentMap: 'a'.repeat(64), presentationLock: 'b'.repeat(64) },
    map: mapOf()
  }
  const result = {
    pages: [],
    failures: [],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const doc = buildCoverageFile({ result, contract, labelJudge })
  assert.ok(doc.labelRules)
  assert.equal(doc.labelJudge.state, 'judged')
  assert.equal(doc.tool.version, '1.3.0')
  const none = buildCoverageFile({ result, contract })
  assert.equal(none.labelJudge, undefined)
})

test('the vision call sends the input check, the table and the crop, and refuses an answer that did not read the check', async () => {
  const sent = []
  const reply = (content) => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 3000, completion_tokens: 200 }
    })
  })
  let answer = { imageCode: '12345678', slots: [{ n: 1, verdict: 'right' }] }
  const vision = createVisionJudge({
    door: { url: 'https://vision.example/v1/chat', key: 'test-key', model: 'deepseek-chat' },
    fetchImpl: async (_url, init) => {
      sent.push(JSON.parse(init.body))
      return reply(answer)
    },
    check: {
      create: async () => ({ expectedCode: '12345678', image: 'data:image/png;base64,CHECK' }),
      instruction: 'Read the code.',
      matches: (a, c) => a?.imageCode === c.expectedCode
    }
  })
  const unit = {
    page: { title: 'Ironreed Boxing Club', url: 'https://ironreed-boxing.example/' },
    module: { entity: 'module-12', title: 'Our coaches', position: 'section-3' },
    neighbours: ['Classes'],
    slots: [{ n: 1, key: 'module-12.phone', sample: '(555) 014-2290', role: 'editorial.paragraph' }],
    image: 'data:image/jpeg;base64,CROP'
  }
  const out = await vision.judge(unit)
  assert.deepEqual(out.slots, [{ n: 1, verdict: 'right' }])
  assert.equal(out.cents, 1)
  assert.ok(vision.ceilingCents >= 1)
  const content = sent[0].messages[0].content
  assert.match(content[0].text, /claim\.heading \(fact\)/)
  assert.equal(content[1].image_url.url, 'data:image/png;base64,CHECK')
  assert.match(content[2].text, /module-12\.phone/)
  assert.equal(content[3].image_url.url, 'data:image/jpeg;base64,CROP')
  answer = { imageCode: '00000000', slots: [{ n: 1, verdict: 'right' }] }
  await assert.rejects(vision.judge(unit), /input check/)
})
