// A control that is visually hidden — WordPress's `.screen-reader-text` skip link, clipped to a 1px box — shows no
// label to anyone, so its text "wrapping" inside that box is not a wrapped control. The same link, once focus
// reveals it, is measured like any other control.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { lazyBrowser } from '../lib/browser.mjs'
import { classify, inPageIntrinsic } from '../visual/intrinsic-mobile.mjs'

const browser = lazyBrowser()
after(() => browser.close())

const SR = 'border:0;clip:rect(1px,1px,1px,1px);clip-path:inset(50%);height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;width:1px;word-wrap:normal'
const page = (body, css = '') => `<!doctype html><html><head><style>body{margin:0;font:16px/1.5 sans-serif}.screen-reader-text{${SR}}${css}</style></head><body>${body}</body></html>`

const measure = async (html, prepare) => {
  const b = await browser.get()
  const p = await b.newPage({ viewport: { width: 390, height: 800 } })
  try {
    await p.setContent(html)
    if (prepare) await prepare(p)
    return await p.evaluate(inPageIntrinsic, 3)
  } finally {
    await p.close()
  }
}

test('a visually hidden skip link is not a wrapped control', async () => {
  const out = await measure(page('<a class="skip-link screen-reader-text" id="wp-skip-link" href="#main">Skip to content</a><main id="main"><p>Text</p></main>'))
  assert.deepEqual(out.filter((d) => d.kind === 'control-wrap'), [])
})

test('a link clipped away by clip-path alone, at full size, is not a wrapped control', async () => {
  const out = await measure(page('<a href="#x" style="display:block;width:60px;position:absolute;clip-path:inset(50%)">Skip to content</a>'))
  assert.deepEqual(out.filter((d) => d.kind === 'control-wrap'), [])
})

test('a visible link that wraps is still found, and the revealed skip link is measured', async () => {
  const out = await measure(page('<a href="#x" style="display:block;width:60px">Contact us now</a>'))
  assert.equal(out.filter((d) => d.kind === 'control-wrap').length, 1)
  const shown = await measure(
    page('<a class="screen-reader-text" id="s" href="#m">Skip to content</a>', '.screen-reader-text:focus{clip:auto;clip-path:none;height:auto;width:60px;margin:0;position:static;display:block}'),
    (p) => p.focus('#s')
  )
  assert.equal(shown.filter((d) => d.kind === 'control-wrap').length, 1)
})

test('a sidebar control pairs when the source uses a div and the port uses an aside', async () => {
  const source = await measure(page('<div class="sidebar"><a href="#x" style="display:block;width:60px">Contact us now</a></div>'))
  const site = await measure(page('<aside class="sidebar"><a href="#x" style="display:block;width:60px">Contact us now</a></aside>'))
  const rows = classify(site, source).filter((d) => d.kind === 'control-wrap')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].class, 'shared-source-defect')
  assert.equal(rows[0].key, source.find((d) => d.kind === 'control-wrap').key)
})
