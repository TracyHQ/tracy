/**
 * The Demo site block on Details (#515): one primary button whose label follows the demo state, a menu for the rest,
 * and one plain line. A failed demo always says where it stopped and why, never the raw code. Bundles the real
 * component with React 18 and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-demo-block.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-demo-block-'))
  const outfile = path.join(outDir, 'demo-block.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { DemoSiteBlock } from './demo-site-block.tsx'
        export { demoBlockView, demoCommand, siteCardView } from './demo-block-model.ts'
        export { fallbackStyle } from './site-card.tsx'
        export { en } from './strings.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params = {}) => {
  const text = lib.en[key]
  if (text === undefined) throw new Error(`missing string ${key}`)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}
const NOW = Date.parse('2026-11-09T12:00:00Z')
const days = (n) => new Date(NOW + n * 86_400_000).toISOString()
const demo = (extra = {}) => ({
  siteKey: 'blue-cove-sailing',
  url: 'https://blue-cove-sailing.example.test/',
  expiresAt: days(14),
  frozenAt: null,
  deletedAt: null,
  qa: null,
  build: { status: 'done', startedAt: days(-1) },
  ...extra
})
const row = (extra) => ({ id: 'opp-1', name: 'Blue Cove Sailing', stage: 'demo', ...extra })

const ROWS = {
  none: row({}),
  queued: row({ demoAction: { id: 'a1', state: 'queued', step: 'brief' } }),
  building: row({
    demoAction: { id: 'a1', state: 'running', step: 'build' },
    demo: demo({ build: { status: 'building', startedAt: days(0) } })
  }),
  ready: row({ stage: 'outreach', demo: demo() }),
  failed: row({ demoAction: { id: 'a1', state: 'failed', step: 'kit', error: 'DEMO_STEP_TIMEOUT' } }),
  failedUnknown: row({ demoAction: { id: 'a1', state: 'failed', step: 'write', error: 'SOMETHING_NEW_42' } }),
  frozen: row({ demo: demo({ expiresAt: days(-3), frozenAt: days(-3) }) }),
  deleted: row({ demo: demo({ expiresAt: days(-10), frozenAt: days(-10), deletedAt: days(-2) }) })
}
const view = (name) => lib.demoBlockView(ROWS[name], null, t, { now: NOW, locale: 'en' })

test('every demo state has its one primary button, its menu and its line', () => {
  const table = Object.keys(ROWS).map((name) => {
    const v = view(name)
    return [name, v.state, v.primary.label, v.primary.disabled, v.menu.map((m) => m.label), v.line]
  })
  assert.deepEqual(table, [
    ['none', 'none', 'Build demo', false, [], null],
    ['queued', 'queued', 'Building', true, [], null],
    ['building', 'building', 'Building', true, [], null],
    [
      'ready',
      'ready',
      'Open demo',
      false,
      ['Send demo', 'Rebuild'],
      'Ready · blue-cove-sailing · 14 days left'
    ],
    [
      'failed',
      'failed',
      'Build again',
      false,
      [],
      'Stopped at reading the template: The demo took longer than two hours, so Tracy stopped it.'
    ],
    [
      'failedUnknown',
      'failed',
      'Build again',
      false,
      [],
      'Stopped at writing the site: The demo stopped on an unexpected error.'
    ],
    ['frozen', 'expired', 'Build again', false, [], 'Demo expired on Nov 6, 2026'],
    ['deleted', 'expired', 'Build again', false, [], 'Demo expired on Oct 30, 2026']
  ])
})

test('each press goes to the door that does it', () => {
  assert.deepEqual(lib.demoCommand('primary', ROWS.none, null), { kind: 'action', action: 'build' })
  assert.deepEqual(lib.demoCommand('primary', ROWS.failed, null), { kind: 'action', action: 'retry-demo' })
  assert.deepEqual(lib.demoCommand('primary', ROWS.ready, null), {
    kind: 'open',
    href: 'https://blue-cove-sailing.example.test/'
  })
  assert.deepEqual(lib.demoCommand('primary', ROWS.frozen, null), { kind: 'press', press: 'reopen' })
  assert.deepEqual(lib.demoCommand('primary', ROWS.deleted, null), { kind: 'press', press: 'rebuild' })
  assert.equal(lib.demoCommand('primary', ROWS.building, null), null)
  assert.deepEqual(lib.demoCommand('send', ROWS.ready, null), { kind: 'action', action: 'send-demo' })
  assert.deepEqual(lib.demoCommand('rebuild', ROWS.ready, null), { kind: 'action', action: 'build' })
})

/** A disabled button whose text holds `label`. */
const disabledButton = (label) => new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${label}`)

const draw = (name, extra = {}) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.DemoSiteBlock, {
      t,
      row: ROWS[name],
      detail: null,
      locale: 'en',
      now: NOW,
      busy: false,
      onCommand: () => {},
      ...extra
    })
  )

test('the block draws the line and Open demo, never a raw code, an old control or the stepper press', () => {
  const failed = draw('failedUnknown')
  assert.match(failed, /Stopped at writing the site: The demo stopped on an unexpected error\./)
  assert.doesNotMatch(failed, /SOMETHING_NEW_42/)
  for (const name of Object.keys(ROWS)) {
    const html = draw(name)
    for (const old of ['Try again', '>Retry<', '>Reopen<', '>Extend<', 'Review demo', 'Research again'])
      assert.equal(html.includes(old), false, `${name} draws ${old}`)
    // Build demo, Build again and Building are the stepper's one action (mock r6-a), never a second button here.
    for (const press of ['Build demo', 'Build again', 'Building'])
      assert.doesNotMatch(html, new RegExp(`<button[^>]*>(?:<[^>]+>)*${press}<`), `${name} draws ${press}`)
  }
  assert.match(draw('ready'), />Open site</)
  assert.match(draw('ready'), /aria-label="More demo actions"/)
  assert.doesNotMatch(draw('none'), /More demo actions/, 'no menu when it would be empty')
})

test('the build limit leaves Open site pressable', () => {
  assert.doesNotMatch(draw('ready', { limitReached: true }), disabledButton('Open site'))
})

/** The Details answer of a built demo with the Your site card facts (#537, option A). */
const detailOf = (extra = {}) => ({
  demo: {
    ...demo(),
    qa: 'passed',
    built: { at: '2026-11-09T10:42:00Z', minutes: 26.2, usd: 1.84 },
    findings: [],
    preview: { url: '/api/website-opportunities/opp-1/demo/preview?v=1', capturedAt: '2026-11-09T10:43:00Z' },
    ...extra
  }
})
const card = (extra) =>
  lib.siteCardView(row({ stage: 'outreach', demo: { ...demo(), ...extra } }), detailOf(extra), t, {
    now: NOW,
    locale: 'en'
  })

test('a built demo reads its address, QA, build facts, expiry and picture', () => {
  const v = card({ qa: 'passed' })
  assert.equal(v.host, 'blue-cove-sailing.example.test')
  assert.equal(v.href, 'https://blue-cove-sailing.example.test/')
  assert.equal(v.qa, 'passed')
  assert.match(v.builtLine, /^Built Nov 9, \d{2}:\d{2}( [AP]M)? · 26 min · \$1\.84$/)
  assert.equal(v.expiryLine, 'Expires in 14 days (Nov 23, 2026)')
  assert.equal(v.preview, '/api/website-opportunities/opp-1/demo/preview?v=1')
  assert.deepEqual(v.findings, [])
  // Unknown facts are left off, never made up.
  const bare = lib.siteCardView(ROWS.ready, null, t, { now: NOW, locale: 'en' })
  assert.equal(bare.builtLine, null)
  assert.equal(bare.preview, null)
  assert.equal(bare.qa, 'none')
})

test('QA needing review lists each failing check as one plain sentence, never its code', () => {
  const v = card({
    qa: 'needs-review',
    findings: ['cta-real', 'no-demo-pictures', 'brand-new-1', 'brand-new-2']
  })
  assert.equal(v.qa, 'review')
  assert.deepEqual(v.findings, [
    'A button or contact link does not lead anywhere real.',
    'Some photos are still the template photos.',
    'Another check needs a look.'
  ])
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.DemoSiteBlock, {
      t,
      row: row({ stage: 'outreach', demo: { ...demo(), qa: 'needs-review' } }),
      detail: detailOf({ qa: 'needs-review', findings: ['cta-real'] }),
      locale: 'en',
      now: NOW,
      busy: false,
      onCommand: () => {}
    })
  )
  assert.match(html, /Needs review/)
  assert.match(html, /1 finding to check before you send it/)
  assert.doesNotMatch(html, /cta-real/)
})

test('the card draws the picture, else the site name on its brand colour, and the four actions', () => {
  const props = {
    t,
    row: row({ stage: 'outreach', demo: demo({ qa: 'passed' }) }),
    locale: 'en',
    now: NOW,
    busy: false,
    onCommand: () => {},
    siteName: 'Blue Cove Sailing'
  }
  const withPicture = lib.renderToStaticMarkup(
    lib.createElement(lib.DemoSiteBlock, { ...props, detail: detailOf() })
  )
  assert.match(withPicture, /<img[^>]*src="\/api\/website-opportunities\/opp-1\/demo\/preview\?v=1"/)
  assert.match(withPicture, /alt="Home page of Blue Cove Sailing"/)
  for (const label of ['Open site', 'Copy link', 'Send to the business', 'Ready · Checked'])
    assert.ok(withPicture.includes(label), label)
  const fallback = lib.renderToStaticMarkup(
    lib.createElement(lib.DemoSiteBlock, { ...props, detail: detailOf({ preview: null }), brand: '#2a6f5b' })
  )
  assert.doesNotMatch(fallback, /<img/)
  assert.match(fallback, /data-fallback=""[^>]*style="background:#2a6f5b/)
  assert.match(fallback, />Blue Cove Sailing</)
  assert.deepEqual(lib.fallbackStyle(null), undefined)
  assert.match(lib.fallbackStyle('#f5e6a8').color, /black/)
  assert.match(lib.fallbackStyle('#1d3557').color, /white/)
})
