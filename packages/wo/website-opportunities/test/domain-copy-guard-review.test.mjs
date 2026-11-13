// The copy guard after the #594 review (W1, W2, W4, W5, W6): am and pm end where the word ends, an award word in a
// sentence naming a known award passes, hours that cover every day prove "open 7 days a week", a price range, deal or
// percentage is proven by the same text, the Indian grouping and the real are read, and the new guards (a superlative
// of place, "over" counts, three digit counts, any top level domain, a short phone after a call word) each come with
// honest copy they let through. Invented businesses only (`fixtures/copy-guard/invented-copy.mjs`).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-copy-guard-review.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { inventedDataOf } from '../domain/page-writer-data-guard.mjs'
import { moneyOf, priceIn } from '../domain/price-in.mjs'
import { B1, B2, B3, HONEST, INVENTED } from './fixtures/copy-guard/invented-copy.mjs'

const flagged = (text, known = B1) => inventedDataOf(text, known).map((f) => f.what)

test('the 120 honest sentences pass and the invented ones fail, but three the rules leave open', () => {
  const honest = Object.entries(HONEST).flatMap(([lang, [known, all]]) =>
    all.filter((s) => inventedDataOf(s, known).length > 0).map((s) => `${lang}: ${s}`)
  )
  assert.deepEqual(honest, [])
  assert.equal(Object.values(HONEST).flatMap(([, all]) => all).length, 120)
  const passing = Object.entries(INVENTED).flatMap(([lang, [known, all]]) =>
    all.filter((s) => inventedDataOf(s, known).length === 0).map((s) => `${lang}: ${s}`)
  )
  // Open: a two digit count with no "over" before it, a count in words with no claim noun, and a city prize the
  // profile's award ("Premio Citta Attiva") may well be.
  assert.deepEqual(passing, [
    'en: Serving 40 local cafés.',
    'en: Three generations of bakers.',
    'pt: Estúdio premiado pela cidade.'
  ])
})

test('W1: am and pm need a word end', () => {
  for (const s of [
    'Porta 2 amici.',
    'Traga 2 amigos.',
    'Venez avec 5 amis.',
    'Bring 3 amazing friends.',
    'Use 4 ampoules.'
  ])
    assert.deepEqual(flagged(s), [], s)
  assert.deepEqual(flagged('Open until 10pm.'), ['hours'])
  assert.deepEqual(flagged('Doors open at 7 a.m. sharp.'), [])
  assert.deepEqual(flagged('Doors open at 5 a.m. sharp.'), ['hours'])
})

test('W2: a known award named in the sentence proves its award word; known hours over seven days prove every day', () => {
  assert.deepEqual(flagged('Winner of the Golden Crust Award in 2019.'), [])
  assert.deepEqual(flagged('Ausgezeichnet mit dem Golden Crust Award 2019.'), [])
  assert.deepEqual(flagged('Winner of the Silver Loaf Award.'), ['award'])
  assert.deepEqual(flagged('Award-winning sourdough.', B2), ['award'])
  assert.deepEqual(flagged('Open 7 days a week.'), [])
  assert.deepEqual(flagged('Open 7 days a week.', B2), ['hours'], 'Tuesday to Saturday is five days')
  assert.deepEqual(flagged('Abierto todos los días.', B3), [])
})

test('W4: a range, a deal or a percentage is proven by the same text; both ends of a range are known amounts', () => {
  assert.equal(priceIn('$20-45', 'Lessons $20-45'), true)
  assert.equal(priceIn('20-45 €', 'Kurse 20-45 €'), true)
  assert.equal(priceIn('2 for £15', 'Two loaves: 2 for £15'), true)
  assert.equal(priceIn('€49 plus 19% VAT', 'Price €49 plus 19% VAT'), true)
  assert.equal(priceIn('$20-45', 'Lessons €20-45'), false)
  assert.equal(priceIn('$20-45', 'Lessons $20, room 45'), false)
  assert.equal(priceIn('2 for £15', '£15 per box'), false)
  const range = [{ kind: 'service.price', value: '$20-45' }]
  assert.deepEqual(flagged('Classes from $20 to $45', range), [])
  assert.deepEqual(flagged('Classes from $20 to $50', range), ['price'])
  assert.deepEqual(
    moneyOf('20-45 €').map((m) => [m.amount, m.currency]),
    [
      [45, 'EUR'],
      [20, 'EUR']
    ]
  )
})

test('W5: the Indian grouping parses, and R$ is the real, never the dollar', () => {
  assert.equal(priceIn('₹1,20,000', 'Course fee ₹1,20,000'), true)
  assert.deepEqual(
    moneyOf('₹1,20,000').map((m) => [m.amount, m.currency]),
    [[120000, 'INR']]
  )
  assert.equal(priceIn('$1.200,50', 'Plano anual R$ 1.200,50'), false)
  assert.equal(priceIn('R$ 1.200,50', 'Plano anual R$ 1.200,50'), true)
  assert.deepEqual(flagged('Annual plan $1.200,50', [{ kind: 'service.price', value: 'R$ 1.200,50' }]), [
    'price'
  ])
})

test('W6: superlatives of place fail, a superlative alone passes', () => {
  for (const [s, known] of [
    ['The best bakery in town.', B1],
    ['Die beste Bäckerei der Stadt.', B1],
    ['Élu meilleur atelier de Valbrune.', B2],
    ['El mejor taller de la ciudad.', B2],
    ['Il miglior studio di yoga di Milano.', B3],
    ['O melhor estúdio de Lisboa.', B3]
  ])
    assert.deepEqual(flagged(s, known), ['award'], s)
  for (const s of [
    'Slice it within 2 days for the best crumb.',
    'Our best loaves sell out by noon.',
    'Le meilleur pain, chaque matin.'
  ])
    assert.deepEqual(flagged(s), [], s)
})

test('W6: counts after "over" and counts of three digits fail unless known', () => {
  for (const s of [
    'Über 500 Stammkunden jede Woche.',
    'Plus de 5 000 vélos réparés.',
    'Over 2,000 happy customers.',
    'We bake 300 loaves a day.'
  ])
    assert.deepEqual(flagged(s), ['number'], s)
  assert.deepEqual(flagged('Oltre 300 soci praticano con noi.', B3), [])
  assert.deepEqual(flagged('Over 300 members practise with us.', B3), [])
  assert.deepEqual(flagged('Find us at 14 Quay Street, Portwell PW3 9QA.'), [])
  assert.deepEqual(flagged('Order a cake 48 hours ahead, over the phone.'), [])
})

test('W6: links of any top level domain compare whole hosts', () => {
  const meadow = [{ kind: 'contact.cta_url', value: 'https://meadowloom.com/book' }]
  assert.deepEqual(flagged('Visit loom.com today.', meadow), ['url'])
  assert.deepEqual(flagged('Book at meadowloom.com.', meadow), [])
  assert.deepEqual(flagged('Book at meadowloom.com/book.', meadow), [])
  assert.deepEqual(flagged('Saiba mais em ventoro.pt.', B3), ['url'])
  assert.deepEqual(flagged('Order at harborlantern.example.'), [])
  for (const s of ['E.g. a rye loaf.', 'Mon.-Fri. from 7 a.m.', 'Bake at 4.50 per tray, i.e. cheap.'])
    assert.deepEqual(flagged(s).includes('url'), false, s)
})

test('W6: a short number after a call word fails unless it is a known phone', () => {
  assert.deepEqual(flagged('Call 123 456 to order.'), ['phone'])
  assert.deepEqual(flagged('Ring 460958 to order.'), [], 'the end of a known phone, dialled locally')
  assert.deepEqual(flagged('Chiamaci al 02 8765 4321.', B3), [])
  assert.deepEqual(flagged('Call us for 3 loaves or 12 rolls.'), [])
})
