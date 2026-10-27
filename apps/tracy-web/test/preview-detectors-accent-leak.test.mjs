/**
 * ACCENT-LEAK (preview probe 10; Akemi, 17/10/2026): the template's own brand hue still on screen while a
 * design system is worn.
 * - Real previews (`fixtures/preview-detectors/accent-leak.json`, preview-check.mjs PREVIEW_DATA=1 with
 *   PREVIEW_PROBE_NEXT=1, cut to the colours this detector reads): the states Akemi found leaking (JA Phio,
 *   Tour and Impact before their leak fixes, JA Vega as it is) fail; the same templates after their fixes and
 *   templates she approved pass.
 * - The probe in a real headless Chrome on a page cut to each case: a brand hover, a brand border, a
 *   gradient picture in the brand hue are found; a photograph with the same blue, a logo, a social mark, a
 *   status colour and a picture in the system's own hue are not.
 * - The rule is dormant at probe 9: no rule, no judgement, no "not measured" on a file measured at 9.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import {
  ACCENT_LEAK_SINCE,
  activeKinds,
  BUILT_SITE_RULES,
  judgePreview,
  PREVIEW_KINDS,
  previewRuleIds
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'
import * as accentLeak from '../scripts/preview-detectors/accent-leak.mjs'
import {
  accentLeakBrandHueFollows,
  probeNextRules
} from '../src/lib/template-design-system-readiness/rules/built-site.js'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'

const SEVERITY = JSON.parse(
  readFileSync(
    new URL('../src/lib/template-design-system-readiness/rule-severity.json', import.meta.url),
    'utf8'
  )
)
const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/accent-leak.json', import.meta.url), 'utf8')
)
const judge = (/** @type {any} */ s) =>
  accentLeak.detect({
    worn: { base: null, data: s.worn, html: '' },
    plain: { base: null, data: s.plain, html: '' },
    systemColours: s.systemColours,
    systemPalette: s.systemPalette ?? [],
    statusColours: s.statusColours ?? []
  })

test('accent-leak is a probe-10 kind with its own rule, a registry line and a must-fix severity', () => {
  // the detector, the kind registry and the /ops rule name one another: the detector's kind is the
  // registry's, the registry's rule is the /ops rule, and all three start at the same probe
  assert.equal(PREVIEW_KINDS[accentLeak.kind]?.rule, accentLeakBrandHueFollows.id)
  assert.equal(accentLeak.since, ACCENT_LEAK_SINCE)
  assert.equal(PREVIEW_KINDS[accentLeak.kind].since, ACCENT_LEAK_SINCE)
  assert.ok(previewRuleIds(PREVIEW_KINDS, ACCENT_LEAK_SINCE).includes('ACCENT-LEAK'))
  assert.ok(!previewRuleIds(PREVIEW_KINDS, ACCENT_LEAK_SINCE - 1).includes('ACCENT-LEAK'))
  // a rule of probe 10: its severity waits in rulesFromProbe until the server runs that probe
  assert.equal(
    SEVERITY.rulesFromProbe[String(ACCENT_LEAK_SINCE)][accentLeakBrandHueFollows.id].group,
    'must-fix'
  )
  assert.ok(!(accentLeakBrandHueFollows.id in SEVERITY.rules))
})

test('at probe 9 the rule is dormant: not on the check, not judged, so no v9 file reads "not measured"', () => {
  // the flip to 10 is the batch's final gate; until then the current probe must keep the rule off
  const on = PREVIEW_PROBE_VERSION >= ACCENT_LEAK_SINCE
  assert.equal(
    RULES.some((r) => r.id === 'ACCENT-LEAK'),
    on
  )
  assert.equal(probeNextRules.includes(accentLeakBrandHueFollows), on)
  assert.equal(BUILT_SITE_RULES.includes('ACCENT-LEAK'), on)
  assert.equal(previewRuleIds().includes('ACCENT-LEAK'), on)
  assert.ok(!('accent-leak' in activeKinds(PREVIEW_KINDS, 9)))
  assert.ok('accent-leak' in activeKinds(PREVIEW_KINDS, 10))
  const row = (/** @type {number} */ probeVersion, /** @type {any} */ detectors) => ({
    system: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
    scheme: 'light',
    page: '/',
    probeVersion,
    kept: 0,
    glare: 0,
    keptText: 0,
    lowText: 0,
    lostButtons: 0,
    docs: 1,
    failedFonts: 0,
    empty: 0,
    detectors
  })
  const at9 = judgePreview([row(9, {})], undefined, PREVIEW_KINDS, null, 9)
  assert.ok(!('ACCENT-LEAK' in at9))
  // at probe 10 a row that measured it is judged: a leak fails, a clean row passes
  const leak = { count: 1, unique: 1, where: ['div.cta-wrap picture #2358de (bg-cta.jpg)'] }
  const at10 = judgePreview([row(10, { 'accent-leak': leak })], undefined, PREVIEW_KINDS, null, 10)
  assert.equal(at10['ACCENT-LEAK'].status, 'fail')
  assert.match(at10['ACCENT-LEAK'].note, /bg-cta\.jpg/)
  const clean = judgePreview(
    [row(10, { 'accent-leak': { count: 0, unique: 0, where: [] } })],
    undefined,
    PREVIEW_KINDS,
    null,
    10
  )
  assert.equal(clean['ACCENT-LEAK'].status, 'pass')
})

test('real previews: every state Akemi found leaking fails', () => {
  assert.ok(FIXTURE.broken.length >= 4)
  for (const s of FIXTURE.broken) {
    const r = judge(s)
    assert.ok(r.count > 0, `${s.source}: expected a leak, found none`)
    for (const want of s.expect ?? [])
      assert.ok(
        r.findings.some((/** @type {any} */ f) => f.at.includes(want)),
        `${s.source}: expected ${want} among ${r.findings.map((/** @type {any} */ f) => f.at).join(' | ')}`
      )
  }
})

test('real previews: the fixed states and the approved templates pass', () => {
  assert.ok(FIXTURE.clean.length >= 6)
  for (const s of FIXTURE.clean) {
    const r = judge(s)
    assert.equal(r.count, 0, `${s.source}: ${r.findings.map((/** @type {any} */ f) => f.at).join(' | ')}`)
  }
})

test('no system worn (DEF-1) and no system read: nothing is judged', () => {
  const s = FIXTURE.broken[0]
  assert.equal(
    accentLeak.detect({ worn: { data: null }, plain: { data: s.plain }, systemColours: s.systemColours })
      .count,
    0
  )
  // the template's own page in the worn seat (no slot, so no --ds-c-* role and no system colour): DEF-1
  assert.equal(
    accentLeak.detect({
      worn: { data: { ...s.plain, roles: [] } },
      plain: { data: s.plain },
      systemColours: [],
      systemPalette: []
    }).count,
    0
  )
})

// ---- the probe in a real page ----

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

/** A 96×48 PNG-free picture: an SVG gradient in the template's blue, smooth (a call-to-action band). */
const svg = (/** @type {string} */ body) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48">${body}</svg>`)}`
const BLUE_BAND = svg(
  '<defs><linearGradient id="g"><stop offset="0" stop-color="#1f4fd8"/><stop offset="1" stop-color="#2a62f0"/></linearGradient></defs><rect width="96" height="48" fill="url(#g)"/>'
)
/** A "photograph": blue sky over a busy, many-coloured ground, sharp edges everywhere. */
const PHOTO = svg(
  `${Array.from({ length: 96 }, (_, i) => `<rect x="${(i % 12) * 8}" y="${Math.floor(i / 12) * 6}" width="8" height="6" fill="${['#1f4fd8', '#f2c14e', '#2e7d32', '#ffffff', '#8d6e63', '#212121'][(i * 7 + Math.floor(i / 12)) % 6]}"/>`).join('')}`
)

/** A podcast service's "listen on" logo row as JA Podcast prints it: inline SVG marks in the platforms' colours. */
const PLATFORMS = `<div class="listen-on">
  <div class="link-pod-item pod-spotify"><a href="https://open.spotify.com/show/x"><svg width="25" height="25"><rect width="25" height="25" fill="#2ebd59"/></svg></a></div>
  <div class="link-pod-item"><a href="#itunes" title="Listen on iTunes"><svg width="25" height="25"><rect width="25" height="25" fill="#cc45f2"/></svg></a></div>
  <div class="link-pod-item"><a href="https://soundcloud.com/x"><svg width="25" height="25"><rect width="25" height="25" fill="#ff5500"/></svg></a></div>
  </div>`
/** The same row drawn as one near-neutral picture (a grey logo strip with a faint blue cast): no brand hue. */
const GREY_LOGOS = svg(
  '<rect width="96" height="48" fill="#8a909c"/><rect x="10" y="10" width="20" height="20" fill="#6e7480"/>'
)

/** The template's page; `wear` stands for the slot (its role variables and rules). */
const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  :root { --accent: #1f4fd8 }
  body { margin: 0; font: 16px/1.5 sans-serif; background: #fff; color: #222 }
  .btn { display: inline-block; padding: 10px 20px; background: var(--accent); color: #fff; text-decoration: none }
  .menu a { color: #222; text-decoration: none; margin-right: 20px }
  .menu a:hover { color: #1f4fd8 }
  .card { border: 2px solid #1f4fd8; padding: 20px; width: 300px; margin: 20px }
  .cta { height: 200px; background: url("${BLUE_BAND}") center / cover; color: #fff; padding: 40px }
  .photo { height: 200px; background: url("${PHOTO}") center / cover }
  .logo { color: #1f4fd8; font-weight: 700 }
  .social-facebook { color: #1877f2 }
  .alert-danger { color: #b02a37; background: #f8d7da; padding: 10px }
  ${wear}
  </style></head><body>
  <div class="logo">Brand</div>
  <nav class="menu"><a href="#a">Home</a><a href="#b">About</a></nav>
  <a class="btn" href="#c">Start</a>
  <div class="card">Card</div>
  <section class="cta">Get started now</section>
  <section class="photo"></section>
  <a class="social-facebook" href="https://facebook.com/x">Facebook</a>
  <div class="alert-danger">Error</div>
  ${PLATFORMS}
  <img class="listen-strip" src="${GREY_LOGOS}" width="96" height="48" alt="">
  </body></html>`)}`

/** A fair wear: every brand place follows the accent (pink), the band's picture swapped for an accent gradient. */
const FAIR = `:root { --ds-c-accent: #e0336f; --accent: var(--ds-c-accent) }
  .menu a:hover { color: var(--ds-c-accent) } .card { border-color: var(--ds-c-accent) }
  .cta { background: linear-gradient(90deg, var(--ds-c-accent), #b8265a) }`
/** A leaky wear: the accent variable follows, but the hover, the card border and the band's picture do not. */
const LEAKY = ':root { --ds-c-accent: #e0336f; --accent: var(--ds-c-accent) }'

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9475)
})
after(async () => {
  await chrome?.close?.()
})

const measure = async (/** @type {string} */ html) => {
  await chrome.open(html, 1440)
  return chrome.evaluate(accentLeak.probe)
}

test('the probe finds a brand hover, a brand border and a band picture in the brand hue', opts, async () => {
  const plain = await measure(page(''))
  const worn = await measure(page(LEAKY))
  const r = accentLeak.detect({
    worn: { data: worn },
    plain: { data: plain },
    systemColours: ['#e0336f', '#ffffff', '#222222']
  })
  const at = r.findings.map((/** @type {any} */ f) => f.at)
  assert.ok(
    at.some((a) => /menu a:hover words #1f4fd8/.test(a)),
    at.join(' | ')
  )
  assert.ok(
    at.some((a) => /div\.card border #1f4fd8/.test(a)),
    at.join(' | ')
  )
  assert.ok(
    at.some((a) => /section\.cta picture/.test(a)),
    at.join(' | ')
  )
  // never the photograph, the logo, the social mark or the status message
  assert.ok(!at.some((a) => /photo|logo|facebook|alert/.test(a)), at.join(' | '))
})

test('the probe passes a fair wear, and a system whose accent is the template blue', opts, async () => {
  const plain = await measure(page(''))
  const fair = accentLeak.detect({
    worn: { data: await measure(page(FAIR)) },
    plain: { data: plain },
    systemColours: ['#e0336f', '#b8265a', '#ffffff', '#222222']
  })
  assert.equal(fair.count, 0, fair.findings.map((/** @type {any} */ f) => f.at).join(' | '))
  // a blue system: the template's blue left in place cannot be told from the system's own
  const blue = ':root { --ds-c-accent: #2050d0; --accent: var(--ds-c-accent) }'
  const same = accentLeak.detect({
    worn: { data: await measure(page(blue)) },
    plain: { data: plain },
    systemColours: ['#2050d0', '#ffffff', '#222222']
  })
  assert.equal(same.count, 0, same.findings.map((/** @type {any} */ f) => f.at).join(' | '))
})

test("the probe leaves listening platforms' logos and a near-neutral logo picture alone", opts, async () => {
  // JA Podcast 1.0.6 (FINAL-GATE-B, 18/10): the Apple Podcasts / SoundCloud / Google / Spotify marks of its
  // players were read as the template's brand colours and flagged under every system; they are the platforms'
  const plain = await measure(page(''))
  const r = accentLeak.detect({
    worn: { data: await measure(page(LEAKY)) },
    plain: { data: plain },
    systemColours: ['#e0336f', '#ffffff', '#222222']
  })
  const at = r.findings.map((/** @type {any} */ f) => f.at)
  assert.ok(
    !at.some((a) => /link-pod-item|listen-on|listen-strip|#2ebd59|#cc45f2|#ff5500/.test(a)),
    at.join(' | ')
  )
  // the template's own leaks next to them are still found
  assert.ok(
    at.some((a) => /div\.card border #1f4fd8/.test(a)),
    at.join(' | ')
  )
})
