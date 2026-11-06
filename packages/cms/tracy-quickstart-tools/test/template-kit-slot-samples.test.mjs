// Samples settled again on a written kit (`cli.mjs samples`): every text slot takes the whole demo text and its
// lengths from the content map, and nothing else in the kit moves. Fabricated studio, fabricated content map.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settleSamples } from '../template-kit/lib/slot-samples.mjs'
import { demoCharsOf, partsOf, SAMPLE_CAP, sampleOf } from '../template-kit/lib/text-format.mjs'
import { stampSettled, TOOL, TOOL_VERSION } from '../template-kit/lib/version.mjs'

const LEAD = 'Every session at the Harbour Studio opens with a slow warm-up for the whole body.'
const ITEMS = ['Warm up', 'Footwork and guard drills with a partner', 'Cooldown and stretch']
const INTRO =
  'Ten rounds split between skill work and conditioning: half the class on technique, the other half on strength, closed with a calm cooldown and breathwork for everyone.'
const map = {
  slots: [
    { key: 'module-7.1', type: 'text', sample: `${INTRO}\r\n\r\n` },
    {
      key: 'module-7.2',
      type: 'text',
      sample: `((p))${LEAD}((/p))\n((ul class="list"))\n\t${ITEMS.map((t) => `((li))${t}((/li))`).join('\n\t')}\n((/ul))`
    },
    { key: 'module-7.3', type: 'image', sample: 'images/studio/hero.jpg' },
    { key: 'article-3.0', type: 'text', sample: `((p))${'Long body words. '.repeat(120)}((/p))` }
  ]
}
const cut = (t) => `${t.split(' ').slice(0, 8).join(' ')}…`
const kit = () => ({
  tool: 'template-kit 3.0.0',
  approval: { by: 'someone', imagesSha256: 'abc' },
  images: [{ id: 'block-7-1440', path: 'images/block-7-1440.jpg', sha256: 'def' }],
  blocks: [
    {
      id: 'block-7',
      slots: [
        {
          id: 'block-7.1',
          role: 'editorial.paragraph',
          type: 'text',
          sample: cut(INTRO),
          paragraphs: 1,
          bullets: 0
        }
      ],
      lists: [
        {
          id: 'block-7.steps',
          rowSlots: [
            { id: 'block-7.2', type: 'text', sample: `${cut(LEAD)}\n- Warm up`, paragraphs: 1, bullets: 3 }
          ],
          rows: [
            {
              index: 0,
              slots: [{ id: 'block-7.2', type: 'text', sample: cut(LEAD), paragraphs: 1, bullets: 3 }]
            }
          ]
        }
      ],
      frames: [{ id: 'block-7.3', type: 'image' }],
      demoOwned: [
        { id: 'block-7.3', role: 'business.hero_image', sample: 'images/studio/hero.jpg' },
        {
          id: 'article-3.0',
          role: 'editorial.body',
          type: 'text',
          sample: 'Long body…',
          paragraphs: 1,
          bullets: 0
        }
      ]
    }
  ]
})

test('a slot sample is the whole demo text, a list one part per line, with its plain-text lengths', () => {
  const one = sampleOf(map.slots[0].sample)
  assert.equal(one.sample, INTRO)
  assert.deepEqual(one.demoChars, { total: INTRO.length, lead: null, bullets: [] })
  const tab = sampleOf(map.slots[1].sample)
  assert.equal(tab.sample, [LEAD, ...ITEMS.map((t) => `- ${t}`)].join('\n'))
  assert.deepEqual(tab.demoChars, {
    total: [LEAD, ...ITEMS].join(' ').length,
    lead: LEAD.length,
    bullets: ITEMS.map((t) => t.length)
  })
  assert.deepEqual(demoCharsOf(partsOf('((ul))((li))One((/li))((/ul))')), {
    total: 3,
    lead: null,
    bullets: [3]
  })
})

test('a long article body is cut at the cap; its lengths still count the whole text', () => {
  const body = sampleOf(map.slots[3].sample)
  assert.ok(body.sample.endsWith('…'))
  assert.ok(body.sample.length <= SAMPLE_CAP + 1)
  assert.equal(body.demoChars.total, 'Long body words. '.repeat(120).trim().length)
})

test('settling samples rewrites only sample and demoChars of every text slot', () => {
  const k = kit()
  const before = structuredClone(k)
  const r = settleSamples(k, { map })
  assert.deepEqual(
    {
      slots: r.slots,
      cutBefore: r.cutBefore,
      cutAfter: r.cutAfter,
      capped: r.capped,
      without: r.withoutMapSlot
    },
    { slots: 3, cutBefore: 3, cutAfter: 1, capped: 1, without: [] }
  )
  const b = k.blocks[0]
  assert.equal(b.slots[0].sample, INTRO)
  assert.equal(b.lists[0].rows[0].slots[0].demoChars.lead, LEAD.length)
  assert.deepEqual(
    b.lists[0].rowSlots[0].demoChars.bullets,
    ITEMS.map((t) => t.length)
  )
  // Strip what the settle may write: the rest must be the kit as it was (ids, counts, image samples, approval).
  const strip = (x) =>
    JSON.parse(
      JSON.stringify(x, (key, v) =>
        key === 'demoChars'
          ? undefined
          : key === 'sample' && typeof v === 'string' && !v.startsWith('images/')
            ? ''
            : v
      )
    )
  assert.deepEqual(strip(k), strip(before))
  assert.equal(b.demoOwned[0].sample, 'images/studio/hero.jpg', 'an image slot keeps its sample')
  assert.equal(settleSamples(k, { map }).changed, 0, 'settling twice changes nothing')
})

test('a settled kit names the tool version that settled it', () => {
  const k = stampSettled(kit(), '2026-01-01T00:00:00.000Z')
  assert.equal(k.tool, TOOL)
  assert.equal(TOOL, `template-kit ${TOOL_VERSION}`)
  assert.match(TOOL_VERSION, /^\d+\.\d+\.\d+$/)
  assert.equal(k.settledAt, '2026-01-01T00:00:00.000Z')
})
