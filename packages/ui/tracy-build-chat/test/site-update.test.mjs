// The site update card in the site chat (#612, `src/client/SiteUpdate.tsx`, `src/client/site-build-source.ts`): once
// the plan changed after the build, the owner updates the site from it; while the update runs its partial task list
// shows; once it ended the card says the server's sentence and offers restore or undo; a held file is always shown.
// The source half talks to a fake build door; the card is rendered with `react-dom/server` (resolved from
// `@tracy/core`, which declares it). Every value here is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/site-update.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const corePkg = path.resolve(root, '..', '..', 'core', 'tracy-core')
let out
let lib
before(async () => {
  const esbuild = require('esbuild')
  out = mkdtempSync(path.join(tmpdir(), 'site-update-'))
  const outfile = path.join(out, 'site-update.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { SiteUpdate } from './SiteUpdate'
        export { createSiteBuildSource } from './site-build-source'
        export { english, en } from './strings'
        export const card = (props) => renderToStaticMarkup(createElement(SiteUpdate, props))`,
      resolveDir: path.join(root, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: root,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    // dsh's primitives bring the whole host UI (fonts and all); the card only takes icons from it.
    plugins: [
      {
        name: 'icons-only',
        setup(b) {
          b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
            path: 'icons',
            namespace: 'stub'
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents:
              'const Icon = () => null; export const IconChecklistOutlineRegular = Icon; export const IconChevronDownOutlineRegular = Icon; export const IconChevronUpOutlineRegular = Icon',
            loader: 'js'
          }))
        }
      }
    ],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => out && rmSync(out, { recursive: true, force: true }))

const PLAN = { id: 'plan-larkfen', revision: 4 }
const built = (over = {}) => ({
  id: 'build-larkfen-1',
  plan: PLAN,
  state: 'done',
  siteKey: 'larkfen.example',
  restorable: false,
  unfinished: false,
  ...over
})
const draftsOf = (plan) => ({
  read: () => ({ plan: { ...plan, pages: [], items: [] } }),
  subscribe: () => () => {},
  load: async () => {},
  put: () => {}
})
const sourceOf = (state) => ({
  read: () => state,
  subscribe: () => () => {},
  load: async () => {},
  ask: async () => true
})
const render = (state, plan = PLAN) =>
  lib.card({ deps: { drafts: draftsOf(plan), t: () => lib.english }, source: sourceOf(state) })
const escaped = (text) => text.replace(/'/g, '&#x27;')

test('a plan changed after the build offers the update, and only then', () => {
  assert.equal(
    render({ build: built(), run: null, say: null }),
    '',
    'the site shows the plan: nothing to say'
  )
  const changed = render({ build: built(), run: null, say: null }, { ...PLAN, revision: 5 })
  assert.match(changed, new RegExp(lib.en['rebuild.update']))
  assert.match(changed, new RegExp(lib.en['rebuild.changed']))
  // While a run goes, a restore holds the site, or an update is unfinished, no update is offered.
  assert.doesNotMatch(
    render({ build: built({ state: 'building' }), run: null, say: null }, { ...PLAN, revision: 5 }),
    /Update my site/
  )
  assert.doesNotMatch(
    render({ build: built({ busy: 'restore' }), run: null, say: null }, { ...PLAN, revision: 5 }),
    /Update my site/
  )
  assert.doesNotMatch(
    render({ build: built({ unfinished: true }), run: null, say: null }, { ...PLAN, revision: 5 }),
    /Update my site/
  )
  // Before the build has a site the card draws nothing.
  assert.equal(
    render({ build: built({ siteKey: undefined }), run: null, say: null }, { ...PLAN, revision: 5 }),
    ''
  )
})

test('an update in progress shows the partial task list', () => {
  const run = {
    events: [
      {
        schema: 'tracy-build-progress/v1',
        seq: 1,
        planId: PLAN.id,
        run: { id: 'run-2', kind: 'partial', edit: 'edit-3' },
        steps: [
          { id: 'look', kind: 'look', state: 'done' },
          { id: 'writer:page-home', kind: 'writer', page: 'page-home', state: 'running' }
        ]
      }
    ]
  }
  const html = render({ build: built({ state: 'building', kind: 'partial' }), run, say: null })
  assert.match(html, new RegExp(lib.en['progress.title.partial']))
  assert.doesNotMatch(html, /data-site-update/, 'no empty notice while it runs')
})

test('an ended update says the server sentence and offers restore; an unfinished one offers undo', () => {
  const done = render({
    build: built({ kind: 'partial', restorable: true }),
    run: null,
    say: 'Your site is updated.'
  })
  assert.match(done, /role="status">Your site is updated\./)
  assert.match(done, new RegExp(lib.en['rebuild.restore']))
  assert.doesNotMatch(done, new RegExp(lib.en['rebuild.undo']))
  const left = render({
    build: built({ unfinished: true }),
    run: null,
    say: 'An earlier update did not finish.'
  })
  assert.match(left, new RegExp(lib.en['rebuild.undo']))
  assert.doesNotMatch(left, new RegExp(lib.en['rebuild.restore']))
})

test('a held file left on the site is always shown, with its files', () => {
  const say = 'A photo of a person you asked to keep private is still stored on your site as a file.'
  const html = render({
    build: built({ heldFile: { code: 'held_file_left_on_site', say, files: ['images/tracy/coach-1.jpg'] } }),
    run: null,
    say: null
  })
  assert.match(html, /role="alert"/)
  assert.ok(html.includes(escaped(say)))
  assert.match(html, /<code>images\/tracy\/coach-1\.jpg<\/code>/)
})

test('the source sends each ask to its door and keeps the answer sentence', async () => {
  const asked = []
  const answers = {
    '/api/build-draft/build': { build: built({ plan: { ...PLAN, revision: 3 } }), run: null },
    '/api/build-draft/build/revise': {
      build: built({ state: 'building', kind: 'partial', plan: { ...PLAN, revision: 5 } }),
      run: null
    },
    '/api/build-draft/build/restore': {
      build: built({ kind: 'partial' }),
      run: null,
      say: 'Your site is back to the previous version.'
    }
  }
  const fetchImpl = async (url, init) => {
    asked.push({ url, method: init?.method ?? 'GET', body: init?.body ?? null })
    return new Response(JSON.stringify(answers[url]), { status: 200 })
  }
  const timers = []
  const source = lib.createSiteBuildSource(fetchImpl, {
    setTimer: (run) => timers.push(run),
    clearTimer: () => {}
  })
  await source.load()
  assert.equal(source.read().build.plan.revision, 3)
  assert.equal(await source.ask('revise', { plan: { ...PLAN, revision: 5 } }), true)
  assert.deepEqual(asked.at(-1), {
    url: '/api/build-draft/build/revise',
    method: 'POST',
    body: JSON.stringify({ plan: { ...PLAN, revision: 5 } })
  })
  assert.equal(source.read().build.state, 'building')
  assert.equal(await source.ask('restore'), true)
  assert.equal(source.read().say, 'Your site is back to the previous version.')
  // A door that did not take the ask is a failed ask; what was there stays.
  const broken = lib.createSiteBuildSource(async () => new Response('{"code":"SITE_BUSY"}', { status: 409 }))
  assert.equal(await broken.ask('restore'), false)
  // A refusal that carries a sentence is said.
  const said = lib.createSiteBuildSource(async (url) =>
    url.endsWith('/revise')
      ? new Response(
          JSON.stringify({ code: 'PREVIOUS_RUN_UNFINISHED', say: 'An earlier update did not finish.' }),
          {
            status: 409
          }
        )
      : new Response(JSON.stringify({ build: built(), run: null }), { status: 200 })
  )
  await said.load()
  assert.equal(await said.ask('revise', { plan: PLAN }), true)
  assert.equal(said.read().say, 'An earlier update did not finish.')
})
