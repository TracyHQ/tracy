/**
 * The banner a JoomlArt demo carries. Two things can be wrong here and neither would show up as an
 * error: the link could open the gallery instead of the template's own card, and the script could
 * be served in a way a page on someone else's origin cannot load.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseHTML } from 'linkedom'

import { DEFAULT_SETTING } from '../src/lib/badge-setting.js'
import {
  ADVERT_MOTION,
  BUILD_WITH_TRACY_SCRIPT,
  JOOMLART_ONLY,
  buildWithTracyHref,
  buildWithTracyScript,
  buildWithTracySnippet
} from '../src/lib/build-with-tracy-demo.js'
import {
  ADVERT_MOTION as BADGE_MOTION,
  JOOMLART_ONLY as BADGE_JOOMLART_ONLY,
  TRACY_MARK as BADGE_MARK,
  advertBadgeScript
} from '../src/lib/tracy-badge.js'
import { TRACY_MARK } from '../src/lib/build-with-tracy-demo.js'
import { badgeRoutes } from '../src/badge/route.js'

test('the link opens Design inspiration on the template the visitor is looking at', () => {
  assert.equal(
    buildWithTracyHref({ origin: 'https://cowork.tracy.ai', template: 'ja-kinetic' }),
    'https://cowork.tracy.ai/design-inspiration?open=ja-kinetic&provider=JoomlArt&utm_source=joomlart&utm_medium=demo&utm_campaign=tracy-beta-2026-10&utm_content=ja-kinetic'
  )
  // An unusable id opens the gallery rather than a dialog on nothing: advertise less, never wrongly.
  // The click still counts as the campaign, without a template it could not name.
  assert.equal(
    buildWithTracyHref({ origin: 'https://cowork.tracy.ai', template: '../evil' }),
    'https://cowork.tracy.ai/design-inspiration?provider=JoomlArt&utm_source=joomlart&utm_medium=demo&utm_campaign=tracy-beta-2026-10'
  )
})

test('spec 4.7 #39: the link carries the campaign and the template as utm_content', () => {
  const url = new URL(buildWithTracyHref({ template: 'ja-vega', provider: 'JoomlArt' }))
  assert.equal(url.searchParams.get('open'), 'ja-vega')
  assert.equal(url.searchParams.get('provider'), 'JoomlArt')
  assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([key]) => key.startsWith('utm_'))), {
    utm_source: 'joomlart',
    utm_medium: 'demo',
    utm_campaign: 'tracy-beta-2026-10',
    utm_content: 'ja-vega'
  })
})

test('public demo links default to production and honour an explicit origin', () => {
  assert.equal(
    buildWithTracyHref({ template: 'ja-kinetic' }),
    'https://cowork.tracy.ai/design-inspiration?open=ja-kinetic&provider=JoomlArt&utm_source=joomlart&utm_medium=demo&utm_campaign=tracy-beta-2026-10&utm_content=ja-kinetic'
  )
  assert.match(
    buildWithTracySnippet({ scriptUrl: 'https://cowork.tracy.ai/build-with-tracy-demo.js' }),
    /data-origin="https:\/\/cowork\.tracy\.ai"/
  )
  assert.equal(
    buildWithTracyHref({ origin: 'https://cowork.tracy.site', template: 'ja-kinetic' }),
    'https://cowork.tracy.site/design-inspiration?open=ja-kinetic&provider=JoomlArt&utm_source=joomlart&utm_medium=demo&utm_campaign=tracy-beta-2026-10&utm_content=ja-kinetic'
  )
})

test('the tag differs between demos in exactly one attribute', () => {
  const tag = (template) =>
    buildWithTracySnippet({
      scriptUrl: 'https://c.tracy.ai/build-with-tracy-demo.js',
      template,
      origin: 'https://c.tracy.ai'
    })
  assert.match(tag('ja-kinetic'), /data-template="ja-kinetic"/)
  assert.equal(
    tag('ja-kinetic').replace('ja-kinetic', 'X'),
    tag('ja-voyara').replace('ja-voyara', 'X'),
    'one demo differs from the next by its template id and nothing else'
  )
})

test('the mark is the same drawing as the badge — the two pills must not disagree', () => {
  // Copied rather than imported (Lee, 16/09), so this is the only thing that would notice a drift.
  assert.equal(TRACY_MARK, BADGE_MARK)
})

test('the script parses, renders fixed, and carries the mark', () => {
  assert.doesNotThrow(() => new Function(BUILD_WITH_TRACY_SCRIPT))
  assert.match(BUILD_WITH_TRACY_SCRIPT, /position:fixed/)
  assert.match(BUILD_WITH_TRACY_SCRIPT, /attachShadow/)
  assert.match(BUILD_WITH_TRACY_SCRIPT, /M391\.066 95/)
})

test('a page on somebody else’s origin can load it, without a session', async () => {
  const app = badgeRoutes({ config: { origin: 'https://cowork.tracy.test' } })
  const response = await app.fetch(new Request('https://cowork.tracy.test/build-with-tracy-demo.js'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /javascript/)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(await response.text(), /build-with-tracy-demo/)
})

// ---------------------------------------------------------------------------------------------
// Motion: the `animation` switch of the advert setting, on both advert doors.

/** The two advert doors, the id each host carries, and what a visitor finds in each. */
const DOORS = [
  { path: '/tracy-badge.js', hostId: 'tracy-badge', render: advertBadgeScript, assertDoors: assertPill },
  {
    path: '/build-with-tracy-demo.js',
    hostId: 'build-with-tracy-demo',
    render: buildWithTracyScript,
    assertDoors: assertCard
  }
]
const LABEL = 'Like this design? Build it with Tracy'
/** The advert as staff saved it before the switch existed: saved words, colour B, no `animation`. */
const savedBefore = {
  doors: { customize: { on: true, label: LABEL }, close: { on: true, label: 'Close' } },
  style: { bg: '#bf5b3d', fg: '#ffffff', accent: '#ffffff', position: 'right', mark: true }
}
const moving = { ...savedBefore, style: { ...savedBefore.style, animation: true } }
const serving = (setting) =>
  badgeRoutes({
    config: { origin: 'https://cowork.tracy.test' },
    pool: {
      query: async () => ({
        rows: [{ id: 'advert', setting, revision: 5, updated_by: 'a', updated_at: 'T' }]
      })
    }
  })
const served = async (setting, path) =>
  (await serving(setting).fetch(new Request(`https://cowork.tracy.test${path}`))).text()

/**
 * Run a served script the way a demo page would: a document whose `currentScript` is the tag
 * JoomlArt carries. `window`, `document` and `ResizeObserver` are handed in; `setTimeout` is the
 * global, so a test can mock it. Returns the page and a way to find the badge's host.
 */
function runOnPage(script, hostId, tag = '<script data-template="ja-kinetic"></script>', location = {}) {
  const { document } = parseHTML(`<!doctype html><html><head></head><body><h1>Demo</h1>${tag}</body></html>`)
  Object.defineProperty(document, 'currentScript', { value: document.querySelector('script') })
  // A fresh `window` per page: the script marks it (`__tracyBadge`) to run once, and linkedom's own
  // window outlives one parse. No layout here, so the observer reports the pill at its measured
  // desktop size (328 × 46).
  const window = { location }
  window.ResizeObserver = class {
    constructor(fn) {
      this.fn = fn
    }
    observe(el) {
      Object.defineProperties(el, { offsetWidth: { value: 328 }, offsetHeight: { value: 46 } })
      this.fn()
    }
  }
  new Function('window', 'document', 'ResizeObserver', script)(window, document, window.ResizeObserver)
  return { document, host: () => document.getElementById(hostId) }
}

/** The badge's pill, whatever the motion: the saved words, the link, the close button. */
function assertPill(host) {
  const root = host.shadowRoot
  assert.ok(root, 'the badge renders in a shadow root')
  const cta = root.querySelector('a.cta')
  assert.equal(cta.querySelector('span').textContent, LABEL)
  assert.equal(
    cta.getAttribute('href'),
    'https://cowork.tracy.ai/design-inspiration?open=ja-kinetic&provider=JoomlArt'
  )
  assert.equal(cta.getAttribute('target'), '_blank')
  assert.equal(root.querySelector('button.close').getAttribute('aria-label'), 'Close')
  assert.ok(root.querySelector('svg.mark'), 'the mark is drawn')
}

// The banner's client script builds its link itself; it must say what `buildWithTracyHref` says.
const DEMO_HREF = buildWithTracyHref({ template: 'ja-kinetic' })

/** The demo's card, whatever the motion: the fixed words, the link, the close button. */
function assertCard(host) {
  const root = host.shadowRoot
  assert.ok(root, 'the banner renders in a shadow root')
  const card = root.querySelector('.card')
  assert.ok(card, 'the card is what a page load shows')
  assert.equal(root.querySelector('.bar'), null, 'not the pill')
  assert.equal(card.querySelector('.eyebrow').textContent, 'AI website builder for Joomla')
  assert.equal(
    card.querySelector('.title').textContent,
    'Get JA Kinetic as a finished site, not an empty CMS.'
  )
  assert.deepEqual(
    [...card.querySelectorAll('.points li')].map((li) => li.textContent),
    [
      'Built from this design in a few minutes',
      'No coding. Just ask in your own language',
      'Undo any AI change in one click'
    ]
  )
  const go = card.querySelector('a.go')
  assert.equal(go.textContent, 'Build this site with Tracy')
  assert.equal(go.getAttribute('href'), DEMO_HREF)
  assert.equal(go.getAttribute('target'), '_blank')
  assert.equal(card.querySelector('button.close').getAttribute('aria-label'), 'Close')
  assert.ok(card.querySelector('svg.mark'), 'the mark is drawn')
  // Measured on ja-kinetic 29/09: an icon with only a viewBox filled the whole button.
  for (const svg of card.querySelectorAll('svg.tick, svg.arrow')) {
    assert.ok(
      svg.getAttribute('width') && svg.getAttribute('height'),
      `${svg.getAttribute('class')} has a size`
    )
  }
  assert.match(host.shadowRoot.querySelector('style').textContent, /\.arrow\{[^}]*width:14px/)
}

/** linkedom's own Event: its dispatch writes fields that Node's Event keeps read-only. */
const { Event: DomEvent } = parseHTML('<!doctype html><html></html>')
/** Press a button the way a visitor would. */
const press = (button) => button.dispatchEvent(new DomEvent('click'))

test('the two advert scripts carry the same motion, copied rather than imported', () => {
  // Kept apart on purpose (head of `build-with-tracy-demo.js`), so this is what notices a drift.
  assert.equal(ADVERT_MOTION, BADGE_MOTION)
  for (const { render } of DOORS)
    for (const setting of [DEFAULT_SETTING.advert, moving])
      assert.ok(render(setting).includes(ADVERT_MOTION), `${render.name} splices the shared block`)
})

test('the two advert scripts carry the same JoomlArt-only guard, copied rather than imported', () => {
  assert.equal(JOOMLART_ONLY, BADGE_JOOMLART_ONLY)
  for (const { render } of DOORS)
    assert.ok(render(DEFAULT_SETTING.advert).includes(JOOMLART_ONLY), `${render.name} splices the guard`)
})

/** A page at `href` loading the script from Tracy by `src`, as a demo's template does. */
const pageAt = (href) => {
  const url = new URL(href)
  return { href: url.href, hostname: url.hostname, origin: url.origin }
}
const tagFrom = (path) =>
  `<script src="https://cowork.tracy.site${path}" data-template="ja-kinetic"></script>`

// Akemi 29/09: Tracy's Design inspiration preview frames the demo Tracy hosts (`*.tracy.site`), and
// the banner in it advertised Tracy inside Tracy. The advert belongs on JoomlArt's demos only.
test('on a demo Tracy hosts, neither advert shows — only JoomlArt’s own demos carry it', async () => {
  for (const { path, hostId } of DOORS) {
    const tag = tagFrom(path)
    for (const href of [
      'https://ja-kinetic-wordpress.tracy.site/',
      'https://ja-voyara-joomla.tracy.site/index.php',
      'https://notjoomlart.com/',
      'https://joomlart.com.example.org/'
    ]) {
      const page = runOnPage(await served(savedBefore, path), hostId, tag, pageAt(href))
      assert.equal(page.host(), null, `${path} stays off ${href}`)
    }
    for (const href of [
      'https://ja-kinetic.demo.joomlart.com/',
      'https://joomlart.com/',
      'https://www.JoomlArt.com/'
    ]) {
      const page = runOnPage(await served(savedBefore, path), hostId, tag, pageAt(href))
      assert.ok(page.host(), `${path} shows on ${href}`)
    }
  }
})

test('Tracy’s own previews still show the advert: the inlined script, and a page on the serving origin', async () => {
  for (const { path, hostId } of DOORS) {
    // `/ops/widget` runs the script inline in a srcdoc frame: no src, and no host to judge.
    const inline = runOnPage(await served(savedBefore, path), hostId, undefined, { href: 'about:srcdoc' })
    assert.ok(inline.host(), `${path} shows in the /ops/widget preview`)
    // `/tracy-badge` is a page on the origin that serves the script.
    const own = runOnPage(
      await served(savedBefore, path),
      hostId,
      tagFrom(path),
      pageAt('https://cowork.tracy.site/tracy-badge')
    )
    assert.ok(own.host(), `${path} shows on Tracy's own page`)
  }
})

test('both scripts parse with the motion on and off', () => {
  for (const { render } of DOORS)
    for (const setting of [DEFAULT_SETTING.advert, moving])
      assert.doesNotThrow(() => new Function(render(setting)), `${render.name} ${setting.style.animation}`)
})

test('both doors serve the switch as saved, and a row without it as off with its own words', async () => {
  for (const { path } of DOORS) {
    const on = await served(moving, path)
    assert.ok(on.includes('"animation":true'), `${path} on`)
    const before = await served(savedBefore, path)
    assert.ok(before.includes('"animation":false'), `${path}: no key reads as off`)
    assert.ok(before.includes(LABEL), `${path}: the saved words, not the default ones`)
    assert.ok(!before.includes('Customize with Tracy'), `${path}: not the default words`)
  }
})

test('off, the badge is on the page at once, with no motion rules and no light band', async () => {
  for (const { path, hostId, assertDoors } of DOORS) {
    const page = runOnPage(await served(savedBefore, path), hostId)
    const host = page.host()
    assert.ok(host, `${path}: attached at once`)
    assertDoors(host)
    assert.equal(host.shadowRoot.querySelector('svg.run'), null, `${path}: no light band`)
    assert.ok(!host.shadowRoot.querySelector('style').textContent.includes('@keyframes'), path)
  }
})

test('on, the badge arrives after 1.5 s, slides in, and carries the light band', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const { path, hostId, assertDoors } of DOORS) {
    const page = runOnPage(await served(moving, path), hostId)
    assert.equal(page.host(), null, `${path}: not yet`)
    t.mock.timers.tick(1499)
    assert.equal(page.host(), null, `${path}: still not at 1499 ms`)
    t.mock.timers.tick(1)
    const host = page.host()
    assert.ok(host, `${path}: there at 1500 ms`)
    assertDoors(host)
    // The demo's light band runs on its pill, which a press on the card's close button brings.
    if (hostId === 'build-with-tracy-demo') {
      assert.equal(host.shadowRoot.querySelector('svg.run'), null, `${path}: no band on the card`)
      press(host.shadowRoot.querySelector('.card button.close'))
    }
    const run = host.shadowRoot.querySelector('svg.run')
    assert.ok(run, `${path}: light band`)
    assert.equal(run.getAttribute('aria-hidden'), 'true')
    const paths = run.querySelectorAll('path')
    assert.equal(paths.length, 13, `${path}: thirteen stacked dashes`)
    for (const p of paths) {
      assert.equal(p.getAttribute('pathLength'), '100')
      // A stadium 3px in from the pill's edge, drawn 2px wide: the band lies 2–4px inside the edge.
      assert.equal(p.getAttribute('d'), 'M23 3H305A20 20 0 0 1 305 43H23A20 20 0 0 1 23 3Z')
    }
    assert.equal(run.getAttribute('viewBox'), '0 0 328 46')
    const css = host.shadowRoot.querySelector('style').textContent
    assert.match(css, /@keyframes btw-in\{from\{opacity:0;transform:translateY\(24px\)\}/)
    assert.match(css, /\.bar\{animation:btw-in \.5s ease-out both\}/)
    assert.match(css, /\.run\{animation:btw-lap 6s linear \.5s infinite\}/)
    assert.match(css, /stroke-width:2/)
    assert.match(
      css,
      /@media \(prefers-reduced-motion:reduce\)\{\.bar\{animation:none\}\.run\{display:none\}\}/
    )
    if (hostId === 'build-with-tracy-demo') {
      assert.match(css, /\.card\{animation:btw-in \.5s ease-out both\}/)
      assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.card\{animation:none\}\}/)
    }
  }
})

// ---------------------------------------------------------------------------------------------
// The demo's card and pill (Akemi 29/09): nothing folds by itself, only a press does.

const demoPage = async (setting = savedBefore, tag) =>
  runOnPage(await served(setting, '/build-with-tracy-demo.js'), 'build-with-tracy-demo', tag)

test('the card folds into the pill on close, opens again from the pill, and the pill’s close removes it', async () => {
  const page = await demoPage()
  const root = () => page.host().shadowRoot
  press(root().querySelector('.card button.close'))
  assert.equal(root().querySelector('.card'), null, 'the card is gone')
  const bar = root().querySelector('.bar')
  assert.ok(bar, 'the pill took its place')
  assert.equal(bar.querySelector('button.open').textContent.trim(), 'Get this site built by AITRACY')
  press(bar.querySelector('button.open'))
  assert.equal(root().querySelector('.bar'), null, 'the pill is gone')
  assertCard(page.host())
  press(root().querySelector('.card button.close'))
  press(root().querySelector('.bar button.close'))
  assert.equal(page.host(), null, 'removed for this page load')
})

test('a demo tag without a usable template id still reads as a sentence', async () => {
  for (const tag of ['<script></script>', '<script data-template="../x"></script>']) {
    const page = await demoPage(savedBefore, tag)
    const title = page.host().shadowRoot.querySelector('.title').textContent
    assert.equal(title, 'Get this design as a finished site, not an empty CMS.', tag)
  }
})

test('a template id reads as its name: "ja" in capitals, every other word capitalised', async () => {
  const page = await demoPage(savedBefore, '<script data-template="ja-business-pro"></script>')
  assert.equal(
    page.host().shadowRoot.querySelector('.title').textContent,
    'Get JA Business Pro as a finished site, not an empty CMS.'
  )
})

test('the card wears the saved background, or the accent when the background is light', async () => {
  const cssOf = async (style) => {
    const page = await demoPage({ ...savedBefore, style: { ...savedBefore.style, ...style } })
    return page.host().shadowRoot.querySelector('style').textContent
  }
  assert.match(await cssOf({ bg: '#bf5b3d', accent: '#ffffff' }), /\.top\{[^}]*background:#bf5b3d/)
  assert.match(await cssOf({ bg: '#ffffff', accent: '#2255aa' }), /\.top\{[^}]*background:#2255aa/)
  assert.match(await cssOf({ bg: '#ffffff', accent: '#ffffff' }), /\.top\{[^}]*background:#bf5b3d/)
})

test('switched off in the setting, the demo shows nothing', async () => {
  const off = { ...savedBefore, doors: { ...savedBefore.doors, customize: { on: false, label: LABEL } } }
  const page = await demoPage(off)
  assert.equal(page.host(), null)
})

// ---------------------------------------------------------------------------------------------
// sarahxbt 05/10/2026: the banner shows only on a demo whose template Design inspiration offers.
// Measured that day on cowork.tracy.ai: 36 of the 61 JoomlArt demos carrying the tag had no card,
// and their button opened the gallery on nothing.

/** One `quickstart_releases` row as `readReleases` reads it. */
const releaseRow = (template, extra = {}) => ({
  tag: `quickstart/${template}/j6`,
  release: { name: `quickstart/${template}/j6`, kind: 'quickstart', github: 'published', assets: [] },
  setting: { platform: 'joomla', version: '1.0.0', template, label: template },
  inspiration: { blurb: 'A demo.' },
  inspiration_hidden: false,
  tracy: null,
  reason: null,
  fetched_at: null,
  ...extra
})
/** A database holding the saved advert and these releases; `releases: null` makes that read fail. */
const servingWith = (releases) =>
  badgeRoutes({
    config: { origin: 'https://cowork.tracy.test' },
    pool: {
      query: async (sql) => {
        if (/quickstart_releases/.test(sql)) {
          if (releases === null) throw new Error('relation "quickstart_releases" does not exist')
          return { rows: releases }
        }
        return {
          rows: [{ id: 'advert', setting: savedBefore, revision: 5, updated_by: 'a', updated_at: 'T' }]
        }
      }
    }
  })
const demoBanner = async (app, template) => {
  const script = await (
    await app.fetch(new Request('https://cowork.tracy.test/build-with-tracy-demo.js'))
  ).text()
  const tag = `<script src="https://cowork.tracy.ai/build-with-tracy-demo.js" data-template="${template}"></script>`
  return runOnPage(
    script,
    'build-with-tracy-demo',
    tag,
    pageAt(`https://${template}.demo.joomlart.com/`)
  ).host()
}

test('the demo banner shows only on a template Design inspiration offers', async () => {
  const app = servingWith([
    releaseRow('ja-kinetic'),
    releaseRow('ja-unpublished', { inspiration_hidden: true }),
    releaseRow('ja-draft', {
      release: { name: 'quickstart/ja-draft/j6', kind: 'quickstart', github: 'draft', assets: [] }
    })
  ])
  const shown = await demoBanner(app, 'ja-kinetic')
  assert.ok(shown, 'a template on the gallery keeps its banner')
  assertCard(shown)
  for (const template of ['ja-titan', 'ja-unpublished', 'ja-draft'])
    assert.equal(await demoBanner(app, template), null, `${template} has no card, so no banner`)
})

test('the demo banner keeps showing when the template list cannot be read', async () => {
  // An unreadable database must not take the banner off the demos that do have a card.
  for (const app of [servingWith(null), badgeRoutes({ config: { origin: 'https://cowork.tracy.test' } })])
    for (const template of ['ja-kinetic', 'ja-titan'])
      assert.ok(await demoBanner(app, template), `${template} shows, unfiltered`)
})

test('the list rides in the script; without one the script is unchanged', () => {
  assert.equal(buildWithTracyScript(DEFAULT_SETTING.advert), BUILD_WITH_TRACY_SCRIPT)
  assert.match(buildWithTracyScript(DEFAULT_SETTING.advert, ['ja-kinetic']), /var OFFERED = \["ja-kinetic"\]/)
  assert.match(BUILD_WITH_TRACY_SCRIPT, /var OFFERED = null/)
  assert.doesNotThrow(() => new Function(buildWithTracyScript(DEFAULT_SETTING.advert, ['a', '</script>'])))
})
