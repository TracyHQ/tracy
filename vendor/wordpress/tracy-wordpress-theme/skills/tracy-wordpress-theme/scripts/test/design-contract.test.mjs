// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/design-contract.test.mjs — WordPress changes: none (the fixture already uses the html[data-theme] hook).
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDesign, designHash, designRequest, auditDesign } from '../design-contract.mjs'
import { captureDesign } from '../design-probe.mjs'
import { JSDOM } from 'jsdom'
export function fixtureDesign() {
  const variants = ['desktop', 'mobile'].flatMap((size) =>
    ['light', 'dark'].map((mode) => ({
      id: `${size}-${mode}`,
      mode,
      width: size === 'desktop' ? 1440 : 390,
      height: size === 'desktop' ? 900 : 844
    }))
  )
  const rule = (id, category, selector, props) => ({
    id,
    category,
    selector,
    styles: Object.fromEntries(variants.map((v) => [v.id, props]))
  })
  const rules = [
    rule('heading', 'typography', 'h1', { fontSize: '40px', fontWeight: '700' }),
    rule('colors', 'color', 'body', { color: '#ffffff' }),
    rule('spacing', 'layout', 'main', { paddingLeft: '16px' }),
    rule('button', 'component', 'button', { borderRadius: '12px' })
  ]
  return {
    schemaVersion: 1,
    id: 'example',
    revision: 1,
    source: {
      reference: 'https://example.test/style-guide',
      inspiration: 'example',
      version: '1',
      capturedAt: '2026-01-01T00:00:00Z'
    },
    theme: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' },
    variants,
    tokens: Object.fromEntries(variants.map((v) => [v.id, { '--space': '16px' }])),
    rules,
    coverage: [{ selector: 'h1', properties: ['fontSize', 'fontWeight'] }],
    pages: ['home', 'about'].map((id) => ({
      id,
      url: `https://example.test/${id}`,
      expectedUrl: `https://example.test/${id}`,
      identity: 'main',
      rules: rules.map((r) => r.id),
      requiredRules: ['heading']
    })),
    pilotPages: ['home'],
    exceptions: [],
    pending: []
  }
}
function observations(c) {
  return c.pages.flatMap((p) =>
    c.variants.map((v) => ({
      contractId: c.id,
      contractHash: designHash(c),
      page: p.id,
      variant: v.id,
      capturedAt: '2026-02-01T00:00:00Z',
      url: p.url,
      width: v.width,
      height: v.height,
      mode: v.mode,
      fontsReady: true,
      identityMatches: 1,
      scrollWidth: v.width,
      tokens: c.tokens[v.id],
      rules: c.rules.map((r) => ({
        id: r.id,
        elements: [{ path: r.selector, styles: { ...r.styles[v.id] } }]
      })),
      coverageCount: 1,
      unclassified: []
    }))
  )
}
test('full coverage passes; pilot never claims full coverage', () => {
  const c = fixtureDesign(),
    o = observations(c)
  assert.equal(auditDesign(c, o).ok, true)
  const pilot = auditDesign(
    c,
    o.filter((o) => o.page === 'home'),
    { pilot: true }
  )
  assert.equal(pilot.scope, 'pilot')
  assert.equal(pilot.expectedCases, 4)
})
test('an explicit scope audits a subset and still reports the whole contract', () => {
  const c = fixtureDesign(),
    o = observations(c)
  const partial = auditDesign(
    c,
    o.filter((o) => o.page === 'about'),
    { scope: ['about'] }
  )
  assert.equal(partial.ok, true)
  assert.equal(partial.scope, 'partial')
  assert.equal(partial.expectedCases, 4)
  assert.equal(partial.contractCases, 8)
  assert.deepEqual(partial.scopePages, ['about'])
  // A scoped run still fails on its own missing cases, and never hides a finding inside the scope.
  assert.equal(
    auditDesign(
      c,
      o.filter((o) => o.page === 'about' && o.variant !== 'mobile-dark'),
      { scope: ['about'] }
    ).ok,
    false
  )
  const broken = observations(c)
  broken.find((x) => x.page === 'about').rules[0].elements[0].styles.fontSize = '39px'
  assert.equal(
    auditDesign(
      c,
      broken.filter((x) => x.page === 'about'),
      { scope: ['about'] }
    ).ok,
    false
  )
  // Observations from outside the scope are rejected rather than silently counted.
  assert.throws(() => auditDesign(c, o, { scope: ['about'] }), /Unexpected/)
  assert.throws(() => auditDesign(c, o, { scope: ['nope'] }), /Unknown scope page/)
  assert.throws(
    () => auditDesign(c, o, { pilot: true, scope: ['about'] }),
    /pilot page set or an explicit scope/
  )
})
for (const [name, mutate, pattern] of [
  ['missing mobile dark', (c) => c.variants.pop(), /desktop\/mobile|Missing/],
  ['missing color rules', (c) => (c.rules = c.rules.filter((r) => r.category !== 'color')), /color/],
  ['empty source version', (c) => (c.source.version = ''), /Pin/],
  ['unresolved decision', (c) => c.pending.push('Pick font'), /pending/],
  [
    'unexplained exception',
    (c) =>
      c.exceptions.push({
        page: 'home',
        rule: 'heading',
        variant: 'mobile-light',
        styles: { fontSize: '60px' }
      }),
    /rationale/
  ],
  [
    'blanket exception',
    (c) =>
      c.exceptions.push({
        page: '*',
        rule: 'heading',
        variant: 'mobile-light',
        reason: 'x',
        decision: 'x',
        styles: { fontSize: '60px' }
      }),
    /scope/
  ],
  ['missing required rule', (c) => (c.pages[0].requiredRules = ['unknown']), /not applied/]
])
  test(name, () => {
    const c = fixtureDesign()
    mutate(c)
    assert.throws(() => validateDesign(c), pattern)
  })
for (const [name, mutate, pattern] of [
  ['stale evidence', (o) => (o[0].contractHash = 'old'), /Stale/],
  ['wrong viewport', (o) => (o[0].width = 1000), /viewport/],
  ['wrong theme', (o) => (o[0].mode = 'unknown'), /theme/],
  ['redirect to login', (o) => (o[0].url = 'https://example.test/login'), /URL/],
  ['fonts not ready', (o) => (o[0].fontsReady = false), /ready/],
  ['duplicate case', (o) => o.push(o[0]), /duplicate/],
  ['empty coverage', (o) => (o[0].coverageCount = 0), /coverage/],
  ['missing rule', (o) => o[0].rules.pop(), /Incomplete/]
])
  test(name, () => {
    const c = fixtureDesign(),
      o = observations(c)
    mutate(o)
    assert.throws(() => auditDesign(c, o), pattern)
  })
for (const [name, mutate] of [
  ['font regression', (o) => (o[0].rules[0].elements[0].styles.fontSize = '59.5px')],
  ['empty selector', (o) => (o[0].rules[0].elements = [])],
  ['unclassified heading', (o) => o[0].unclassified.push({ element: 'h2', properties: ['fontSize'] })],
  ['horizontal overflow', (o) => (o[0].scrollWidth = 1600)],
  ['missing page case', (o) => o.pop()],
  ['missing property', (o) => delete o[0].rules[0].elements[0].styles.fontWeight]
])
  test(name, () => {
    const c = fixtureDesign(),
      o = observations(c)
    mutate(o)
    assert.equal(auditDesign(c, o).ok, false)
  })
test('a declared exception changes only its exact page/rule/variant', () => {
  const c = fixtureDesign()
  c.exceptions = [
    {
      page: 'home',
      rule: 'heading',
      variant: 'mobile-light',
      reason: 'Poster scale',
      decision: 'User brief section 2',
      styles: { fontSize: '60px' }
    }
  ]
  const o = observations(c)
  assert.equal(auditDesign(c, o).ok, false)
  o.find((x) => x.page === 'home' && x.variant === 'mobile-light').rules[0].elements[0].styles.fontSize =
    '60px'
  assert.equal(auditDesign(c, o).ok, true)
})
test('collector reads every matching element and identifies uncovered properties', () => {
  const c = fixtureDesign()
  const request = designRequest(c, 'home', 'desktop-light')
  const dom = new JSDOM(
    '<html data-theme="light"><body><main><h1>A</h1><h1>B</h1><button>C</button></main></body></html>',
    { url: request.url, runScripts: 'outside-only' }
  )
  const win = dom.window
  win.HTMLElement.prototype.getClientRects = function () {
    return [{}]
  }
  Object.defineProperty(win.document, 'fonts', { value: { status: 'loaded' } })
  const result = win.eval(`(${captureDesign.toString()})`)(request)
  assert.equal(result.rules[0].elements.length, 2)
  assert.equal(result.coverageCount, 2)
  assert.deepEqual([...result.unclassified], [])
  request.rules[0].properties = ['fontWeight']
  const incomplete = win.eval(`(${captureDesign.toString()})`)(request)
  assert.equal(incomplete.unclassified.length, 2)
  assert.equal(incomplete.unclassified[0].properties[0], 'fontSize')
  dom.window.close()
})

test('static artifact URLs resolve the requested mode before measurement', () => {
  const c = fixtureDesign()
  c.pages[0].url = c.pages[0].expectedUrl = 'https://example.test/email-{mode}.html'
  assert.equal(designRequest(c, 'home', 'mobile-dark').expectedUrl, 'https://example.test/email-dark.html')
})
test('unresolved CSS expressions are not accepted as computed expectations', () => {
  const c = fixtureDesign()
  c.rules[0].styles['desktop-light'].fontSize = 'var(--huge)'
  assert.throws(() => validateDesign(c), /resolved/)
})
test('repeating one measured element cannot inflate coverage', () => {
  const c = fixtureDesign(),
    o = observations(c)
  o[0].rules[0].elements.push(o[0].rules[0].elements[0])
  assert.throws(() => auditDesign(c, o), /Duplicate measured element/)
})
