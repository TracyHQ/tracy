/**
 * embed-error (PREV-1, E4 of PR 2, 14/10/2026): embedded third-party content that shows its provider's
 * error in the preview. Akemi's own screenshot on dev: JA Directory Joomla under Moxie, the "Featured
 * Video" module a black block reading "An error occurred… enable JavaScript", because the preview frame
 * runs no script and its sandbox reaches the YouTube frame. Judged on probe data cut from real Add site
 * previews (`fixtures/preview-detectors/embed-error.json`, preview-check.mjs PREVIEW_DATA=1). No
 * exemption list.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DS_RULE_SEVERITY } from '../src/lib/template-design-system-readiness/severity.js'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import {
  BUILT_SITE_RULES,
  judgePreview,
  PREVIEW_KINDS
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { DETECTORS } from '../scripts/preview-detectors/index.mjs'
import { detect, providerOf } from '../scripts/preview-detectors/embed-error.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/embed-error.json', import.meta.url), 'utf8')
)
const run = (/** @type {any} */ s) =>
  detect({
    worn: { base: null, data: s.worn.data, html: '' },
    plain: { base: null, data: s.plain.data, html: '' }
  })

test('embed-error: fails on every broken sample of a real preview, passes on the clean ones', () => {
  assert.ok(fixture.broken.length && fixture.clean.length, 'both kinds of sample')
  for (const s of fixture.broken) {
    const r = run(s)
    assert.ok(r.count > 0, `broken: ${s.source}`)
    assert.equal(r.count, r.findings.length)
    for (const x of r.findings) assert.ok(String(x.at ?? '').trim(), 'each finding says where')
  }
  for (const s of fixture.clean) assert.equal(run(s).count, 0, `clean: ${s.source}`)
})

test("embed-error: JA Directory's Featured Video is a YouTube frame, named with its section", () => {
  const s = fixture.broken.find((/** @type {any} */ x) => /ja-directory/.test(x.source))
  const [f] = run(s).findings
  assert.equal(f.provider, 'YouTube')
  assert.equal(f.heading, 'Featured Video')
  assert.match(f.at, /^iframe YouTube in .+ "Featured Video"$/)
  assert.match(f.why, /without script/)
  // the template's own preview showed the same frame: the template's embed, not the system's doing
  assert.equal(f.by, 'template')
})

test('embed-error: a frame that only has a data-src stays blank; it says so', () => {
  const r = detect({
    worn: {
      base: null,
      html: '',
      data: [
        {
          path: 'div:1/iframe:1',
          tag: 'iframe',
          host: 'player.vimeo.com',
          route: '/video/1',
          state: 'never-loads',
          w: 640,
          h: 360,
          top: 900,
          section: 'section.video',
          heading: ''
        }
      ]
    },
    plain: { base: null, html: '', data: [] }
  })
  assert.equal(r.count, 1)
  assert.equal(r.findings[0].provider, 'Vimeo')
  assert.equal(r.findings[0].by, 'system')
  assert.match(r.findings[0].why, /data-src/)
})

test('embed-error: providers by host and path', () => {
  assert.equal(providerOf('www.youtube.com', '/embed/x'), 'YouTube')
  assert.equal(providerOf('youtube-nocookie.com', '/embed/x'), 'YouTube')
  assert.equal(providerOf('www.google.com', '/maps/embed?pb=1'), 'Google Maps')
  assert.equal(providerOf('maps.google.com', '/'), 'Google Maps')
  assert.equal(providerOf('calendar.google.com', '/calendar/embed'), 'Google Calendar')
  assert.equal(providerOf('open.spotify.com', '/embed/track/1'), 'Spotify')
  assert.equal(providerOf('widgets.example.net', '/w'), 'widgets.example.net')
})

test('embed-error: its registry line is PREV-1, must fix, with a fix that says what to do', () => {
  const k = PREVIEW_KINDS['embed-error']
  assert.equal(k.rule, 'PREV-1')
  assert.ok(BUILT_SITE_RULES.includes('PREV-1'))
  assert.ok(RULES.some((r) => r.id === 'PREV-1'))
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(DS_RULE_SEVERITY['PREV-1'].group, 'must-fix')
  assert.match(k.fix, /poster|thumbnail/)
  assert.ok(DETECTORS.some((d) => d.kind === 'embed-error' && d.probe))
})

test('embed-error: a row with an embed error fails PREV-1 and names provider and section', () => {
  const row = {
    system: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
    scheme: 'light',
    probeVersion: PREVIEW_PROBE_VERSION,
    kept: 0,
    glare: 0,
    keptText: 0,
    lowText: 0,
    lostButtons: 0,
    failedFonts: 0,
    empty: 0,
    docs: 1,
    keptShare: 0,
    detectors: { 'embed-error': { count: 1, where: ['iframe YouTube in div.module-ct "Featured Video"'] } }
  }
  const v = judgePreview([row])['PREV-1']
  assert.equal(v.status, 'fail')
  assert.match(v.note, /YouTube/)
  assert.ok(v.kinds.some((/** @type {any} */ k) => k.kind === 'embed-error' && k.count === 1))
})
