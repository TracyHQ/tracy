/**
 * Save listing and Publish are two presses (Akemi, 10/10/2026): Save listing stores it hidden,
 * Publish shows a listing already saved and stays off while any release it would press still waits
 * for a step of its road to live.
 *
 * What is pinned here, without a server: the Templates rows (`templates-model.ts`) count what is
 * left on each release's `road` (the server's, `apps/tracy-web/src/lib/road-to-live.js`) as issues
 * and warnings by tab, and the header Publish is held by exactly the releases whose Published step
 * waits; and each press (`card-press.ts`) calls its own door: Save the PUT with the form, Publish
 * the POST with no card, Unpublish the DELETE. The server half is
 * `apps/tracy-web/test/ops-quickstarts.test.mjs`.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))

let mod
const realFetch = globalThis.fetch

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { templateRows, templatePublishBlockers, releasePublishBlockers, NO_LISTING } from './cms/templates-model'
        export { pressCard } from './cms/card-press'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  const code = built.outputFiles[0].text
  mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
})

afterEach(() => {
  globalThis.fetch = realFetch
})

/** One road step, as the server sends it. */
const step = (name, state, code, params = {}, blockedBy) => ({
  step: name,
  state,
  code,
  params,
  ...(blockedBy ? { blockedBy } : {})
})

/** A whole road, every step done, with `over` replacing the steps it names. */
const road = (over = {}) =>
  [
    step('release', 'done', 'release-published'),
    step('install-file', 'done', 'install-file-ready'),
    step('contract', 'done', 'contract-exact'),
    step('demo', 'done', 'demo-live'),
    step('listing', 'done', 'listing-saved', { hidden: true }),
    step('published', 'todo', 'ready-to-publish'),
    step('polish', 'done', 'polish-done')
  ].map((s) => over[s.step] ?? s)

const release = (inspiration, over = {}) => ({
  tag: 'tracy-business/emdash-0.x',
  name: 'Tracy Business',
  label: 'Tracy Business',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  reason: null,
  choosable: true,
  platform: 'emdash',
  version: '1.0.0',
  template: 'tracy-business',
  inspiration,
  road: road(),
  ...over
})
const NONE = { inspiration: { shown: [], notShown: [], noCard: [] } }
const HIDDEN = {
  state: 'card',
  code: 'unpublished',
  why: 'Saved but hidden from Design templates',
  warnings: []
}
const NO_CARD_CELL = { state: 'none', why: null, warnings: [] }

/** ja-restaurant on dev, 11/10/2026: release ok, demo failed, no listing, no contract. */
const JA_RESTAURANT = road({
  demo: step('demo', 'todo', 'demo-failed', {
    reason: null,
    step: 'provision',
    version: '1.0.0',
    releaseVersion: '1.0.2'
  }),
  listing: step('listing', 'todo', 'no-listing', { demo: false }),
  contract: step('contract', 'todo', 'no-contract', {
    slug: 'ja-restaurant',
    version: '1.0.2',
    path: 'direct',
    batchInScope: false
  }),
  published: step('published', 'blocked', 'not-published', { waiting: ['contract', 'listing'] }, 'listing')
})

test('ja-restaurant: the contract, the failed demo and the listing are the issues, in road order', () => {
  const [row] = mod.templateRows(
    [release(NO_CARD_CELL, { tag: 'quickstart/ja-restaurant/j6', platform: 'joomla', road: JA_RESTAURANT })],
    NONE.inspiration
  )
  assert.equal(row.active, false)
  assert.equal(row.hasListing, false)
  assert.deepEqual(row.issues, ['No content contract', 'Demo install failed', 'No listing yet'])
  // The demo and the listing are fixed on Design Inspiration, the contract on Quickstart settings.
  assert.deepEqual(row.problems.card, { issues: 2, warnings: 0 })
  assert.deepEqual(row.problems.settings, { issues: 1, warnings: 0 })
  // Publish needs BOTH, in road order: the content contract and the listing.
  assert.deepEqual(mod.templatePublishBlockers(row.releases), ['Content contract', 'Listing'])
})

test('a saved hidden listing ready to publish: no issue, and Publish is free', () => {
  const [row] = mod.templateRows([release(HIDDEN)], NONE.inspiration)
  assert.equal(row.hasListing, true)
  assert.deepEqual(row.issues, [], 'ready to publish is the next press, not a problem')
  assert.deepEqual(mod.templatePublishBlockers(row.releases), [])
})

test('warnings: a lower contract and each polish item count once, on their own tab', () => {
  const [row] = mod.templateRows(
    [
      release(HIDDEN, {
        road: road({
          contract: step('contract', 'warn', 'contract-lower', { profile: 'p/1.0.0', version: '1.0.1' }),
          polish: step('polish', 'warn', 'polish', {
            items: [
              { code: 'no-blurb', params: {} },
              { code: 'no-pages-file', params: {} }
            ]
          })
        })
      })
    ],
    NONE.inspiration
  )
  assert.deepEqual(row.issues, [])
  assert.equal(row.warnings.length, 3)
  assert.deepEqual(row.problems.card, { issues: 0, warnings: 2 })
  assert.deepEqual(row.problems.settings, { issues: 0, warnings: 1 })
})

test('several CMS releases: each line names its CMS, and Publish names the release that waits', () => {
  const [row] = mod.templateRows(
    [
      release(HIDDEN, { tag: 'tracy-business/j6', platform: 'joomla' }),
      release(NO_CARD_CELL, {
        tag: 'tracy-business/wp7',
        platform: 'wordpress',
        road: road({
          listing: step('listing', 'todo', 'no-listing'),
          published: step('published', 'blocked', 'not-published', {}, 'listing')
        })
      })
    ],
    NONE.inspiration
  )
  assert.deepEqual(row.issues, ['WordPress: No listing yet'])
  assert.deepEqual(mod.templatePublishBlockers(row.releases), ['Listing (WordPress)'])
})

test('a saved listing the door would still not show says why (NOT_SHOWABLE)', () => {
  const why = 'Tracy cannot start a site from this release, so its card is not offered.'
  const r = release(HIDDEN, { road: road({ published: step('published', 'todo', 'not-showable', { why }) }) })
  // The need names the step; its row on the Road to live says why.
  assert.deepEqual(mod.releasePublishBlockers(r), ['It would stay hidden'])
  const [row] = mod.templateRows([r], NONE.inspiration)
  assert.deepEqual(row.issues, ['It would stay hidden'])
})

const shownAs = (id) => ({
  shown: [
    { id, label: 'Tracy Business', card: { image: null, category: null }, platforms: [], warnings: [] }
  ],
  notShown: [],
  noCard: []
})

test('a release customers already see only warns about what is left on it', () => {
  const [row] = mod.templateRows(
    [
      release(
        { state: 'on', why: null, warnings: [] },
        {
          road: road({
            demo: step('demo', 'todo', 'no-demo'),
            published: step('published', 'done', 'published')
          })
        }
      )
    ],
    shownAs('tracy-business')
  )
  assert.equal(row.active, true)
  assert.deepEqual(row.issues, [])
  assert.deepEqual(row.warnings, ['No demo on this server'])
})

test('a design pack has no road, so no issues and nothing to publish', () => {
  const pack = release(
    {
      state: 'n/a',
      why: 'A design pack is not offered on Design templates',
      code: 'refused',
      warnings: []
    },
    { tag: 'tracy-airbnb/j6', platform: 'joomla', kind: 'design-pack', tracy: 'no-setting', road: null }
  )
  const [row] = mod.templateRows([pack], NONE.inspiration)
  assert.equal(row.designPack, true)
  assert.deepEqual(row.issues, [])
  assert.deepEqual(row.warnings, [])
})

/** Records every request and answers each with `answer`. */
function stubFetch(answer = { ok: true }) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body })
    return new Response(JSON.stringify(answer), {
      status: answer.ok ? 200 : 400,
      headers: { 'content-type': 'application/json' }
    })
  }
  return calls
}

test('Save card sends the form to the PUT door', async () => {
  const calls = stubFetch({ ok: true, hidden: true })
  const done = await mod.pressCard('a/b', 'save', { blurb: 'x' })
  assert.equal(done.ok, true)
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [['PUT', '/api/ops/quickstart/inspiration?tag=a%2Fb']]
  )
  assert.equal(JSON.parse(calls[0].body).blurb, 'x')
})

test('Publish calls the publish door and sends no card', async () => {
  const calls = stubFetch({ ok: true, warnings: [{ text: 'Lower contract' }] })
  const done = await mod.pressCard('a/b', 'publish')
  assert.deepEqual(done, { ok: true, warnings: ['Lower contract'] })
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [['POST', '/api/ops/quickstart/inspiration/publish?tag=a%2Fb']]
  )
  assert.deepEqual(JSON.parse(calls[0].body), {})
})

test('a Publish the server refuses prints its reason, and says nothing was written', async () => {
  stubFetch({ error: 'NO_CARD', reason: 'Save a card first: this release carries none.' })
  const done = await mod.pressCard('a/b', 'publish')
  assert.deepEqual(done, { ok: false, error: 'Save a card first: this release carries none.' })
})

test('Unpublish calls the DELETE door with no body', async () => {
  const calls = stubFetch({ ok: true, hidden: true })
  assert.equal((await mod.pressCard('a/b', 'unpublish')).ok, true)
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.body]),
    [['DELETE', '/api/ops/quickstart/inspiration?tag=a%2Fb', undefined]]
  )
})
