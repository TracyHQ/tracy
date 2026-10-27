/**
 * The customer's preview asked of the server's own doors (`lib/preview-door-health.js`, PR 2 of
 * 14/10/2026): on dev every fleet01 stylesheet answered 502 through the asset door and the popup showed
 * an unstyled page while the measuring machine, reading its own copy of the door, saw nothing wrong.
 * The check walks the real doors (here a fake `app.request`), and a failure fails PREV-1 as must-fix.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DOOR_PROBE_HEADER,
  isDoorProbe,
  newDoorProbeToken,
  previewDoorHealth
} from '../src/lib/preview-door-health.js'
import { summarizeDsReadiness } from '../src/lib/template-design-system-readiness/severity.js'

const ORIGIN = 'https://cowork.tracy.site'
const asset = (path) =>
  `${ORIGIN}/api/design-system/preview-asset?quickstart=quickstart%2Fja-directory%2Fj6&amp;path=${encodeURIComponent(path)}`

/** The doors as the dev server answered on 14/10/2026: the page is served, every stylesheet 502. */
function doors({ cssStatus = 502, pageStatus = 200 } = {}) {
  const asked = []
  const request = async (path, init) => {
    asked.push([path, init?.headers?.[DOOR_PROBE_HEADER] ?? null])
    if (path.startsWith('/api/design-system/preview?'))
      return new Response(
        `<html><head><link rel="stylesheet" href="${asset('/t3-assets/css/a.css')}"><link rel="stylesheet" href="${asset('/templates/ja_directory/css/b.css')}"></head></html>`,
        { status: pageStatus, headers: { 'content-type': 'text/html' } }
      )
    if (path.includes('font.woff2'))
      return new Response('w', { status: 200, headers: { 'content-type': 'font/woff2' } })
    return cssStatus === 200
      ? new Response(`@font-face{src:url(${asset('/fonts/font.woff2')})}`, {
          status: 200,
          headers: { 'content-type': 'text/css' }
        })
      : new Response('Bad gateway', { status: cssStatus })
  }
  return { request, asked }
}

test('a stylesheet the asset door cannot serve is a failure, and the check sends its token', async () => {
  const token = newDoorProbeToken()
  const { request, asked } = doors()
  const h = previewDoorHealth({ request, token, now: () => 1_000 })
  const r = await h.check('quickstart/ja-directory/j6')
  assert.equal(r.page, 200)
  assert.equal(r.assets, 2)
  assert.deepEqual(
    r.failed.map((f) => [f.path, f.status]),
    [
      ['/t3-assets/css/a.css', 502],
      ['/templates/ja_directory/css/b.css', 502]
    ]
  )
  assert.ok(
    asked.every(([, t]) => t === token),
    'every ask carries the token'
  )
  assert.ok(asked[0][0].includes('id=refero%3A7f70ee10'), 'dressed in Moxie')
})

test('a healthy door: stylesheets and the fonts they point at all load', async () => {
  const { request } = doors({ cssStatus: 200 })
  const r = await previewDoorHealth({ request, token: 't' }).check('quickstart/ja-directory/j6')
  assert.deepEqual(r.failed, [])
  assert.equal(r.assets, 3, 'two sheets and the font they name, asked once')
})

test('no demo (409) is left to DEMO-1; refresh keeps answers and asks a line once per window', async () => {
  let calls = 0
  const request = async () => {
    calls++
    return new Response('{}', { status: 409 })
  }
  let t = 0
  const h = previewDoorHealth({ request, token: 't', now: () => t, spacingMs: 0, keepMs: 1000 })
  await h.refresh(['a', 'b'])
  assert.equal(h.of('a')?.skipped, 'unavailable')
  assert.equal(calls, 2)
  await h.refresh(['a', 'b'])
  assert.equal(calls, 2, 'fresh answers are kept')
  t = 5000
  await h.refresh(['a'])
  assert.equal(calls, 3)
})

test('the token is compared exactly, a missing or wrong one is no probe', () => {
  const token = newDoorProbeToken()
  assert.equal(isDoorProbe(token, token), true)
  assert.equal(isDoorProbe(undefined, token), false)
  assert.equal(
    isDoorProbe(`${token.slice(0, -1)}0`.replace(/.$/, token.endsWith('0') ? '1' : '0'), token),
    false
  )
  assert.equal(isDoorProbe(token, null), false, 'no token: no probe at all')
})

test('a failing door fails PREV-1 as must-fix on the Design system step, over a measured pass', () => {
  const report = {
    results: [
      { id: 'SLOT-1', status: 'pass', owner: 'contract', message: 'ok' },
      {
        id: 'PREV-1',
        status: 'pass',
        owner: 'contract',
        message: 'one document. Measured on 1.0.2, 2026-10-14, imac.'
      }
    ]
  }
  const clean = summarizeDsReadiness(report, undefined, { previewGap: null })
  assert.equal(clean.mustFix.length, 0)
  const broken = summarizeDsReadiness(report, undefined, {
    previewGap: null,
    doorHealth: {
      checkedAt: Date.UTC(2026, 9, 14, 13, 30),
      assets: 2,
      failed: [{ path: '/t3-assets/css/a.css', status: 502 }]
    }
  })
  const item = broken.mustFix.find((m) => m.rule === 'PREV-1')
  assert.ok(item, 'PREV-1 is must-fix')
  assert.match(item.text, /cannot load its stylesheets/)
  assert.match(item.message, /1 of 2 file\(s\) did not load: \/t3-assets\/css\/a\.css \(502\)/)
  assert.equal(broken.passed, clean.passed - 1)
  assert.ok(!broken.measuredPassed.some((m) => m.rule === 'PREV-1'))
  assert.equal(broken.grade, 'C')
})

test('sheet-failed: every stylesheet a 502 asset door refused is a PREV-1 finding; a serving door none', async () => {
  const { readFileSync } = await import('node:fs')
  const { detect } = await import('../scripts/preview-detectors/sheet-failed.mjs')
  const { PREVIEW_KINDS } = await import('../../../packages/design/tracy-ds-slot/src/measurement.mjs')
  assert.equal(PREVIEW_KINDS['sheet-failed'].rule, 'PREV-1')
  const f = JSON.parse(
    readFileSync(new URL('./fixtures/preview-detectors/sheet-failed.json', import.meta.url), 'utf8')
  )
  for (const s of f.broken) {
    const r = detect({ worn: { data: s.worn.data } })
    assert.ok(r.count >= 3, s.source)
    assert.ok(r.findings.some((x) => /t3-assets\/css/.test(x.at)))
  }
  for (const s of f.clean) assert.equal(detect({ worn: { data: s.worn.data } }).count, 0, s.source)
})

// Measured 20/10/2026 on cowork.tracy.site: JA Rent, Mood, Donate, Smallbiz and Space (T3 head.php) link
// /templates/system/css/system.css, a file Joomla 6 no longer ships. The demo itself answers 404 for it, so
// the asset door answers 404 DEMO_UNREADABLE ("the demo has not got the file") and the customer's preview
// looks exactly as the site does. That is the template's own dead link, not a door that cannot serve.
test("a stylesheet the demo itself has not got is the template's own dead link, not a door failure", async () => {
  const request = async (path) => {
    if (path.startsWith('/api/design-system/preview?'))
      return new Response(
        `<html><head><link rel="stylesheet" href="${asset('/templates/system/css/system.css')}"><link rel="stylesheet" href="${asset('/t3-assets/css/a.css')}"></head></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    if (path.includes('system.css')) return Response.json({ code: 'DEMO_UNREADABLE' }, { status: 404 })
    return new Response('a{}', { status: 200, headers: { 'content-type': 'text/css' } })
  }
  const r = await previewDoorHealth({ request, token: 't' }).check('quickstart/ja-rent/j6')
  assert.deepEqual(r.failed, [])
  assert.deepEqual(r.missing, [{ path: '/templates/system/css/system.css', status: 404 }])
  assert.equal(r.assets, 2)
})

test('a 404 the door answers on its own (no live demo) or a 404 on every asset still fails', async () => {
  const page = `<html><head><link rel="stylesheet" href="${asset('/a.css')}"><link rel="stylesheet" href="${asset('/b.css')}"></head></html>`
  const answering = (body) => async (path) =>
    path.startsWith('/api/design-system/preview?')
      ? new Response(page, { status: 200, headers: { 'content-type': 'text/html' } })
      : Response.json(body, { status: 404 })
  const notFound = await previewDoorHealth({ request: answering({ code: 'NOT_FOUND' }), token: 't' }).check(
    'x'
  )
  assert.equal(notFound.failed.length, 2, 'NOT_FOUND is the door not finding the demo')
  const allGone = await previewDoorHealth({
    request: answering({ code: 'DEMO_UNREADABLE' }),
    token: 't'
  }).check('x')
  assert.equal(
    allGone.failed.length,
    2,
    'not one stylesheet loads: that is no dead link, the preview is unstyled'
  )
})
