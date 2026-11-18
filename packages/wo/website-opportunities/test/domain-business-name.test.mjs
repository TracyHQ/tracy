// The name a business's site carries: suggested when two sources other than Google agree, checked by a person when
// the sources disagree, and final when the person typed or picked it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chosenNameOf,
  decideBusinessName,
  handleOfSocialUrl,
  isSameHandle,
  logoNameSpelling,
  nameKey
} from '../domain/business-name.mjs'

// Measured on dev 26/10/2026: Google Maps and magicpin name the service, the logo and Instagram the club.
const DUBAI = [
  { source: 'google', name: 'Padel & Tennis Coach', via: 'name' },
  { source: 'instagram', name: 'Harbour Sport Club', via: 'name' },
  { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
  { source: 'listing', label: 'magicpin', name: 'Padel & Tennis Coach', via: 'name' },
  { source: 'logo', name: 'HARBOUR SPORT CLUB', via: 'logo' }
]

test('nameKey: a handle and a written name of one business are one key', () => {
  assert.equal(nameKey('harbour.sportclub'), nameKey('Harbour Sport Club'))
  assert.equal(nameKey('Café Olé!'), nameKey('cafe ole'))
  assert.notEqual(nameKey('Padel & Tennis Coach'), nameKey('Harbour Sport Club'))
  assert.equal(nameKey('  '), '')
})

test('handleOfSocialUrl: the handle of a social page, never a path that is not one', () => {
  assert.equal(handleOfSocialUrl('https://www.instagram.com/harbour.sportclub/'), 'harbour.sportclub')
  assert.equal(handleOfSocialUrl('https://www.facebook.com/profile.php?id=1'), null)
  assert.equal(handleOfSocialUrl('https://example.ae/'), null)
  assert.equal(handleOfSocialUrl(null), null)
})

test('Harbour Sport Club: Google names only the trade, so the name logo and Instagram agree on is the decision', () => {
  const d = decideBusinessName({ claims: DUBAI, fallback: 'Padel & Tennis Coach' })
  assert.equal(d.name, 'Harbour Sport Club')
  assert.equal(d.suggested, 'Harbour Sport Club')
  assert.equal(d.current, 'Harbour Sport Club')
  assert.equal(d.state, 'agreed')
  assert.equal(d.disagree, false)
  assert.deepEqual(d.options, [
    { name: 'Harbour Sport Club', sources: [{ source: 'logo' }, { source: 'instagram' }] }
  ])
})

test('Google with a proper name: logo and Instagram agreeing are suggested and checked', () => {
  const claims = DUBAI.map((c) =>
    c.name === 'Padel & Tennis Coach' ? { ...c, name: 'Marina Racquet House' } : c
  )
  const d = decideBusinessName({ claims, fallback: 'Marina Racquet House' })
  assert.equal(d.name, 'Harbour Sport Club')
  assert.equal(d.current, 'Marina Racquet House')
  assert.equal(d.state, 'check')
  assert.equal(d.disagree, true)
  assert.deepEqual(d.options, [
    { name: 'Harbour Sport Club', sources: [{ source: 'instagram' }, { source: 'logo' }] },
    {
      name: 'Marina Racquet House',
      sources: [{ source: 'google' }, { source: 'listing', label: 'magicpin' }]
    }
  ])
})

test('one source saying a name twice (its name and its handle) is not two sources: Google is kept', () => {
  const claims = DUBAI.filter((c) => c.source !== 'logo').map((c) =>
    c.name === 'Padel & Tennis Coach' ? { ...c, name: 'Marina Racquet House' } : c
  )
  const d = decideBusinessName({ claims })
  assert.equal(d.name, 'Marina Racquet House')
  assert.equal(d.state, 'check')
  assert.equal(d.options[0].name, 'Marina Racquet House')
})

test('Instagram and the website agreeing is enough; a handle alone is never shown as a name', () => {
  const d = decideBusinessName({
    claims: [
      { source: 'google', name: 'Padel & Tennis Coach', via: 'name' },
      { source: 'website', name: 'Harbour Sport Club', via: 'name' },
      { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
      { source: 'tiktok', name: 'padel_dxb_99', via: 'handle' }
    ]
  })
  assert.equal(d.name, 'Harbour Sport Club')
  assert.deepEqual(
    d.options.map((o) => o.name),
    ['Harbour Sport Club', 'Padel & Tennis Coach']
  )
})

test('sources that agree: the name, no check', () => {
  const d = decideBusinessName({
    claims: [
      { source: 'google', name: 'Taco Corner No. 7', via: 'name' },
      { source: 'website', name: 'TACO CORNER NO 7', via: 'name' },
      { source: 'instagram', name: 'tacocornerno7', via: 'handle' }
    ]
  })
  assert.equal(d.name, 'Taco Corner No. 7')
  assert.equal(d.state, 'agreed')
  assert.equal(d.disagree, false)
  assert.equal(d.options.length, 1)
})

test('no claims: the fallback name, agreed', () => {
  const d = decideBusinessName({ fallback: 'Corner Bakery' })
  assert.equal(d.name, 'Corner Bakery')
  assert.equal(d.state, 'agreed')
  assert.deepEqual(d.options, [])
})

test('a typed name is final: no check, even against every source', () => {
  const d = decideBusinessName({ claims: DUBAI, chosen: { name: 'Harbour Sport Club Group', by: 'typed' } })
  assert.equal(d.name, 'Harbour Sport Club Group')
  assert.equal(d.state, 'chosen')
  assert.deepEqual(d.chosen, { name: 'Harbour Sport Club Group', by: 'typed' })
  assert.equal(d.suggested, 'Harbour Sport Club')
  assert.equal(d.disagree, true)
})

test('a picked name is final, Google kept when the person keeps it', () => {
  const d = decideBusinessName({ claims: DUBAI, chosen: { name: 'Padel & Tennis Coach', by: 'picked' } })
  assert.equal(d.name, 'Padel & Tennis Coach')
  assert.equal(d.state, 'chosen')
  assert.equal(d.chosen.by, 'picked')
})

test('chosenNameOf: a pick beats the typed name; a pasted link placeholder is never typed', () => {
  const isHost = (n) => /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(n)
  assert.deepEqual(
    chosenNameOf({
      provider: 'google-places',
      candidate: { name: 'Padel & Tennis Coach', typedName: 'HSC', namePick: { name: 'Harbour Sport Club' } }
    }),
    { name: 'Harbour Sport Club', by: 'picked' }
  )
  assert.deepEqual(chosenNameOf({ provider: 'google-places', candidate: { typedName: 'HSC' } }), {
    name: 'HSC',
    by: 'typed'
  })
  assert.equal(chosenNameOf({ provider: 'google-places', candidate: { name: 'Padel & Tennis Coach' } }), null)
  assert.deepEqual(chosenNameOf({ provider: 'url', candidate: { name: 'Taco Corner No. 7' } }, isHost), {
    name: 'Taco Corner No. 7',
    by: 'typed'
  })
  assert.equal(chosenNameOf({ provider: 'url', candidate: { name: 'instagram.com' } }, isHost), null)
  assert.equal(chosenNameOf(null), null)
})

// Measured on dev 26/10/2026 (opportunity 5a1e2b3c): the Instagram page shows its handle as its name, so the only
// spelling of "Harbour Sport Club" a source gives is the logo's, in capitals. The site showed "harbour.sportclub".
const DUBAI_HANDLE_AS_NAME = [
  { source: 'google', name: 'Padel & Tennis Coach', via: 'name' },
  { source: 'instagram', name: 'harbour.sportclub', via: 'name' },
  { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
  { source: 'listing', label: 'magicpin', name: 'Padel & Tennis Coach', via: 'name' },
  { source: 'logo', name: 'HARBOUR SPORT CLUB', via: 'logo' }
]

test('Harbour Sport Club: a profile name equal to its handle is never shown; the logo text in title case is', () => {
  const d = decideBusinessName({ claims: DUBAI_HANDLE_AS_NAME, fallback: 'Padel & Tennis Coach' })
  assert.equal(d.name, 'Harbour Sport Club')
  assert.equal(d.suggested, 'Harbour Sport Club')
  assert.equal(d.state, 'agreed')
  assert.deepEqual(d.options, [
    { name: 'Harbour Sport Club', sources: [{ source: 'logo' }, { source: 'instagram' }] }
  ])
  assert.ok(!d.options.some((o) => o.name === 'harbour.sportclub'))
})

test('sources agreeing through a handle with no logo text: today’s name stays, a handle is never suggested', () => {
  const d = decideBusinessName({
    claims: [
      { source: 'google', name: 'Padel & Tennis Coach', via: 'name' },
      { source: 'instagram', name: 'harbour.sportclub', via: 'name' },
      { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
      { source: 'facebook', name: 'harboursportclub', via: 'name' },
      { source: 'facebook', name: 'harboursportclub', via: 'handle' }
    ],
    fallback: 'Padel & Tennis Coach'
  })
  assert.equal(d.name, 'Padel & Tennis Coach')
  assert.equal(d.suggested, 'Padel & Tennis Coach')
  assert.deepEqual(
    d.options.map((o) => o.name),
    ['Padel & Tennis Coach']
  )
})

test('a real display name beats the logo text; isSameHandle and logoNameSpelling', () => {
  const d = decideBusinessName({
    claims: [...DUBAI_HANDLE_AS_NAME, { source: 'website', name: 'Harbour Sport Club', via: 'name' }]
  })
  assert.equal(d.name, 'Harbour Sport Club')
  assert.equal(isSameHandle('Harbour.SportClub', '@harbour.sportclub'), true)
  assert.equal(isSameHandle('Harbour Sport Club', 'harbour.sportclub'), false)
  assert.equal(logoNameSpelling('HARBOUR SPORT CLUB'), 'Harbour Sport Club')
  assert.equal(logoNameSpelling('HOUSE OF TEA AND CAKE'), 'House of Tea and Cake')
  assert.equal(logoNameSpelling('the corner bakery'), 'The Corner Bakery')
  assert.equal(logoNameSpelling('McDonald’s'), 'McDonald’s')
})
