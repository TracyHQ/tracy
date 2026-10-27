// Rule PIC-1 (template design system readiness): an icon a template shows as a closed picture in its brand
// colour (a data: SVG background) stays that colour under every system. A slot contract can turn it into a
// mask the worn system paints: `mask: url("data:image/svg+xml,…")` with a role colour under it. safeValue
// refuses every url(, so contract masks pass through safeDeclaration: only an inline, percent-encoded SVG,
// only on a mask property. JA Nova WP (pricing ticks) and JA Vega WP (contact icons), 20/10/2026.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { safeDeclaration } from '../src/emit.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const SVG = 'url("data:image/svg+xml,%3Csvg%20viewBox%3D%270%200%2020%2020%27%3E%3C%2Fsvg%3E")'

test('a contract mask may carry an inline percent-encoded SVG, nothing else may carry a url', () => {
  assert.equal(safeDeclaration('mask', `${SVG} center / 20px 20px no-repeat`), true)
  assert.equal(safeDeclaration('-webkit-mask-image', SVG), true)
  assert.equal(safeDeclaration('color', 'var(--ds-c-accent-text)'), true)
  // a url on any other property, a remote picture, a raw '<' or a quote that ends the url early: refused
  assert.equal(safeDeclaration('background-image', SVG), false)
  assert.equal(safeDeclaration('mask', 'url("https://example.com/x.svg")'), false)
  assert.equal(safeDeclaration('mask', 'url("data:image/svg+xml,<svg></svg>")'), false)
  assert.equal(safeDeclaration('mask', 'url("data:image/svg+xml,%3Csvg")") ;color:red'), false)
  assert.equal(safeDeclaration('mask', `${SVG};color:red`), false)
  assert.equal(safeDeclaration('mask', 'url("data:image/svg+xml,%3Csvg%20fill%3D%27#fff%27")'), false)
})

for (const [contract, selector] of [
  ['wordpress-ja-nova', '.jn-pricing__list li'],
  ['wordpress-ja-vega', '.jv-contact__item--phone']
])
  test(`${contract}: the worn sheet paints its brand icon through a mask in a role colour`, () => {
    const c = loadContract(contract)
    const r = wordpressVariation(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), c)
    assert.ok(!('refused' in r))
    const css = r.variation.styles.css
    const at = css.indexOf(selector)
    assert.ok(at >= 0, `${selector} is in the sheet`)
    assert.match(css, /mask:url\("data:image\/svg\+xml,[^"]+"\) center \/ \d+px \d+px no-repeat/)
    assert.match(css, /var\(--ds-c-accent-text\)/)
    // the template's own picture colour is not written into the sheet
    assert.doesNotMatch(css, /%235e48db|%233c72fc/i)
  })
