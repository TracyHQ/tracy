import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planSite } from '../domain/site-plan.mjs'
import { honestWritten } from '../domain/honest-written.mjs'

const served = { questions: [{ id: 'name', kind: 'text' }] }
const mapOf = (kind = 'module') => ({
  entities: [{ key: `${kind}-21`, kind }],
  slots: ['quote.text', 'quote.author_name', 'quote.author_context'].map((role, i) => ({
    key: `${kind}-21.${i}`,
    entity: `${kind}-21`,
    column: 'content',
    type: 'text',
    role,
    sample: ['Demo guest words.', 'Demo Guest', 'Demo source'][i],
    maxCharacters: i === 0 ? 200 : 60,
    fit: { measured: true, maxChars: { desktop: i === 0 ? 65 : 60 } },
    group: { id: `${kind}-21.quote.0`, kind: 'quote', item: 0 }
  }))
})
const briefOf = (trade) => ({
  business: { name: trade === 'bakery' ? 'Quill Bakery' : 'Copper Garage' },
  reading: { team: [{ id: 'owner', label: 'Ellis Rowan', role: 'Owner' }] },
  googlePlace: {
    reviews: [
      { author: 'Mara Vale', text: 'The staff explained everything with care. '.repeat(5).trim() },
      {
        author: 'Theo Brook',
        text:
          trade === 'bakery'
            ? 'The bread was fresh. I will return.'
            : 'The repair was careful. I will return.'
      }
    ]
  }
})

for (const trade of ['bakery', 'garage'])
  test(`${trade}: the measured quote box gets one whole review and its real attribution`, () => {
    const brief = briefOf(trade)
    const map = mapOf(trade === 'bakery' ? 'module' : 'post')
    const { honesty } = planSite(brief, served, { contentMap: map })
    const [body, author, platform] = map.slots
    assert.equal(honesty.values[body.key]?.value, brief.googlePlace.reviews[1].text)
    assert.equal(honesty.values[author.key]?.value, 'Theo Brook')
    assert.equal(honesty.values[platform.key]?.value, 'Google review')
    assert.equal(
      honesty.blanks.some((b) => b.key === author.key),
      false
    )
    const out = honestWritten({
      slots: map.slots,
      written: { [body.key]: 'The staff explained...' },
      ownText: '',
      honesty
    })
    assert.equal(out.values[body.key], brief.googlePlace.reviews[1].text)
    assert.equal(out.values[author.key], 'Theo Brook')
  })

test('no whole review fits: all guest quote words are emptied together, even when an owner is known', () => {
  const brief = briefOf('bakery')
  const map = mapOf()
  for (const slot of map.slots) slot.maxCharacters = 2
  const { honesty } = planSite(brief, served, { contentMap: map })
  assert.deepEqual(
    map.slots.map((s) => honesty.values[s.key]),
    [undefined, undefined, undefined]
  )
  assert.deepEqual(new Set(honesty.blanks.map((s) => s.key)), new Set(map.slots.map((s) => s.key)))
  const out = honestWritten({
    slots: map.slots,
    written: Object.fromEntries(map.slots.map((s) => [s.key, s.sample])),
    ownText: '',
    honesty
  })
  assert.deepEqual(new Set(out.drop), new Set(map.slots.map((s) => s.key)))
})

test('a guest quote without a source field carries its platform beside its real author', () => {
  const map = mapOf()
  map.slots.pop()
  const { honesty } = planSite(briefOf('garage'), served, { contentMap: map })
  assert.equal(honesty.values[map.slots[1].key].value, 'Theo Brook, Google review')
})

test('a reviewer name that does not fit selects another whole record, never the owner or shortened initials', () => {
  const brief = briefOf('bakery')
  brief.googlePlace.reviews[0] = {
    author: 'A Fictional Reviewer With A Very Long Name',
    text: 'Fresh bread.'
  }
  const map = mapOf()
  map.slots[1].maxCharacters = 12
  const { honesty } = planSite(brief, served, { contentMap: map })
  assert.equal(honesty.values[map.slots[1].key].value, 'Theo Brook')
  assert.equal(honesty.values[map.slots[0].key].value, brief.googlePlace.reviews[1].text)
})

test('a source already ending in an ellipsis is not offered as a whole review', () => {
  const brief = briefOf('bakery')
  brief.googlePlace.reviews[0] = { author: 'Mara Vale', text: 'The bread was fresh...' }
  const map = mapOf()
  const { honesty } = planSite(brief, served, { contentMap: map })
  assert.equal(honesty.values[map.slots[0].key].value, brief.googlePlace.reviews[1].text)
})

const longReviewOf = (trade) =>
  trade === 'bakery'
    ? 'I order a loaf every Friday. The crust stays crisp until Sunday. The staff remember how I like it sliced and wrapped.'
    : 'They found the rattle in one visit. The invoice matched the quote. They showed me the worn part before replacing it.'

for (const trade of ['bakery', 'garage'])
  test(`${trade}: a review longer than its box shows its own leading sentences with its real author and platform`, () => {
    const brief = briefOf(trade)
    brief.googlePlace.reviews = [{ author: 'Mara Vale', text: longReviewOf(trade) }]
    const map = mapOf()
    const { honesty } = planSite(brief, served, { contentMap: map })
    const words = honesty.values[map.slots[0].key]?.value
    assert.ok(words, 'the quote keeps real words')
    assert.ok(longReviewOf(trade).startsWith(words), 'an excerpt is a prefix of the real review')
    assert.match(words, /\.$/, 'the excerpt ends where a sentence ends')
    assert.ok(words.length <= 65)
    assert.equal(honesty.values[map.slots[1].key]?.value, 'Mara Vale')
    assert.equal(honesty.values[map.slots[2].key]?.value, 'Google review')
    assert.equal(honesty.records.find((r) => r.kind === 'quote')?.excerpt, true)
  })

test('a whole review that fits wins over a longer excerpt of another review', () => {
  const brief = briefOf('bakery')
  brief.googlePlace.reviews = [
    { author: 'Mara Vale', text: longReviewOf('bakery') },
    { author: 'Theo Brook', text: 'Fresh bread.' }
  ]
  const { honesty } = planSite(brief, served, { contentMap: mapOf() })
  assert.equal(honesty.values['module-21.0'].value, 'Fresh bread.')
  assert.equal(honesty.values['module-21.1'].value, 'Theo Brook')
})

test('a review with no sentence end inside its box is never cut: the guest quote is emptied whole', () => {
  const brief = briefOf('garage')
  brief.googlePlace.reviews = [
    {
      author: 'Mara Vale',
      text: `${'The mechanic checked every hose and every belt and the brakes '.repeat(2)}twice.`
    },
    {
      author: 'Theo Brook',
      text: 'Dr. Rowan sent me here and the repair was careful from the first visit to the last one.'
    }
  ]
  const map = mapOf()
  const { honesty } = planSite(brief, served, { contentMap: map })
  assert.deepEqual(
    map.slots.map((s) => honesty.values[s.key]),
    [undefined, undefined, undefined]
  )
})
