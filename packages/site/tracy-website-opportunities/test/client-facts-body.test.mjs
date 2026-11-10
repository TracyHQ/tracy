/**
 * The Business facts body of the Workspace card (#537, option B): two columns of facts in fixed slots (NA when not
 * found), one hero photo with its counts badge, no Open control of its own, one fixed height in every state.
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
        export { FactsBody, countsText } from './facts-body.tsx'
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

test('model: every fact present fills the fixed slots in order', () => {
  const v = view()
  assert.deepEqual(ids(v.left), ['name', 'address', 'hours', 'about'])
  assert.deepEqual(ids(v.right), ['phone', 'website', 'rating', 'followers'])
  assert.equal(v.left[1].value.text, FULL.address)
  assert.deepEqual(v.left[2].value.params, { from: '9:00 AM', to: '9:00 PM' })
  assert.equal(v.left[2].value.key, 'facts.body.hoursToday')
  assert.equal(v.left[3].value.title, FULL.bio)
  assert.deepEqual(v.right[1].value, { kind: 'link', url: CANDIDATE.website, host: 'example.test' })
  assert.equal(v.right[2].value.key, 'facts.body.ratingMany')
  assert.deepEqual(v.right[2].value.params, { rating: '5.0', count: '4' })
  assert.deepEqual(v.right[3].value.params, { count: '1,200' })
  assert.equal(v.hero.id, 'a')
  assert.deepEqual(v.counts, { photos: 2, videos: 1 })
})

test('model: hours on a closed day, and on no named day', () => {
  assert.equal(view({ today: 2 }).left[2].value.key, 'facts.body.hoursTodayText')
  const joined = lib.hoursSummary(['Every day 9 to 5'], 3)
  assert.equal(joined.kind, 'text')
  assert.equal(lib.hoursSummary([], 3), null)
})

test('model: sparse facts keep their slots, the listing fills what it knows', () => {
  const v = view({ profile: { phone: '+1 555 0100' }, candidate: { address: 'Listing address' } })
  assert.deepEqual(ids(v.left), ['name', 'address', 'hours', 'about'])
  assert.equal(v.left[1].value.text, 'Listing address')
  assert.equal(v.left[2].value, null)
  assert.equal(v.right[1].value, null)
  assert.equal(v.right[2].value, null)
  assert.equal(v.right[3].id, 'spare')
  assert.equal(v.right[3].labelKey, null)
})

test('model: nothing known reads NA in every slot and the hero is null', () => {
  const v = view({ profile: null, candidate: {}, name: null, media: media([]) })
  assert.ok([...v.left, ...v.right].every((f) => f.value === null))
  assert.equal(v.left.length, 4)
  assert.equal(v.right.length, 4)
  assert.equal(v.hero, null)
  assert.deepEqual(v.counts, { photos: 0, videos: 0 })
})

test('markup: two columns at most, the badge, and no Open control for the photos', () => {
  const html = draw(view())
  assert.equal(html.match(/class="tracy-wo-fb-col"/g).length, 2)
  assert.ok(html.includes('class="tracy-wo-fb-hero"'))
  assert.ok(html.includes('src="'))
  assert.match(html, /class="tracy-wo-fb-badge">.*\[facts\.body\.counts/)
  assert.equal(
    lib.countsText((key, params) => lib.en[key].replace(/\{(\w+)\}/g, (_, k) => String(params[k])), {
      photos: 25,
      videos: 10
    }),
    '25 photos · 10 videos'
  )
  assert.ok(!html.includes('media.strip.open'))
  assert.ok(!html.includes('section.openNamed'))
  assert.equal(html.match(/<button/g).length, 1, 'the hero is the only control')
  assert.ok(html.includes('aria-label="[facts.body.openPhotos]"'))
})

test('markup: NA in muted slots, no photos keeps the box', () => {
  const html = draw(view({ profile: null, candidate: {}, name: null, media: media([]) }))
  assert.equal(html.match(/data-na=""/g).length, 7, 'seven labelled slots, one reserved')
  assert.ok(html.includes('[facts.body.na]'))
  assert.ok(html.includes('class="tracy-wo-fb-nophoto"'))
  assert.ok(html.includes('[facts.body.noPhotos]'))
  assert.ok(!html.includes('<button'))
})

test('markup: while research runs a missing fact reads Collecting', () => {
  const html = draw(view({ profile: null, candidate: {}, running: true, media: media([]) }))
  assert.ok(html.includes('[profile.collecting]'))
  assert.ok(!html.includes('[facts.body.na]'))
})

test('strings: every key the body uses exists, English only, no long dashes', () => {
  const keys = Object.keys(lib.en).filter((k) => k.startsWith('facts.body.'))
  assert.ok(keys.length >= 20)
  for (const k of keys) assert.ok(!LONG_DASHES.some((d) => lib.en[k].includes(d)), k)
  for (const k of [
    'field.name',
    'field.address',
    'field.bio',
    'field.phone',
    'field.website',
    'profile.collecting'
  ])
    assert.ok(lib.en[k], k)
  assert.equal(lib.en['facts.body.na'], 'NA')
})

test('css: fixed height, overflow hidden, two-column facts, never three', () => {
  const css = lib.FACTS_BODY_CSS
  assert.match(css, /--tracy-wo-fb-height: 192px/)
  assert.match(css, /--tracy-wo-fb-height: 340px/)
  assert.match(css, /height: var\(--tracy-wo-fb-height\); overflow: hidden;/)
  assert.match(css, /\.tracy-wo-fb-facts \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(css, /repeat\(3,/)
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tokens only')
  assert.doesNotMatch(css, /box-shadow/)
  assert.doesNotMatch(css, /`/)
  assert.ok(lib.WORKSPACE_CSS.includes(css), 'the Workspace stylesheet carries it')
})
