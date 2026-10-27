// The type the page content writes inline in the template's faces by name (inline-faces.mjs): Tracy
// Business WordPress's /services "What we offer" heading and its six card titles kept Newsreader under
// every system, the heading at 36px beside the theme's 43px section headings (Moxie, 15/10/2026).
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { inlineFaceRules } from '../src/inline-faces.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const HI = ':root:root:root:root:root:root'

/** The worn sheet of Tracy Business WordPress under one system, its root prefix shortened to HI. */
function sheet(id) {
  const c = loadContract('wordpress-tracy-business')
  const r = wordpressVariation(loadProfile(ROOT, id), contractBase(ROOT, c), c)
  assert.ok(!('refused' in r))
  return r.css.replaceAll(HI, 'HI')
}

/** The bodies of the rules whose selector contains `needle`, outside @media. */
const bodies = (css, needle) =>
  [...css.matchAll(/(?<=^|\})([^{}@]*)\{([^{}]*)\}/g)].filter((m) => m[1].includes(needle)).map((m) => m[2])

test('Tracy Business WordPress: the content written in Newsreader takes the heading role, in Archivo the body face', () => {
  const css = sheet(MOXIE)
  const heading = bodies(css, '[data-dc-tpl][style*="font-family: Newsreader" i]')
  assert.ok(heading.length >= 1, 'a rule for the inline Newsreader content')
  for (const b of heading) {
    assert.match(b, /font-family:"IBM Plex Serif", serif!important/)
    assert.match(b, /font-weight:300!important/)
  }
  const body = bodies(css, '[data-dc-tpl][style*="font-family: Archivo" i]')
  assert.ok(body.length >= 1, 'a rule for the inline Archivo content')
  for (const b of body) assert.match(b, /font-family:"IBM Plex Sans", sans-serif!important/)
})

test('Tracy Business WordPress: an inline section heading takes the section heading size, as the theme’s own do', () => {
  const css = sheet(MOXIE)
  const own = bodies(css, 'main h2.wp-block-heading:where(').find((b) => b.includes('font-size'))
  const size = /font-size:([^;!]+)/.exec(own)?.[1]
  assert.ok(size, 'the theme’s section headings take a size')
  const inline = bodies(css, 'main h2[data-dc-tpl]:is(')
  assert.ok(inline.length >= 1)
  for (const b of inline) assert.ok(b.includes(`font-size:${size}!important`), b)
})

test('a silent system writes no inline face rule, and an unsafe contract entry is dropped', () => {
  const rule = (sel, decls) => {
    const d = Object.entries(decls).filter(([, v]) => v !== null && v !== undefined)
    return d.length ? `${sel}{${d.map(([k, v]) => `${k}:${v}`).join(';')}}` : ''
  }
  const scoped = (l) => [l].flat().join(',')
  const spec = {
    scope: '[data-dc-tpl]',
    faces: { Newsreader: 'heading', Archivo: 'body' },
    headingSize: ['main h2[data-dc-tpl]']
  }
  assert.deepEqual(inlineFaceRules(spec, { fonts: {} }, {}, {}, scoped, rule), [])
  const sv = { '--ds-font-display': '"X", serif' }
  assert.deepEqual(inlineFaceRules({ ...spec, scope: '[a]{}' }, { fonts: {} }, {}, sv, scoped, rule), [])
  assert.deepEqual(
    inlineFaceRules(
      { scope: '[data-dc-tpl]', faces: { 'A;b': 'heading', Z: 'nope' } },
      { fonts: {} },
      {},
      sv,
      scoped,
      rule
    ),
    []
  )
  assert.deepEqual(inlineFaceRules(undefined, { fonts: {} }, {}, sv, scoped, rule), [])
})
