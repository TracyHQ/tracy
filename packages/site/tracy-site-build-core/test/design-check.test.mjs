/**
 * The adherence check (ADR 0023, decision 4): a page's computed colours and fonts, measured against
 * the palette of the design system the site wears — by VALUE, so it holds on T4 (tokens compiled
 * away) and EmDash (Tailwind) alike. Warnings only, never a refusal (ADR 0022).
 *
 *   node --test packages/site/tracy-site-build-core/test/design-check.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import { checkNext, judge, paletteOf, STYLE_PROBE } from '../src/host/design-check.mjs'
import { tokensOf } from '../src/host/design-record.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name) => path.join(here, 'fixtures', 'design-check', name)
const tokens = tokensOf(readFileSync(fixture('apple.tokens.css'), 'utf8'))
const clean = JSON.parse(readFileSync(fixture('probe-clean.json'), 'utf8'))
const leaky = JSON.parse(readFileSync(fixture('probe-leaky.json'), 'utf8'))

test('paletteOf: every colour token as rgb, every font token as its first family; non-colours ignored', () => {
  const p = paletteOf(tokens)
  assert.equal(p.colors.length, 10)
  assert.deepEqual(
    p.colors.find((c) => c.token === '--accent'),
    { token: '--accent', rgb: { r: 0, g: 113, b: 227 } }
  )
  assert.deepEqual(
    p.fonts.map((f) => [f.token, f.family]),
    [
      ['--font-display', 'SF Pro Display'],
      ['--font-body', 'SF Pro Text'],
      ['--font-mono', 'ui-monospace']
    ]
  )
  assert.ok(!p.colors.some((c) => c.token === '--space-4'))
})

test('a clean page: every colour on the palette (transparent and translucent skipped), every font in the system, score 100', () => {
  const r = judge(clean, paletteOf(tokens))
  assert.equal(r.colors.off, 0)
  assert.equal(r.colors.near, 0)
  // 20+12+2+2+3 occurrences on palette; rgba(0,0,0,0) and the 0.5 scrim are not judged
  assert.equal(r.colors.on, 39)
  assert.deepEqual(r.colors.offenders, [])
  assert.equal(r.fonts.off, 0)
  assert.equal(r.fonts.on, 35)
  assert.equal(r.score, 100)
  assert.equal(r.elements.seen, 40)
  assert.equal(checkNext(r), null)
})

test('a leaky page: #ddd is ON (11 from --border, inside the 16 band), a shifted blue is NEAR, a green is OFF with its nearest token, Arial is a foreign font, sans-serif is allowed', () => {
  const r = judge(leaky, paletteOf(tokens))
  assert.equal(r.colors.on, 38, '20 + 12 + the 6 #ddd cells, which sit inside the on band')
  assert.equal(r.colors.near, 2, 'the shifted blue ×2 (27 from --accent)')
  assert.equal(r.colors.off, 1)
  assert.ok(!r.colors.offenders.some((o) => o.value === 'rgb(221, 221, 221)'), '#ddd is not an offender')
  const blue = r.colors.offenders.find((o) => o.value === 'rgb(0, 140, 240)')
  assert.deepEqual(blue, {
    prop: 'background-color',
    value: 'rgb(0, 140, 240)',
    band: 'near',
    nearest: { token: '--accent', distance: 27 },
    count: 2,
    where: ['.btn-alt']
  })
  const green = r.colors.offenders.find((o) => o.value === 'rgb(120, 200, 40)')
  assert.equal(green.band, 'off')
  assert.equal(green.nearest.token, '--muted', 'max channel difference: 90 to --muted, 91 to --success')
  assert.equal(r.colors.offenders[0], green, 'off before near')
  assert.equal(r.fonts.off, 14)
  assert.equal(r.fonts.on, 32, 'the generic sans-serif is allowed: a font token ends in it')
  assert.deepEqual(r.fonts.offenders, [{ family: 'Arial', count: 14, where: ['#wpadminbar', '.legacy'] }])
  // score counts occurrences: colours on 38 of 41, fonts on 32 of 46
  assert.equal(r.score, Math.floor((100 * (38 + 32)) / (38 + 2 + 1 + 32 + 14)))
  const next = checkNext(r)
  assert.match(next, /rgb\(120, 200, 40\)/)
  assert.match(next, /--muted/)
  assert.match(next, /rgb\(0, 140, 240\)/)
  assert.match(next, /Arial/)
  assert.match(next, /#wpadminbar/)
})

test('an allow list silences a named property/value pair', () => {
  const r = judge(leaky, paletteOf(tokens), { allow: [{ prop: 'color', value: 'rgb(120, 200, 40)' }] })
  assert.equal(r.colors.off, 0)
  assert.ok(!r.colors.offenders.some((o) => o.value === 'rgb(120, 200, 40)'))
})

test('the probe script is a self-contained expression that returns the sample shape', () => {
  assert.equal(typeof STYLE_PROBE, 'string')
  assert.match(STYLE_PROBE, /getComputedStyle/)
  assert.match(STYLE_PROBE, /font-family/)
  assert.match(STYLE_PROBE, /wpadminbar/)
  // Runs against a minimal DOM stand-in: the expression is an IIFE that reads `document`.
  const fn = new Function('document', 'getComputedStyle', 'window', `return (${STYLE_PROBE})`)
  const styles = new Map([
    [
      'body',
      {
        color: 'rgb(1, 2, 3)',
        backgroundColor: 'rgb(255, 255, 255)',
        fontFamily: 'X, sans-serif',
        borderTopWidth: '0px'
      }
    ],
    [
      'p',
      {
        color: 'rgb(1, 2, 3)',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        fontFamily: 'X, sans-serif',
        borderTopWidth: '1px',
        borderTopColor: 'rgb(9, 9, 9)'
      }
    ]
  ])
  const el = (tag, cls = '') => ({
    tagName: tag.toUpperCase(),
    id: '',
    className: cls,
    getClientRects: () => [{}],
    matches: () => false,
    parentElement: null
  })
  const els = [el('body'), el('p', 'x')]
  const doc = { body: { querySelectorAll: () => els }, location: { href: 'http://x/' } }
  const out = fn(doc, (e) => styles.get(e.tagName.toLowerCase()), {
    getComputedStyle: (e) => styles.get(e.tagName.toLowerCase())
  })
  assert.equal(out.href, 'http://x/')
  assert.equal(out.seen, 2)
  assert.ok(out.samples.some((s) => s.prop === 'color' && s.value === 'rgb(1, 2, 3)' && s.count === 2))
  assert.ok(out.samples.some((s) => s.prop === 'border-top-color' && s.value === 'rgb(9, 9, 9)'))
  assert.ok(!out.samples.some((s) => s.prop === 'border-top-color' && s.value === undefined))
})

test('a page with anything off never scores 100: 2 colours off on 1,688 judged is 99, not a rounded 100', () => {
  const palette = paletteOf({ '--bg': '#ffffff', '--fg': '#000000', '--font-body': 'Inter, sans-serif' })
  const probe = {
    href: 'http://x/',
    seen: 1700,
    samples: [
      { prop: 'color', value: 'rgb(0, 0, 0)', count: 1686 },
      { prop: 'color', value: 'rgb(0, 200, 0)', count: 2 }
    ]
  }
  assert.equal(judge(probe, palette).score, 99)
})

test("the probe skips WordPress core Social Links: those are the networks' brand colours, not the site's", () => {
  // The probe itself, run on a page whose one social link wears a network's colour. linkedom lays
  // nothing out, so each element is given a box and its inline colours as its computed style.
  const { parseHTML } = createRequire(path.join(here, '..', '..', '..', '..', 'package.json'))('linkedom')
  const { document, window } = parseHTML(
    `<html><body><p style="color:rgb(20, 23, 26)">Text</p>` +
      `<ul class="wp-block-social-links"><li class="wp-block-social-link"><a style="color:rgb(24, 119, 242)">f</a></li></ul>` +
      `</body></html>`
  )
  window.Element.prototype.getClientRects = () => [{ width: 1, height: 1 }]
  const computed = (el) => ({ color: el.style?.color ?? '', backgroundColor: '', fontFamily: '' })
  const probe = new Function('document', 'getComputedStyle', `return ${STYLE_PROBE}`)(document, computed)
  const colours = probe.samples.filter((s) => s.prop === 'color').map((s) => s.value)
  assert.ok(colours.includes('rgb(20, 23, 26)'), 'the site’s own text is sampled')
  assert.ok(!colours.includes('rgb(24, 119, 242)'), 'the network’s colour is not')
})

test("a family Astro's font API renamed with its hash is the family the token names (measured 29/09 on EmDash)", async () => {
  const { judge, paletteOf } = await import('../src/host/design-check.mjs')
  const palette = paletteOf({ '--font-sans': '"Archivo", system-ui, sans-serif', '--color-ink': '#14171a' })
  const probe = {
    samples: [
      {
        prop: 'font-family',
        value: 'Archivo-d7009d10e90b12ba, "Archivo-d7009d10e90b12ba fallback: system-ui"',
        count: 221,
        where: ['div.min-h-screen']
      },
      { prop: 'font-family', value: 'Comic Sans MS', count: 1, where: ['p.x'] }
    ]
  }
  const report = judge(probe, palette, {})
  assert.equal(report.fonts.on, 221)
  assert.deepEqual(
    report.fonts.offenders.map((o) => o.family),
    ['Comic Sans MS']
  )
})
