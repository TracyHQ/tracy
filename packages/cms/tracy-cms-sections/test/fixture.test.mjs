// Tests for the fixture fence: a design system's components.html becomes a scoped stylesheet and
// a body snippet the themes can carry without the template's chrome bleeding in or out.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { fixtureParts, fixtureSnippet, scopeFixtureCss, topLevelBlocks } from '../lib/fixture.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const VENDOR = path.join(ROOT, 'vendor', 'tracy', 'od-design-system', 'systems')

const DOC = `<!doctype html><html><head><style>
/* tokens */
:root { --bg: #fff; --accent: #f00; }
@import url("x.css");
@font-face { font-family: "Geist"; src: url("g.woff2"); }
html, body { margin: 0; background: var(--bg); }
body { font-family: Arial; }
.page { min-height: 100vh; background: linear-gradient(#fff, #f00); }
h1 { font-size: 64px; }
@media (max-width: 640px) { .page { padding: 8px; } body { font-size: 14px; } }
@keyframes spin { to { transform: rotate(1turn); } }
</style></head><body>
<div class="page"><h1>Hi</h1><p>Text</p></div>
<script>alert(1)</script>
</body></html>`

test('topLevelBlocks balances braces and keeps statement at-rules', () => {
  const blocks = topLevelBlocks(':root{--a:1}@import url(x);.a{.b{}}@media (x){.c{}}')
  assert.deepEqual(
    blocks.map((b) => b.head),
    [':root', '@import url(x)', '.a', '@media (x)']
  )
  assert.equal(blocks[1].body, null)
  assert.equal(blocks[2].body, '.b{}')
})

test('the fence prefixes every rule, retargets document rules to the wrapper and hoists at-rules', () => {
  const css = scopeFixtureCss(fixtureParts(DOC).css)
  assert.match(
    css,
    /^@import url\("x\.css"\);\n@font-face \{[^}]*\}\n@keyframes spin \{ to \{ transform: rotate\(1turn\); \} \}\n/
  )
  assert.match(css, /\}\n\.tracy-fixture \{\n/)
  assert.doesNotMatch(css, /revert/)
  assert.match(css, /\n& \{ --bg: #fff; --accent: #f00; \}/)
  assert.match(css, /\n& \{ margin: 0; background: var\(--bg\); \}/)
  assert.match(css, /\n& \{ font-family: Arial; \}/)
  assert.match(css, /\n\.page \{ min-height: 100vh;/)
  assert.match(css, /\nh1 \{ font-size: 64px; \}/)
  assert.match(
    css,
    /@media \(max-width: 640px\) \{\n {2}\.page \{ padding: 8px; \}\n {2}& \{ font-size: 14px; \}\n\}/
  )
  assert.doesNotMatch(css, /tokens/)
  assert.match(css, /\n\}\n$/)
})

test('fixtureParts splits css from body and drops scripts', () => {
  const parts = fixtureParts(DOC)
  assert.equal(parts.scripts, 1)
  assert.equal(parts.body, '<div class="page"><h1>Hi</h1><p>Text</p></div>')
  assert.doesNotMatch(parts.body, /script/)
})

test('fixtureSnippet wraps the body and names the design system', () => {
  assert.equal(
    fixtureSnippet(DOC, 'demo'),
    '<div class="tracy-fixture" data-inspiration="demo">\n<div class="page"><h1>Hi</h1><p>Text</p></div>\n</div>\n'
  )
})

test('every vendored fixture fences without an unbalanced block, and none keeps a document selector', () => {
  const catalog = JSON.parse(
    readFileSync(path.join(ROOT, 'vendor', 'tracy', 'od-design-system', 'catalog.json'), 'utf8')
  )
  for (const { id } of catalog.systems) {
    const html = readFileSync(path.join(VENDOR, id, 'components.html'), 'utf8')
    const parts = fixtureParts(html)
    const css = scopeFixtureCss(parts.css)
    assert.ok(css.includes('.tracy-fixture {\n'), `${id}: no wrapper`)
    assert.doesNotMatch(css, /\n(html|body|:root)\b[^{]*\{/, `${id}: a document selector survived`)
    const opens = (css.match(/\{/g) ?? []).length
    const closes = (css.match(/\}/g) ?? []).length
    assert.equal(opens, closes, `${id}: braces`)
    assert.ok(parts.body.length > 200, `${id}: body`)
  }
})
