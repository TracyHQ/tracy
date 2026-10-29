import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { planSite } from 'website-opportunities/domain/site-plan.mjs'
import { copyPinsOf } from '../src/sites/brief-engines/wo-copy-pins.js'

async function pinsFor(t, cms, map, brief) {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-quote-pins-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(map))
  const plan = planSite(brief, { questions: [] }, { contentMap: map })
  return copyPinsOf(
    {
      copyFor: async () => ({ buildId: 'b1', pinned: {}, placeProfile: { profile: {}, assessment: [] } }),
      sitePlanFor: async () => plan
    },
    {
      siteKey: 'fictional',
      email: 'owner@example.test',
      contract: { id: 'fictional/1.0.0', dir },
      note() {}
    },
    {
      cms,
      contentMap: map,
      lang: 'en'
    }
  )
}

for (const cms of ['joomla', 'wordpress']) {
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    slots: ['quote.text', 'quote.author_name', 'quote.author_context'].map((role, i) => ({
      key: `card.${i}`,
      entity: 'module-8',
      type: 'text',
      role,
      group: { id: 'module-8.quote.0', kind: 'quote', item: 0 },
      maxCharacters: 50
    }))
  }
  const brief = { googlePlace: { reviews: [{ author: 'Mara Vale', text: 'The bread was fresh.' }] } }
  test(`${cms}: the last pins carry the chosen whole review with its author and platform`, async (t) => {
    const out = await pinsFor(t, cms, map, brief)
    assert.ok(out)
    assert.deepEqual(out.pins, {
      'card.0': 'The bread was fresh.',
      'card.1': 'Mara Vale',
      'card.2': 'Google review'
    })
  })
  test(`${cms}: a quote with no fitting review is pinned empty so the writer cannot refill it`, async (t) => {
    const shortMap = { ...map, slots: map.slots.map((s) => ({ ...s, maxCharacters: 2 })) }
    const out = await pinsFor(t, cms, shortMap, brief)
    assert.ok(out)
    assert.deepEqual(out.pins, { 'card.0': '', 'card.1': '', 'card.2': '' })
  })
}

// The released JA Boxing 1.0.8 map measures its About quote box at 581 characters, below a long guest review.
test('the released Joomla T4 map: a guest review over 900 characters pins its own whole sentences, its author and platform', async (t) => {
  const { readFileSync } = await import('node:fs')
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  const review = [
    'I joined the rowing club last spring after years of telling myself I was too busy to train properly.',
    'From the first session the coaches watched my stroke closely and corrected my posture without ever making me feel slow.',
    'They planned every week around my work shifts, which nobody else had offered to do.',
    'The boathouse is spotless, the equipment is cared for, and the changing rooms are always ready before the early crews arrive.',
    'What surprised me most was how patient the team was when I struggled with the ergometer drills during the cold months.',
    'They broke each drill into small steps and showed me how to measure progress over a whole season rather than a single morning.',
    'My resting heart rate dropped, my back pain is gone, and I finally finished the river race I had entered twice before and abandoned.',
    'If you are hesitant, book a trial row and talk to the coaches; they listen first and only then suggest a plan.'
  ].join(' ')
  assert.ok(review.length > 900)
  const brief = {
    business: { name: 'Larkspur Rowing Club' },
    primaryAction: { label: 'Book a trial row', channel: 'contact' },
    reading: { team: [{ id: 'owner', label: 'Ivo Marsh', role: 'Founder' }] },
    googlePlace: { reviews: [{ author: 'Nell Ashdown', text: review }] }
  }
  const quote = map.slots.filter((s) => s.group?.kind === 'quote' && s.type === 'text')
  const words = quote.find((s) => s.role === 'quote.text')
  const out = await pinsFor(t, 'joomla', map, brief)
  assert.ok(out)
  const pinned = out.pins[words.key]
  assert.ok(review.startsWith(pinned) && pinned.length > 300, 'real leading words, not a stub')
  assert.match(pinned, /\.$/, 'ends where a sentence of the review ends')
  assert.ok(pinned.length <= words.fit.maxCharacters, 'within the measured box the plugin enforces')
  assert.equal(out.pins[quote.find((s) => s.role === 'quote.author_name').key], 'Nell Ashdown')
  assert.equal(out.pins[quote.find((s) => s.role === 'quote.author_context').key], 'Google review')
})
