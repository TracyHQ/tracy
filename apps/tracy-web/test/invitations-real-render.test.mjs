import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultRegistry } from '../src/invitations/real-fields.js'
import { inspectTokens, renderRealTemplate } from '../src/invitations/real-render.js'
const headers = ['cong_ty', 'goi', 'template_tai_gan_nhat', 'website', 'cms']
function input(extra = {}) {
  return {
    template: {
      id: 'synthetic-template',
      version: 1,
      subject: 'Hello {{first_name}}',
      html: '<p>Hi {{first_name}}</p>',
      text: null,
      assets: []
    },
    registry: defaultRegistry(headers),
    rawSource: { headers, values: ['Synthetic company', 'Synthetic plan', '', '', ''] },
    group: 'group_1',
    recipientValues: {},
    destination: 'synthetic@example.test',
    identities: ['member:1'],
    ...extra
  }
}
function custom(missing = 'omit') {
  const r = defaultRegistry(headers)
  r.fields.push({
    key: 'custom.opening_line',
    label: 'Opening line',
    source: { kind: 'manual' },
    missing,
    ...(missing === 'default' ? { defaultValue: 'Default opening' } : {})
  })
  return r
}
test('runtime fields render escaped customer text and configured missing policies without guessing names', () => {
  const i = input({
    registry: custom('required'),
    recipientValues: { 'custom.opening_line': '<script>literal</script>' }
  })
  i.template.html = '<p>{{custom.opening_line}} / {{company}}</p>'
  const r = renderRealTemplate(i)
  assert.match(r.html, /&lt;script&gt;literal&lt;\/script&gt;/)
  assert.ok(!r.html.includes('<script>'))
  assert.match(r.bodyText, /<script>literal<\/script>/)
  assert.equal(r.subject, 'Hello there')
  assert.throws(() => renderRealTemplate({ ...i, recipientValues: {} }), { code: 'REAL_MISSING_FIELD' })
  const d = renderRealTemplate({ ...i, registry: custom('default'), recipientValues: {} })
  assert.match(d.bodyText, /Default opening/)
})
test('unknown tokens are reported for configuration and malformed or reserved tokens are refused', () => {
  const registry = custom()
  assert.deepEqual(
    inspectTokens({ subject: '', html: '<p>{{custom.not_registered}}</p>', text: null, registry }).unknown,
    ['custom.not_registered']
  )
  for (const html of [
    '<p>{{custom.not_registered}}</p>',
    '<p>{{ company }}</p>',
    '<p>{{company}</p>',
    '<p>{{unsubscribe_url}}</p>',
    '<p>{{custom.constructor}}</p>'
  ])
    assert.throws(() => renderRealTemplate(input({ template: { ...input().template, html } })))
})
test('hidden conditional paragraphs remain dependencies and auto text omits the exact corresponding paragraph', () => {
  const i = input({ registry: custom() })
  i.template.html =
    '<p>Always</p><p data-if-present="custom.opening_line">Opening {{custom.opening_line}}</p>'
  const a = renderRealTemplate(i)
  assert.ok(!a.html.includes('Opening'))
  assert.ok(!a.html.includes('data-if-present'))
  assert.ok(!a.bodyText.includes('Opening'))
  assert.ok(a.dependencyFields.includes('custom.opening_line'))
  const b = renderRealTemplate({ ...i, recipientValues: { 'custom.opening_line': 'Available' } })
  assert.match(b.bodyText, /Opening Available/)
  assert.notEqual(a.dependencyFingerprint, b.dependencyFingerprint)
  const c = renderRealTemplate({ ...i, registry: { ...i.registry, revision: 2 } })
  assert.notEqual(a.dependencyFingerprint, c.dependencyFingerprint)
})
test('omit fields only occur inside their matching condition; supplied text and subjects cannot silently omit', () => {
  const i = input({ registry: custom() })
  for (const template of [
    { ...i.template, html: '<p>{{custom.opening_line}}</p>' },
    { ...i.template, subject: '{{custom.opening_line}}' },
    { ...i.template, text: '{{custom.opening_line}}' },
    { ...i.template, html: '<p data-if-present="last_template">{{custom.opening_line}}</p>' }
  ])
    assert.throws(() => renderRealTemplate({ ...i, template }))
})
test('customer tokens cannot enter CSS, attributes, resources or tag structure; system URL is a non-active anchor slot', () => {
  const i = input()
  for (const html of [
    '<p style="color:{{company}}">X</p>',
    '<style>p{color:{{company}}}</style>',
    '<img src="{{company}}">',
    '<a href="{{company}}">Link</a>',
    '<p title="{{company}}">X</p>',
    '<p {{company}}="x">X</p>',
    '<p{{company}}>X</p{{company}}>',
    '<!-- {{company}} -->',
    '<p>{{invitation_url}}</p>'
  ])
    assert.throws(() => renderRealTemplate({ ...i, template: { ...i.template, html } }))
  const r = renderRealTemplate({
    ...i,
    template: { ...i.template, html: '<a href="{{invitation_url}}">Accept invitation</a>' }
  })
  assert.ok(!r.html.includes('href='))
  assert.match(r.bodyText, /Accept invitation/)
  assert.match(r.bodyText, /Unsubscribe will be available/)
})
test('HTML-derived text preserves image alt and safe link labels; field values are not recursively compiled', () => {
  const i = input({ recipientValues: { first_name: '{{literal}}' } })
  i.template.html =
    '<table><tr><td><img src="images/logo.png" alt="Synthetic logo"><a href="https://example.test/info">Details</a></td></tr></table>'
  const r = renderRealTemplate(i)
  assert.match(r.bodyText, /Synthetic logo/)
  assert.match(r.bodyText, /Details \(https:\/\/example.test\/info\)/)
  assert.equal(r.subject, 'Hello {{literal}}')
})
test('rendered subject, HTML and text budgets are enforced after substitution; content hashes bind image bytes', () => {
  const i = input()
  assert.throws(() => renderRealTemplate({ ...i, recipientValues: { first_name: 'Injected\nSubject' } }))
  assert.throws(() => renderRealTemplate({ ...i, recipientValues: { first_name: 'x'.repeat(999) } }))
  const big = { ...i.template, html: '<p>' + '{{company}}'.repeat(200) + '</p>' }
  assert.throws(() =>
    renderRealTemplate({
      ...i,
      template: big,
      rawSource: { headers, values: ['x'.repeat(16384), '', '', '', ''] }
    })
  )
  const a = renderRealTemplate(i)
  const b = renderRealTemplate({
    ...i,
    template: { ...i.template, assets: [{ id: 'synthetic-image', sha256: 'a'.repeat(64) }] }
  })
  assert.notEqual(a.contentHash, b.contentHash)
  assert.throws(() => renderRealTemplate({ ...i, template: { ...i.template, text: 'x'.repeat(100 * 1024) } }))
})
