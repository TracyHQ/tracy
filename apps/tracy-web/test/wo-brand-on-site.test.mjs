import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
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
