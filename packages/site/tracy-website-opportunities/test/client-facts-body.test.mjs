/**
 * The Business facts body of the Workspace card (#537, option F): two groups of facts (Business, Contact) with an About line
 * (NA when not found), a 3 by 2 photo mosaic (+N on the sixth), no Open control of its own, one fixed height.
 * Bundles the real model and component with React 18 (the one dsh's page runs) and renders them to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-facts-body.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-facts-body-'))
  const outfile = path.join(outDir, 'facts-body.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { FactsBody } from './facts-body.tsx'
        export { FactsMosaic, countsText } from './facts-body-mosaic.tsx'
        export { factsBodyView, hoursSummary } from './facts-body-model.ts'
        export { mediaRowView, mediaTile } from './detail-model.ts'
        export { FACTS_BODY_CSS } from './facts-body-css.ts'
        export { WORKSPACE_CSS } from './workspace-css.ts'
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

/** An en dash and an em dash, by code point so this file holds neither. */
const DASH = String.fromCharCode(0x2013)
const LONG_DASHES = [DASH, String.fromCharCode(0x2014)]
const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const tile = (id, extra = {}) => lib.mediaTile({ id, kind: 'image', category: 'space', ...extra })
const media = (tiles = []) => lib.mediaRowView({ profile: null, media: tiles, sources: [] })

const FULL = {
  name: 'Harbor Padel Club',
  address: '12 Example Street, Sample Bay, Testland',
  phone: '+1 555 0100',
  bio: 'A padel club.\nCoaching for every level.',
  hoursCheck: {
    state: 'agreed',
    hours: [`Monday: 9:00 AM ${DASH} 9:00 PM`, 'Tuesday: Closed']
  },
  googleRating: { state: 'shown', score: 5, reviews: 4 },
  socialStats: { instagram: { url: 'https://instagram.com/example', followers: 1200 } }
}
const CANDIDATE = { website: 'https://www.example.test/home', address: 'Listing address' }
const view = (over = {}) =>
  lib.factsBodyView({
    profile: FULL,
    candidate: CANDIDATE,
    name: 'Harbor Padel Club',
    media: media([tile('a'), tile('b'), lib.mediaTile({ id: 'v', kind: 'video' })]),
    running: false,
    today: 1,
    locale: 'en',
    ...over
  })
const draw = (v) =>
  lib.renderToStaticMarkup(lib.createElement(lib.FactsBody, { t, view: v, onOpen: () => {} }))
const ids = (facts) => facts.map((f) => f.id)

test('model: every fact present fills the two groups and the About line in order', () => {
  const v = view()
  assert.deepEqual(ids(v.business), ['name', 'hours', 'rating'])
  assert.deepEqual(ids(v.contact), ['phone', 'website', 'address'])
  assert.equal(v.about.id, 'about')
  assert.equal(v.contact[2].value.text, FULL.address)
  assert.deepEqual(v.business[1].value.params, { from: '9:00 AM', to: '9:00 PM' })
  assert.equal(v.business[1].value.key, 'facts.body.hoursToday')
  assert.equal(v.about.value.title, FULL.bio)
  assert.equal(v.about.value.text, 'A padel club. Coaching for every level.')
  assert.deepEqual(v.contact[1].value, { kind: 'link', url: CANDIDATE.website, host: 'example.test' })
  assert.equal(v.business[2].value.key, 'facts.body.ratingMany')
  assert.deepEqual(v.business[2].value.params, { rating: '5.0', count: '4' })
  assert.equal(v.followers.value.text, '1,200')
  assert.deepEqual(
    v.tiles.map((x) => x.id),
    ['a', 'b', 'v']
  )
  assert.equal(v.total, 3)
  assert.deepEqual(v.counts, { photos: 2, videos: 1 })
})

test('model: hours on a closed day, and on no named day', () => {
  assert.equal(view({ today: 2 }).business[1].value.key, 'facts.body.hoursTodayText')
  const joined = lib.hoursSummary(['Every day 9 to 5'], 3)
  assert.equal(joined.kind, 'text')
  assert.equal(lib.hoursSummary([], 3), null)
})

test('model: sparse facts keep their places, the listing fills what it knows, no followers', () => {
  const v = view({ profile: { phone: '+1 555 0100' }, candidate: { address: 'Listing address' } })
  assert.deepEqual(ids(v.business), ['name', 'hours', 'rating'])
  assert.deepEqual(ids(v.contact), ['phone', 'website', 'address'])
  assert.equal(v.contact[2].value.text, 'Listing address')
  assert.equal(v.business[1].value, null)
  assert.equal(v.contact[1].value, null)
  assert.equal(v.business[2].value, null)
  assert.equal(v.followers, null)
})

test('model: nothing known reads NA in every fact and there are no tiles', () => {
  const v = view({ profile: null, candidate: {}, name: null, media: media([]) })
  assert.ok([...v.business, ...v.contact, v.about].every((f) => f.value === null))
  assert.equal(v.business.length, 3)
  assert.equal(v.contact.length, 3)
  assert.deepEqual(v.tiles, [])
  assert.equal(v.total, 0)
  assert.deepEqual(v.counts, { photos: 0, videos: 0 })
})

const many = (n) => media(Array.from({ length: n }, (_, i) => tile(`p${i}`)))
const clicked = (v) => {
  const calls = []
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.FactsBody, { t, view: v, onOpen: () => calls.push('profile') })
  )
  return { html, calls }
}

test('markup: two labelled groups, an About line, six mosaic tiles, no hero and no Open control', () => {
  const html = draw(view())
  assert.equal(html.match(/class="tracy-wo-fb-group"/g).length, 2)
  assert.ok(html.indexOf('[facts.body.groupBusiness]') < html.indexOf('[facts.body.groupContact]'))
  const business = html.slice(html.indexOf('groupBusiness'), html.indexOf('groupContact'))
  for (const f of ['name', 'hours', 'rating']) assert.ok(business.includes(`data-fact="${f}"`), f)
  const contact = html.slice(html.indexOf('groupContact'), html.indexOf('data-fact="about"'))
  for (const f of ['phone', 'website', 'address']) assert.ok(contact.includes(`data-fact="${f}"`), f)
  assert.ok(!contact.includes('data-fact="name"'))
  const about = html.slice(html.indexOf('data-fact="about"'), html.indexOf('tracy-wo-fb-strip'))
  assert.match(about, /title="A padel club\.\nCoaching for every level\."/)
  assert.ok(
    html.indexOf('data-fact="about"') > html.indexOf('data-fact="address"'),
    'About sits under both groups'
  )
  assert.equal(html.match(/tracy-wo-fb-tile/g).length, 6, 'six slots, three filled and three empty')
  assert.ok(!html.includes('hero'))
  assert.ok(html.includes('data-kind="video"'), 'a video shows as a neutral tile with a play glyph')
  assert.ok(html.includes('class="tracy-wo-fb-strip" role="group" aria-label="[facts.body.counts'))
  assert.equal(
    lib.countsText((key, params) => lib.en[key].replace(/\{(\w+)\}/g, (_, k) => String(params[k])), {
      photos: 25,
      videos: 10
    }),
    '25 photos \u00b7 10 videos'
  )
  assert.ok(!html.includes('section.openNamed'))
  assert.ok(html.includes('aria-label="[facts.body.openPhotos]"'))
})

test('markup: 35 items render six tiles and only the sixth carries +N for the rest', () => {
  const v = view({ media: many(35) })
  assert.equal(v.tiles.length, 6)
  assert.equal(v.total, 35)
  const html = draw(v)
  assert.equal(html.match(/<button/g).length, 6)
  assert.equal(html.match(/class="tracy-wo-fb-more"/g).length, 1)
  assert.match(html, /data-i="6"[^>]*>.*<span class="tracy-wo-fb-more"[^>]*>\+29<\/span>/)
  assert.ok(html.includes('title="[facts.body.moreMedia{&quot;count&quot;:29}]"'))
})

test('markup: six items or fewer never dim a tile', () => {
  for (const n of [3, 6]) {
    const html = draw(view({ media: many(n) }))
    assert.equal(html.match(/<button/g).length, n)
    assert.ok(!html.includes('tracy-wo-fb-more'), `${n} items: no overlay`)
  }
  assert.equal(draw(view({ media: many(7) })).match(/>\+1</g).length, 1)
})

test('markup: fewer than six items keep six slots; empty slots keep the mosaic shape', () => {
  const one = draw(view({ media: many(1) }))
  assert.ok(!one.includes('tracy-wo-fb-more'))
  assert.equal(one.match(/data-empty=""/g).length, 5)
  assert.equal(one.match(/<button/g).length, 1)
})

test('markup: a press on any tile opens the Business facts page', () => {
  const v = view({ media: many(3) })
  const { html } = clicked(v)
  assert.equal(html.match(/onClick/g), null, 'static markup holds no handler; the element is a button')
  const el = lib.FactsMosaic({ t, view: v, onOpen: () => calls.push('profile') })
  const calls = []
  const buttons = []
  const walk = (n) => {
    if (n === null || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'button') buttons.push(n)
    walk(n.props?.children)
  }
  walk(el)
  assert.equal(buttons.length, 3)
  for (const b of buttons) b.props.onClick()
  assert.deepEqual(calls, ['profile', 'profile', 'profile'])
})

test('markup: NA in muted slots, no photos keeps the box', () => {
  const html = draw(view({ profile: null, candidate: {}, name: null, media: media([]) }))
  assert.equal(html.match(/data-na=""/g).length, 7, 'six facts and the About line')
  assert.ok(html.includes('[facts.body.na]'))
  assert.ok(html.includes('class="tracy-wo-fb-nophoto"'))
  assert.ok(html.includes('[facts.body.noPhotos]'))
  assert.ok(!html.includes('<button'))
  assert.ok(!html.includes('tracy-wo-fb-strip'))
})

test('markup: while research runs a missing fact reads Collecting', () => {
  const html = draw(view({ profile: null, candidate: {}, running: true, media: media([]) }))
  assert.ok(html.includes('[profile.collecting]'))
  assert.ok(!html.includes('[facts.body.na]'))
})

test('strings: every key the body uses exists, English only, no long dashes', () => {
  const keys = Object.keys(lib.en).filter((k) => k.startsWith('facts.body.'))
  assert.ok(keys.length >= 17)
  for (const k of keys) assert.ok(!LONG_DASHES.some((d) => lib.en[k].includes(d)), k)
  for (const k of [
    'field.name',
    'field.address',
    'field.bio',
    'field.phone',
    'field.website',
    'profile.collecting',
    'pp.stat.followers'
  ])
    assert.ok(lib.en[k], k)
  assert.equal(lib.en['facts.body.na'], 'N/A')
})

test('css: the profile section is the container, and the mosaic stacks below side-by-side room', () => {
  const css = lib.FACTS_BODY_CSS
  assert.match(
    css,
    /data-section='profile'\]:has\(> \.tracy-wo-ws-body > \.tracy-wo-fb\) \{ container: wofb \/ inline-size; \}/
  )
  assert.match(css, /@container wofb \(max-width: 639px\)/)
  const stacked = css.slice(css.indexOf('@container wofb (max-width: 639px)'))
  assert.match(stacked, /--tracy-wo-fb-height: calc\(var\(--tracy-wo-fb-c\) \+ 12px \+ 56px \+ 26px\)/)
  assert.match(stacked, /\.tracy-wo-fb \{ grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(
    stacked,
    /\.tracy-wo-fb-strip \{ grid-template-columns: repeat\(6, 56px\); grid-template-rows: 56px; \}/
  )
})

test('css: fixed height, overflow hidden, two groups, a 3 by 2 mosaic as tall as the facts block', () => {
  const css = lib.FACTS_BODY_CSS
  assert.match(css, /--tracy-wo-fb-c: 117px/)
  assert.match(css, /height: var\(--tracy-wo-fb-height\); overflow: hidden;/)
  assert.match(css, /\.tracy-wo-fb-groups \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.tracy-wo-fb-gt \{[^}]*font-size: 11px[^}]*text-transform: uppercase/)
  assert.match(css, /\.tracy-wo-fb-facts \{[^}]*height: var\(--tracy-wo-fb-c\)/)
  assert.match(
    css,
    /\.tracy-wo-fb-strip \{[^}]*repeat\(3, var\(--tracy-wo-fb-tile\)\)[^}]*repeat\(2, var\(--tracy-wo-fb-tile\)\)/
  )
  assert.match(css, /--tracy-wo-fb-tile: calc\(\(var\(--tracy-wo-fb-c\) - var\(--tracy-wo-fb-gap\)\) \/ 2\)/)
  assert.match(css, /\.tracy-wo-fb-more \{[^}]*color-mix\(in oklab, var\(--background\) 55%/)
  assert.doesNotMatch(css, /tracy-wo-fb-hero/)
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tokens only')
  assert.doesNotMatch(css, /box-shadow/)
  assert.doesNotMatch(css, /`/)
  assert.ok(lib.WORKSPACE_CSS.includes(css), 'the Workspace stylesheet carries it')
})

test('markup: a fact kept off the site shows its value dimmed, never N/A', () => {
  const v = view()
  const off = { ...v, business: v.business.map((f) => (f.id === 'hours' ? { ...f, off: true } : f)) }
  const html = draw(off)
  const hours = html.slice(html.indexOf('data-fact="hours"'), html.indexOf('data-fact="rating"'))
  assert.match(hours, /data-off=""/)
  assert.match(hours, /facts\.body\.hoursToday/)
  assert.doesNotMatch(hours, /facts\.body\.na|data-na/)
  assert.match(lib.FACTS_BODY_CSS, /\.tracy-wo-fb-fact\[data-off\] > \.tracy-wo-fb-v \{ opacity: 0\.5; \}/)
})

test('model: the followers slot reads Followers and the whole count', () => {
  const f = view().followers
  assert.equal(f.labelKey, 'pp.stat.followers')
  assert.equal(f.value.text, '1,200')
})
