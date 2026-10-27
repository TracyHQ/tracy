import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultRegistry } from '../src/invitations/real-fields.js'
import { sanitizeEmailHtml } from '../src/invitations/real-html.js'
import { renderRealTemplate } from '../src/invitations/real-render.js'
const registry = defaultRegistry(['cong_ty'])
const clean = (html) => sanitizeEmailHtml({ html, imagePaths: ['images/logo.png'], registry })
test('email HTML preserves tables, inline styles, media layout, managed images and safe anchor links', () => {
  const r = clean(
    '<html><head><style>@media screen and (max-width:600px){.card{width:100%;padding:8px}}</style></head><body><table class="card"><tr><td style="color:#123456;font-size:16px"><img src="images/logo.png" alt="Logo"><a href="https://example.test/path">Details</a><p>{{company}}</p></td></tr></table></body></html>'
  )
  assert.deepEqual(r.assetReferences, ['images/logo.png'])
  assert.ok(r.html.includes('max-width:600px'))
  assert.ok(r.html.includes('font-size:16px'))
  assert.ok(r.html.includes('https://example.test/path'))
  assert.ok(r.dependencies.includes('company'))
  assert.equal(clean(r.html).html, r.html)
})
test('scripts, events, forms, redirects and foreign namespace subtrees are removed with warnings', () => {
  const r = clean(
    '<p onclick="alert(1)">Hello</p><script>alert(1)</script><form><input name="x"></form><iframe src="https://example.test"></iframe><meta http-equiv="refresh" content="0;url=https://example.test"><base href="https://example.test"><svg><foreignObject><p onload="x">Bad</p></foreignObject></svg><math><mtext>Bad</mtext></math><unknown>Bad</unknown>'
  )
  assert.ok(!/onclick|<script|<form|<input|<iframe|<meta|<base|<svg|<math|<unknown|Bad/i.test(r.html))
  assert.ok(r.warnings.length)
  assert.equal(clean(r.html).html, r.html)
})
test('resource-bearing and opaque CSS, imports, font-face and expression cannot survive parsing', () => {
  const r = clean(
    '<style>@import url(https://example.test/x);@\\69mport "https://example.test/y";@font-face{font-family:X;src:url(x)}p{background:url(https://example.test/pixel);color:red;width:expression(alert(1));padding:4px;--load:url(x)}</style><p style="background-image:u\\72l(https://example.test/a);color:blue;behavior:url(x)">Hello</p>'
  )
  assert.ok(!/https:|@import|font-face|expression|url\(|--load|behavior/i.test(r.html))
  assert.ok(r.html.includes('color:red'))
  assert.ok(r.html.includes('padding:4px'))
  assert.ok(r.warnings.length)
  assert.equal(clean(r.html).html, r.html)
})
test('missing/external/data/protocol-relative images block a complete template, and customer attribute tokens cannot become resources', () => {
  for (const src of [
    'missing.png',
    'https://example.test/pixel',
    '//example.test/pixel',
    'data:image/png;base64,abc',
    '../images/logo.png',
    'images/%2e%2e/logo.png',
    '{{company}}'
  ])
    assert.throws(() => clean(`<img src="${src}">`))
  for (const html of ['<a href="javascript:alert(1)">Link</a>', '<a href="data:text/html,x">Link</a>']) {
    const r = clean(html)
    assert.ok(!r.html.includes('href='))
    assert.ok(r.warnings.length)
  }
  for (const html of [
    '<p title="{{company}}">X</p>',
    '<p style="color:{{company}}">X</p>',
    '<style>p{color:{{company}}}</style>'
  ])
    assert.throws(() => clean(html))
  assert.ok(clean('<a href="{{invitation_url}}">Accept</a>').html.includes('{{invitation_url}}'))
})
test('unknown tokens are retained and reported for registry configuration, not silently erased', () => {
  const r = clean('<p>{{custom.new_field}}</p>')
  assert.ok(r.html.includes('{{custom.new_field}}'))
  assert.ok(r.dependencies.includes('custom.new_field'))
})
test('token-bearing document title is refused instead of escaping dependency validation', () => {
  assert.throws(() => clean('<html><head><title>{{company}}</title></head><body>Hi</body></html>'))
})
test('sanitized responsive CSS remains renderable without treating closing media braces as tokens', () => {
  const r = clean(
    '<style>@media screen and (max-width:600px){.card{width:100%}}</style><p>Hello {{first_name}}</p>'
  )
  const rendered = renderRealTemplate({
    template: { version: 1, subject: 'Hi', html: r.html, text: null, assets: [] },
    registry,
    rawSource: { headers: ['cong_ty'], values: ['Synthetic'] },
    group: 'group_1',
    destination: 'fixture@example.test',
    identities: ['synthetic']
  })
  assert.ok(rendered.html.includes('max-width:600px'))
  assert.ok(rendered.html.includes('Hello there'))
})
