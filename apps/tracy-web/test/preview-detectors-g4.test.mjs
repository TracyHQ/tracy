/**
 * G4 of PR 2 (14/10/2026): two logos visible. JA Vega WordPress under Moxie, light visitor scheme,
 * showed its header logo and the drawer copy of it side by side (probe data cut from that preview,
 * run as the frame runs it); templates whose header and footer show one logo each pass.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { detect, kind, probe } from '../scripts/preview-detectors/logo-doubled.mjs'
import { DETECTORS } from '../scripts/preview-detectors/index.mjs'
import { BUILT_SITE_RULES, PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/logo-doubled.json', import.meta.url), 'utf8')
)
const run = (/** @type {any} */ s) => detect({ worn: { data: s.worn.data }, plain: { data: s.plain.data } })

test('logo-doubled is its own kind and rule: /ops says two logos show, not that a logo vanished', () => {
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(kind, 'logo-doubled')
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['logo-doubled'].rule, 'IDENT-3')
  assert.match(PREVIEW_KINDS['logo-doubled'].what, /two logos show/)
  assert.notEqual(PREVIEW_KINDS['logo-doubled'].rule, PREVIEW_KINDS['logo-invisible'].rule)
  assert.ok(BUILT_SITE_RULES.includes('IDENT-3'))
  assert.ok(RULES.some((r) => r.id === 'IDENT-3'))
  assert.ok(DETECTORS.some((d) => d.kind === 'logo-doubled' && d.probe === probe))
  const severity = JSON.parse(
    readFileSync(
      new URL('../src/lib/template-design-system-readiness/rule-severity.json', import.meta.url),
      'utf8'
    )
  )
  assert.equal(severity.rules['IDENT-3'].group, 'must-fix')
})

test('logo-doubled: fails on the real JA Vega WordPress light preview, passes on one-logo templates', () => {
  for (const s of fixture.broken) {
    const r = run(s)
    assert.equal(r.count, 1, s.source)
    assert.equal(r.findings.length, 1)
    const [f] = r.findings
    assert.equal(f.region, 'header')
    assert.equal(f.visible, 2)
    assert.match(f.at, /^header: 2 logos visible/)
  }
  for (const s of fixture.clean) assert.equal(run(s).count, 0, s.source)
})

test('logo-doubled: a logo the system unhides counts against the template page, a plain read missing does not judge it', () => {
  const logo = (/** @type {string} */ src, /** @type {string} */ path) => ({
    path,
    at: 'img.logo',
    src,
    sig: src
  })
  const plain = { header: [logo('logo-dark.png', 'header:1/a:1/img:1')], footer: [] }
  const worn = {
    header: [logo('logo-dark.png', 'header:1/a:1/img:1'), logo('logo-light.png', 'header:1/a:1/img:2')],
    footer: []
  }
  const r = detect({ worn: { data: worn }, plain: { data: plain } })
  assert.equal(r.count, 1)
  assert.equal(r.findings[0].was, 1)
  // the template's page builds its header with both: the system did not double it
  assert.equal(detect({ worn: { data: worn }, plain: { data: worn } }).count, 0)
  // a plain page that was not read: two different logos are not judged, one logo twice still is
  assert.equal(detect({ worn: { data: worn }, plain: {} }).count, 0)
  const twice = { header: [logo('a.png', 'x:1'), logo('a.png', 'x:2')], footer: [] }
  assert.equal(detect({ worn: { data: twice }, plain: {} }).count, 1)
})
