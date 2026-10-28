import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ACCENT_LINK_TOKENS,
  ACCENT_TOKENS,
  brandOnSiteSteps,
  contrastRatio,
  siteAccentOf,
  siteServiceAreasOf,
  siteWhatsAppOf
} from '../src/opportunities-build/brand-on-site.js'

// Harbour Sport Club, #1780 items 15 to 17: a dark green logo with a brass gold, a UAE mobile, "Locations across Dubai".
const brief = {
  brand: { accent: { hex: '#AA9247', source: 'logo', share: 0.05 } },
  contact: { whatsapp: { number: '+971 50 000 1234', verified: false, basis: 'uae-mobile' } },
  business: {
    address: 'Al Barsha, Dubai',
    serviceAreas: [
      { text: 'Locations across Dubai', quote: 'Locations across Dubai', source: 'instagram:post:3' }
    ]
  }
}

test('contrast is the WCAG ratio', () => {
  assert.equal(contrastRatio('#ffffff', '#000000').toFixed(2), '21.00')
  assert.equal(contrastRatio('#aa9247', '#ffffff').toFixed(2), '3.04')
})

test('the logo accent takes the text colour that reads on it at AA, never one under 4.5:1', () => {
  const accent = siteAccentOf(brief)
  assert.equal(accent.hex, '#aa9247')
  // White on the brass is 3.0:1, under AA; black is 6.9:1 (measured).
  assert.equal(accent.on, '#000000')
  assert.ok(accent.contrast >= 4.5)
  assert.deepEqual(Object.keys(accent.tokens), ACCENT_TOKENS)
  assert.equal(accent.tokens['--ds-c-accent'], '#aa9247')
  assert.equal(accent.tokens['--ds-c-accent-on'], '#000000')
  // Hover and pressed move away from the text colour, so the words read better there, never worse.
  for (const token of ['--ds-c-accent-hover', '--ds-c-accent-active'])
    assert.ok(contrastRatio(accent.tokens[token], accent.on) >= accent.contrast, token)
  assert.equal(accent.css, `:root{${ACCENT_TOKENS.map((t) => `${t}:${accent.tokens[t]}`).join(';')}}`)
})

test('a dark accent takes white text', () => {
  const accent = siteAccentOf({ brand: { accent: { hex: '#052514', source: 'logo', share: 0.87 } } })
  assert.equal(accent.on, '#ffffff')
  assert.ok(accent.contrast >= 4.5)
})

test('no accent from the logo, no accent on the site', () => {
  assert.equal(siteAccentOf({}), null)
  assert.equal(siteAccentOf({ brand: { accent: { hex: '#aa9247', source: 'photos' } } }), null)
  assert.equal(siteAccentOf({ brand: { accent: { hex: 'gold', source: 'logo' } } }), null)
  assert.equal(siteAccentOf({ brand: { accent: { hex: '#aa9247;color:red', source: 'logo' } } }), null)
})

test('the WhatsApp button links wa.me with the number digits, inferred or said', () => {
  assert.deepEqual(siteWhatsAppOf(brief), {
    number: '+971 50 000 1234',
    href: 'https://wa.me/971500001234',
    verified: false
  })
  assert.equal(siteWhatsAppOf({ contact: { whatsapp: { number: 'ask us' } } }), null)
  assert.equal(siteWhatsAppOf({}), null)
})

test('the areas served are their own words, each once', () => {
  assert.deepEqual(siteServiceAreasOf(brief), ['Locations across Dubai'])
  assert.deepEqual(siteServiceAreasOf({ business: { serviceAreas: [{ text: ' ' }, null] } }), [])
})

test('the build steps say each of the three, and nothing when the brief has none', () => {
  const steps = brandOnSiteSteps(brief)
  assert.match(steps, /:root\{--ds-c-accent:#aa9247;/)
  assert.match(steps, /Additional CSS/)
  assert.match(steps, /OFF_PALETTE_COLOR/)
  assert.match(steps, /https:\/\/wa\.me\/971500001234/)
  assert.match(steps, /never instead of Call/)
  assert.match(steps, /Locations across Dubai/)
  assert.match(steps, /never in place of the address/)
  assert.doesNotMatch(steps, /[—–]/)
  assert.equal(brandOnSiteSteps({}), '')
})

test('the QA gate is told the accent tokens and the WhatsApp link the build may add, and nothing when the brief has none', async () => {
  const { briefOf } = await import('../src/opportunities-build/demo-qa.js')
  const asked = briefOf({ brief })
  assert.deepEqual(asked.accentTokens, siteAccentOf(brief).tokens)
  assert.deepEqual(asked.whatsappLinks, ['https://wa.me/971500001234'])
  const none = briefOf({ brief: {} })
  assert.deepEqual(none.accentTokens, {})
  assert.deepEqual(none.whatsappLinks, [])
})

// Links take the accent only where it reads on the page (#1780 item 15 follow-up, option A): 4.5:1 against every
// page ground the template has, light and dark; otherwise the template keeps its own link colour.
const brick = { brand: { accent: { hex: '#9C2A1E', source: 'logo', share: 0.3 } } }

test('an accent that reads on the page ground at AA paints the links too', () => {
  const accent = siteAccentOf(brick, { grounds: ['#ffffff'] })
  assert.ok(contrastRatio('#9c2a1e', '#ffffff') >= 4.5)
  assert.equal(accent.tokens['--ds-c-accent-text'], '#9c2a1e')
  assert.ok(contrastRatio(accent.tokens['--ds-c-accent-text-hover'], '#ffffff') >= 4.5)
  assert.deepEqual(Object.keys(accent.tokens), [...ACCENT_TOKENS, ...ACCENT_LINK_TOKENS])
  assert.match(accent.css, /--ds-c-accent-text:#9c2a1e/)
  assert.equal(accent.links, true)
  assert.match(brandOnSiteSteps(brick, { grounds: ['#ffffff'] }), /links take #9c2a1e/)
})

test('a pale accent on a white page leaves the links the template colour', () => {
  const pale = { brand: { accent: { hex: '#F2D16B', source: 'logo', share: 0.2 } } }
  const accent = siteAccentOf(pale, { grounds: ['#ffffff'] })
  assert.ok(contrastRatio('#f2d16b', '#ffffff') < 4.5)
  assert.equal(accent.tokens['--ds-c-accent'], '#f2d16b', 'buttons still take it')
  assert.equal(accent.links, false)
  for (const token of ACCENT_LINK_TOKENS) assert.ok(!(token in accent.tokens), token)
  assert.doesNotMatch(accent.css, /accent-text/)
  assert.match(brandOnSiteSteps(pale, { grounds: ['#ffffff'] }), /links keep the template's own colour/)
})

test('a site with a light and a dark page needs the accent to read on both', () => {
  // The brick reads on white, but not on a near-black page (about 2.4:1).
  const accent = siteAccentOf(brick, { grounds: ['#ffffff', '#121111'] })
  assert.ok(contrastRatio('#9c2a1e', '#121111') < 4.5)
  assert.equal(accent.links, false)
  assert.ok(!('--ds-c-accent-text' in accent.tokens))
})

test('with no known page ground the links keep the template colour', () => {
  const accent = siteAccentOf(brick)
  assert.equal(accent.links, false)
  assert.deepEqual(Object.keys(accent.tokens), ACCENT_TOKENS)
})

test('the QA gate is told the link tokens the build may add, from the same page grounds', async () => {
  const { briefOf } = await import('../src/opportunities-build/demo-qa.js')
  const asked = briefOf({ brief: brick, cms: 'joomla', template: { quickstart: 'quickstart/ja-voyara/j6' } })
  // JA Voyara's slot contract records both grounds (#FAF6F0 light, #15110E dark); the brick reads on neither dark one.
  assert.equal(asked.accentTokens['--ds-c-accent'], '#9c2a1e')
  assert.ok(!('--ds-c-accent-text' in asked.accentTokens))
})

test('on a white template the QA gate allows the link tokens the build was told to write', async () => {
  const { briefOf } = await import('../src/opportunities-build/demo-qa.js')
  const revision = { brief: brick, cms: 'joomla', template: { quickstart: 'quickstart/ja-alpha/j6' } }
  const asked = briefOf(revision)
  assert.equal(asked.accentTokens['--ds-c-accent-text'], '#9c2a1e')
  const { pageGroundsOfRevision } = await import('../src/opportunities-build/brand-on-site-grounds.js')
  assert.deepEqual(
    asked.accentTokens,
    siteAccentOf(brick, { grounds: pageGroundsOfRevision(revision) }).tokens
  )
})
