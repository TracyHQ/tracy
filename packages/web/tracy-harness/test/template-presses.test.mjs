/**
 * Which presses a template page offers (10/10/2026).
 *
 *   - The header (`CardActions`) offers ONE press by the template's state, never both: a Published
 *     template Unpublish only, a Disabled one Publish only (off while issues remain).
 *   - The Listing status strip offers a press for the selected release ALONE (`ListingPress`):
 *     Listed → "Unpublish <CMS>" in two presses, Hidden → "Publish <CMS>" (off with the reason while
 *     the door would refuse it), Not listed → "Publish <CMS>" off, "Save a listing first". A press
 *     sends one request for that release's tag and nothing for the others.
 *
 * Mounted with react-dom on a linkedom document; `fetch` is a fixture, nothing leaves the process.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const { parseHTML } = rootRequire('linkedom')

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const GLOBALS = ['window', 'document', 'fetch', 'HTMLElement', 'Element', 'Node', 'IS_REACT_ACT_ENVIRONMENT']
const saved = new Map()
let lib
let dom
let cleanups = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { CardActions } from './TemplateDetail'
        export { ListingPress } from './ListingPress'
        export { releasePublishBlockers, templatePublishNeeds, needsText, NO_CONTRACT } from './templates-model'
        export { RoadToLive, roadIsChecking } from './RoadToLive'
        export { CmsChip } from './Templates'
        export { githubReleaseHref } from './QuickstartSettingsParts'`,
      resolveDir: path.join(pkgRoot, 'src', 'cms'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('HTMLElement', dom.window.HTMLElement)
  set('Element', dom.window.Element)
  set('Node', dom.window.Node)
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

async function mount(component, props) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(lib.createElement(component, props)))
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  const click = (el) =>
    lib.act(async () => {
      el.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }))
      await tick(5)
    })
  return { host, click, buttons: () => [...host.querySelectorAll('button')] }
}

/** Records every request and answers `ok: true`. */
function stubFetch() {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push([init.method ?? 'GET', String(url)])
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return calls
}

const release = (tag, platform, state, over = {}) => ({
  tag,
  name: 'Tracy Base',
  label: 'Tracy Base',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  reason: null,
  choosable: true,
  platform,
  version: '1.0.0',
  template: 'tracy',
  inspiration: { state, why: null, code: state === 'card' ? 'unpublished' : null, warnings: [] },
  contract: { state: platform === 'emdash' ? 'not-applicable' : 'exact' },
  notShowable: null,
  ...over
})
const JOOMLA = release('tracy/j6', 'joomla', 'on')
const WORDPRESS = release('tracy/wp7', 'wordpress', 'on')
const EMDASH = release('tracy/emdash', 'emdash', 'none')
const noop = () => {}

test('header of a Published template: Unpublish only, even with a release still to publish', async () => {
  const ui = await mount(lib.CardActions, {
    releases: [JOOMLA, WORDPRESS, EMDASH],
    active: true,
    blockers: [{ tag: 'tracy/emdash', step: 'listing', label: 'Listing (EmDash)' }],
    writable: true,
    onChanged: noop
  })
  assert.ok(ui.host.querySelector('[data-card-unpublish]'))
  assert.equal(ui.host.querySelector('[data-card-publish]'), null, 'no Publish beside it')
  assert.equal(ui.host.querySelector('[data-publish-blocked]'), null, 'no "Fix N issues first."')
  assert.equal(ui.buttons().length, 1)
})

test('header of a Disabled template: Publish only, off and muted, EVERY step it still needs on hover', async () => {
  const hidden = release('ja-titan/j6', 'joomla', 'card')
  const ui = await mount(lib.CardActions, {
    releases: [hidden],
    active: false,
    blockers: [
      { tag: 'ja-titan/j6', step: 'contract', label: 'Content contract' },
      { tag: 'ja-titan/j6', step: 'listing', label: 'Listing' }
    ],
    writable: true,
    onChanged: noop
  })
  assert.equal(ui.host.querySelector('[data-card-unpublish]'), null)
  const publish = ui.host.querySelector('[data-card-publish]')
  assert.ok(publish)
  assert.equal(publish.disabled, true)
  // A real disabled look: the muted surface, never a faded emerald that reads as pressable.
  assert.doesNotMatch(publish.className, /bg-emerald/)
  assert.match(publish.className, /bg-muted/)
  assert.equal(publish.parentElement.getAttribute('title'), 'Needs: Content contract, Listing')
  // No visible Needs line: the Road to live right below already lists the steps (11/10/2026).
  assert.doesNotMatch(ui.host.textContent, /Needs:/)
})

test('header Publish with nothing waiting is emerald and pressable', async () => {
  const ui = await mount(lib.CardActions, {
    releases: [release('ja-titan/j6', 'joomla', 'card')],
    active: false,
    blockers: [],
    writable: true,
    onChanged: noop
  })
  const publish = ui.host.querySelector('[data-card-publish]')
  assert.equal(publish.disabled, false)
  assert.match(publish.className, /bg-emerald-600/)
})

const pressProps = (r, over = {}) => ({
  tag: r.tag,
  name: over.name ?? 'Joomla',
  card:
    r.inspiration.state === 'on' ? 'Listed' : r.inspiration.state === 'card' ? 'Hidden' : 'No listing yet',
  blockers: [],
  writable: true,
  note: null,
  onNote: noop,
  onChanged: noop,
  ...over
})

test('Listed: "Unpublish Joomla" asks first, then unpublishes that one release only', async () => {
  const calls = stubFetch()
  const notes = []
  let changed = 0
  const ui = await mount(
    lib.ListingPress,
    pressProps(JOOMLA, { onNote: (n) => notes.push(n), onChanged: () => (changed += 1) })
  )
  const button = () => ui.host.querySelector('[data-listing-unpublish]')
  assert.equal(button().textContent, 'Unpublish Joomla')
  await ui.click(button())
  assert.equal(button().textContent, 'Unpublish Joomla?')
  assert.deepEqual(calls, [], 'the first press only asks')
  await ui.click(button())
  assert.deepEqual(calls, [['DELETE', '/api/ops/quickstart/inspiration?tag=tracy%2Fj6']])
  assert.equal(changed, 1, 'the list is read again')
  assert.deepEqual(notes.at(-1), { tag: 'tracy/j6', ok: true, text: 'Joomla unpublished.' })
})

test('Hidden: "Publish EmDash" publishes that one release only', async () => {
  const calls = stubFetch()
  const hidden = release('tracy-saas/emdash', 'emdash', 'card')
  const ui = await mount(lib.ListingPress, pressProps(hidden, { name: 'EmDash' }))
  const button = ui.host.querySelector('[data-listing-publish]')
  assert.equal(button.textContent, 'Publish EmDash')
  assert.equal(button.disabled, false)
  await ui.click(button)
  assert.deepEqual(calls, [['POST', '/api/ops/quickstart/inspiration/publish?tag=tracy-saas%2Femdash']])
})

test('Hidden and waiting for a step: Publish is off and muted, every step on hover only', async () => {
  const ui = await mount(
    lib.ListingPress,
    pressProps(release('a/j6', 'joomla', 'card'), {
      blockers: [
        { tag: 'a/j6', step: 'contract', label: 'Content contract' },
        { tag: 'a/j6', step: 'listing', label: 'Listing' }
      ]
    })
  )
  const button = ui.host.querySelector('[data-listing-publish]')
  assert.equal(button.disabled, true)
  assert.doesNotMatch(button.className, /bg-emerald/)
  assert.equal(button.parentElement.getAttribute('title'), 'Needs: Content contract, Listing')
  assert.equal(button.getAttribute('title'), 'Needs: Content contract, Listing')
  assert.doesNotMatch(ui.host.textContent, /Needs:/)
})

test('No listing yet: no Publish button at all, never a dead one', async () => {
  const ui = await mount(lib.ListingPress, pressProps(EMDASH, { name: 'EmDash' }))
  assert.equal(ui.host.querySelector('[data-listing-publish]'), null)
  assert.equal(ui.host.querySelector('[data-listing-press]'), null)
})

test('a refused press prints the server text for that release', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'NO_CONTRACT', reason: 'Capture the contract first.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
  const notes = []
  const ui = await mount(
    lib.ListingPress,
    pressProps(release('a/j6', 'joomla', 'card'), { onNote: (n) => notes.push(n) })
  )
  await ui.click(ui.host.querySelector('[data-listing-publish]'))
  assert.deepEqual(notes.at(-1), { tag: 'a/j6', ok: false, text: 'Capture the contract first.' })
})

test('what holds one hidden release is its road: the step Published waits for, or why it stays hidden', () => {
  const published = (state, code, params = {}, blockedBy) => [
    { step: 'published', state, code, params, ...(blockedBy ? { blockedBy } : {}) }
  ]
  const hidden = (road) => release('t/emdash', 'emdash', 'card', { road })
  assert.deepEqual(
    lib.releasePublishBlockers(hidden(published('blocked', 'not-published', {}, 'contract'))),
    ['Content contract']
  )
  // ja-restaurant: Publish needs BOTH the content contract and the listing, never only the first.
  assert.deepEqual(
    lib.releasePublishBlockers(
      hidden(published('blocked', 'not-published', { waiting: ['contract', 'listing'] }, 'listing'))
    ),
    ['Content contract', 'Listing']
  )
  assert.deepEqual(lib.releasePublishBlockers(hidden(published('todo', 'ready-to-publish'))), [])
  assert.deepEqual(lib.releasePublishBlockers(hidden(published('done', 'published'))), [])
  assert.deepEqual(
    lib.releasePublishBlockers(hidden(published('todo', 'not-showable', { why: 'Cannot start.' }))),
    ['It would stay hidden']
  )
  assert.deepEqual(lib.releasePublishBlockers(hidden(undefined)), [], 'an older server sends no road')
})

// ── The Road to live panel (`RoadToLive.tsx`) ───────────────────────────────────────────────────

const JA_RESTAURANT_ROAD = [
  { step: 'release', state: 'done', code: 'release-published', params: {} },
  { step: 'install-file', state: 'done', code: 'install-file-ready', params: { version: '1.0.2' } },
  {
    step: 'contract',
    state: 'todo',
    code: 'no-contract',
    params: {
      platform: 'joomla',
      slug: 'ja-restaurant',
      version: '1.0.2',
      path: 'direct',
      batchInScope: false
    }
  },
  {
    step: 'content-coverage',
    state: 'blocked',
    code: 'coverage-waiting',
    params: { version: '1.0.2', slug: 'ja-restaurant', platform: 'joomla', contract: null },
    blockedBy: 'contract'
  },
  {
    step: 'customize',
    state: 'blocked',
    code: 'customize-waiting',
    params: { passed: 0, total: 0, mustFix: [], worthFixing: [], version: '1.0.2' },
    blockedBy: 'contract'
  },
  {
    step: 'demo',
    state: 'blocked',
    code: 'demo-failed',
    params: { reason: null, step: 'provision', version: '1.0.0', releaseVersion: '1.0.2' },
    blockedBy: 'contract'
  },
  { step: 'listing', state: 'blocked', code: 'no-listing', params: { demo: false }, blockedBy: 'demo' },
  {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: { waiting: ['contract', 'content-coverage', 'customize', 'listing'] },
    blockedBy: 'listing'
  },
  {
    step: 'polish',
    state: 'warn',
    code: 'polish',
    params: { items: [{ code: 'no-pages-file', params: {} }] }
  }
]

/** The same release once its contract is in place: the demo opens; the listing still waits for it. */
const WITH_CONTRACT_ROAD = JA_RESTAURANT_ROAD.map((s) =>
  s.step === 'contract'
    ? {
        step: 'contract',
        state: 'done',
        code: 'contract-exact',
        params: { profile: 'ja-restaurant/j6/1.0.2' }
      }
    : s.step === 'demo'
      ? { ...s, state: 'todo', blockedBy: undefined }
      : s.step === 'customize'
        ? { ...s, state: 'checking', code: 'customize-checking', blockedBy: undefined }
        : s
)

test('Road to live for ja-restaurant: nine steps in the order they finish, only the contract to start now', async () => {
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'none', {
    version: '1.0.2',
    road: JA_RESTAURANT_ROAD
  })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop })
  // Every group starts collapsed, even with steps to do: open it.
  const group = ui.host.querySelector('[data-road-release]')
  assert.equal(group.getAttribute('data-open'), 'false')
  assert.equal(group.querySelector('[data-road-step]'), null)
  await ui.click(group.querySelector('[data-road-toggle]'))
  const steps = [...ui.host.querySelectorAll('[data-road-step]')]
  assert.deepEqual(
    steps.map((li) => li.getAttribute('data-road-step')),
    [
      'release',
      'install-file',
      'contract',
      'content-coverage',
      'customize',
      'demo',
      'listing',
      'published',
      'polish'
    ]
  )
  // The help line sits under the title, in plain words.
  assert.equal(
    ui.host.querySelector('[data-road-help]').textContent,
    'What this template needs before customers can pick it.'
  )
  // The header: a bar with one segment per step coloured by state, the count, and ONE list of every
  // step that can start now. The demo and the listing wait for the contract (it may make a new
  // version), so only the contract is to do now.
  const summary = ui.host.querySelector('[data-road-summary]')
  assert.equal(summary.getAttribute('data-road-summary'), '3/9')
  assert.deepEqual(
    [...summary.querySelectorAll('[data-road-bar]')].map((b) => b.getAttribute('data-road-bar')),
    ['done', 'done', 'todo', 'blocked', 'blocked', 'blocked', 'blocked', 'blocked', 'warn']
  )
  const todo = ui.host.querySelector('[data-road-todo]')
  assert.equal(todo.textContent, 'To do now: Content contract')
  assert.doesNotMatch(ui.host.textContent, /Next: step|Also start now/)
  const tagOf = (step) =>
    ui.host.querySelector(`[data-road-step="${step}"] [data-road-tag]`)?.textContent ?? null
  assert.equal(tagOf('contract'), 'Start now, takes longest')
  assert.equal(tagOf('demo'), null)
  assert.equal(tagOf('listing'), null)
  // The demo says why it waits; the listing waits for the demo. Neither opens a body.
  const demo = ui.host.querySelector('[data-road-step="demo"]')
  assert.equal(
    demo.querySelector('[data-road-waiting]').textContent,
    'Waiting for step 3: the contract may make a new version.'
  )
  assert.equal(demo.querySelector('[data-road-go]'), null)
  const listing = ui.host.querySelector('[data-road-step="listing"]')
  assert.equal(listing.querySelector('[data-road-waiting]').textContent, 'Waiting for step 7: Demo site')
  assert.doesNotMatch(listing.textContent, /by hand/)
  // Customize your site waits for the contract: the check reads it.
  assert.equal(
    ui.host.querySelector('[data-road-step="customize"] [data-road-waiting]').textContent,
    'Waiting for step 3: Content contract'
  )
  const published = ui.host.querySelector('[data-road-step="published"]')
  assert.equal(published.querySelector('[data-road-go]'), null, 'a blocked step offers no Go there')
  // Publish names every step it still needs, not only the first.
  assert.equal(
    published.querySelector('[data-road-waiting]').textContent,
    'Waiting for steps 3, 4, 5 and 8: Content contract, Content coverage, Customize your site, Listing'
  )
  // A waiting step is one line: no why, no body.
  assert.doesNotMatch(published.textContent, /Shows the listing/)
  // A done step is one line too: its title and links, no why.
  const install = ui.host.querySelector('[data-road-step="install-file"]')
  assert.doesNotMatch(install.textContent, /which files to install/)
  // The release step links to its release page on GitHub, in a new tab.
  const gh = ui.host.querySelector('[data-road-step="release"] a[href]')
  assert.equal(gh.getAttribute('href'), lib.githubReleaseHref('quickstart/ja-restaurant/j6'))
  assert.equal(gh.getAttribute('target'), '_blank')
  assert.match(gh.textContent, /Open on GitHub/)
  // The contract step, SHORT (11/10/2026): one why line, one fact line, then the block.
  const contract = ui.host.querySelector('[data-road-step="contract"]')
  const body = contract.lastElementChild
  assert.deepEqual(
    [...body.querySelectorAll(':scope > p')].map((p) => p.textContent),
    [
      'Tells the site agent what it may edit without breaking the design.',
      'May make a new version; demo and listing wait for it.'
    ]
  )
  const outside = contract.querySelector('[data-road-outside]')
  assert.ok(outside, 'the contract is made outside /ops')
  assert.match(outside.textContent, /^Paste into Claude Code/)
  for (const gone of [
    /Outside \/ops/,
    /Where/,
    /Skill/,
    /Expected/,
    /Who to ask|Owner not set yet/,
    /Machine needs/
  ])
    assert.doesNotMatch(
      outside.textContent.replace(outside.querySelector('[data-road-prompt]').textContent, ''),
      gone
    )
  assert.equal(outside.querySelector('ol'), null, 'no list of steps')
  // ONE prompt to paste, wrapped on screen, with its copy button.
  const prompts = outside.querySelectorAll('[data-road-prompt]')
  assert.equal(prompts.length, 1)
  assert.match(prompts[0].className, /whitespace-pre-wrap/)
  assert.match(prompts[0].textContent, /First check this machine has what the skill needs/)
  assert.ok(prompts[0].parentElement.querySelector('[data-road-copy]'), 'a copy button for the prompt')
  assert.equal(outside.querySelector('[data-road-note]').textContent, 'Production: ask Vincent.')
  assert.equal(outside.querySelectorAll('[data-road-doc]').length, 1)
  // Polish: a why line true for every item, and the pages file says what it is for (the Pages
  // question of Customize your site, not the card).
  const polish = ui.host.querySelector('[data-road-step="polish"]')
  assert.deepEqual(
    [...polish.lastElementChild.querySelectorAll(':scope > p')].map((p) => p.textContent),
    ['Nice to have. Publish works without them.', 'Missing: pages file.']
  )
  const pagesFix = polish.querySelector('[data-road-outside]')
  assert.equal(
    pagesFix.querySelector('[data-road-note]').textContent,
    'Lets customers pick which pages to keep.'
  )
  assert.match(pagesFix.querySelector('[data-road-prompt]').textContent, /only on the draft branch/)
  assert.doesNotMatch(polish.textContent, /on the card/)
  assert.doesNotMatch(ui.host.textContent, /[\u2013\u2014]/, 'no dash anywhere in the panel')
})

test('Road to live once the contract is in place: the demo opens with one short line, the listing still waits', async () => {
  const gone = []
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'none', {
    version: '1.0.2',
    road: WITH_CONTRACT_ROAD
  })
  const ui = await mount(lib.RoadToLive, {
    releases: [r],
    writable: true,
    onGo: (tag, t) => gone.push([tag, t.control])
  })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  assert.equal(ui.host.querySelector('[data-road-todo]').textContent, 'To do now: Demo site')
  const demo = ui.host.querySelector('[data-road-step="demo"]')
  assert.match(demo.textContent, /Failed on 1\.0\.0\. Retry installs 1\.0\.2\./)
  assert.deepEqual(
    [...demo.querySelectorAll('ol li')].map((li) => li.textContent),
    ['Press Retry install twice.', 'Still failing? Send the reason to the dev team.']
  )
  await ui.click(demo.querySelector('[data-road-go]'))
  assert.deepEqual(gone, [['quickstart/ja-restaurant/j6', 'demo-install']])
  assert.equal(
    ui.host.querySelector('[data-road-step="listing"] [data-road-waiting]').textContent,
    'Waiting for step 7: Demo site'
  )
})

test('Road to live of a Published release: the GitHub link still shows, every step done reads 8/8 and Live', async () => {
  const done = (step, code, params = {}) => ({ step, state: 'done', code, params })
  const r = release('quickstart/ja-titan/j6', 'joomla', 'on', {
    road: [
      done('release', 'release-published'),
      done('install-file', 'install-file-ready'),
      done('contract', 'contract-exact', { profile: 'p/1.0.0' }),
      done('customize', 'customize-ready', { passed: 29, total: 29, mustFix: [], worthFixing: [] }),
      done('demo', 'demo-live'),
      done('listing', 'listing-saved', { hidden: false }),
      done('published', 'published'),
      done('polish', 'polish-done')
    ]
  })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop })
  // A live release starts collapsed like every other: open it.
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const gh = ui.host.querySelector('[data-road-step="release"] a[href]')
  assert.equal(gh.getAttribute('href'), lib.githubReleaseHref('quickstart/ja-titan/j6'))
  assert.equal(gh.getAttribute('target'), '_blank')
  // No step is left after Publish (the hand check is gone, 11/10/2026): the count is whole.
  assert.equal(ui.host.querySelector('[data-road-step="check"]'), null)
  assert.equal(ui.host.querySelector('[data-road-summary]').getAttribute('data-road-summary'), '8/8')
  assert.match(
    ui.host.querySelector('[data-road-step="customize"]').textContent,
    /Customize your site · 29\/29 passed/
  )
  assert.equal(ui.host.querySelector('[data-road-live]').textContent, 'Live')
  assert.equal(ui.host.querySelector('[data-road-todo]'), null)
  assert.doesNotMatch(ui.host.textContent, /[\u2013\u2014]/)
})

test('Road to live CMS header: collapsed on load, the whole row is one toggle, the chevron at its right edge, To do now never closes it', async () => {
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'none', {
    version: '1.0.2',
    road: WITH_CONTRACT_ROAD
  })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop })
  const group = ui.host.querySelector('[data-road-release]')
  const header = group.querySelector('h3')
  const toggle = header.querySelector('[data-road-toggle]')
  // One button stretched over the row, named by the CMS and its version, saying whether it is open.
  assert.equal(toggle.tagName, 'BUTTON')
  assert.match(toggle.className, /\babsolute\b/)
  assert.match(toggle.className, /\binset-0\b/)
  assert.equal(toggle.getAttribute('aria-label'), 'Joomla 1.0.2')
  // Collapsed on load, though it has steps to do.
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(group.getAttribute('data-open'), 'false')
  assert.match(toggle.className, /focus-visible:outline-1/)
  assert.doesNotMatch(toggle.className, /ring-|shadow/, 'a 1px stroke on focus, no halo')
  // The chevron is the row's last piece: at the right edge, not before the CMS logo.
  const chevron = header.querySelector('[data-road-chevron]')
  assert.equal(header.lastElementChild, chevron)
  assert.equal(chevron.getAttribute('aria-hidden'), 'true')
  // Clicking the row opens the group, clicking it again closes it, and once more opens it.
  await ui.click(toggle)
  assert.equal(group.getAttribute('data-open'), 'true')
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  await ui.click(toggle)
  assert.equal(group.getAttribute('data-open'), 'false')
  assert.equal(group.querySelector('[data-road-step]'), null)
  await ui.click(toggle)
  assert.equal(group.getAttribute('data-open'), 'true')
  // A To do now item sits above the toggle and never toggles: open, it stays open...
  const item = () => header.querySelector('[data-road-todo-step="demo"]')
  assert.match(item().className, /\bz-10\b/)
  await ui.click(item())
  assert.equal(group.getAttribute('data-open'), 'true')
  // ...and closed, it opens the group.
  await ui.click(toggle)
  assert.equal(group.getAttribute('data-open'), 'false')
  await ui.click(item())
  assert.equal(group.getAttribute('data-open'), 'true')
  assert.ok(group.querySelector('[data-road-step="demo"]'))
})

test('Road to live for a viewer: no Go there, it says who can fix it', async () => {
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'none', { road: WITH_CONTRACT_ROAD })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: false, onGo: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  assert.equal(ui.host.querySelector('[data-road-go]'), null)
  assert.match(ui.host.querySelector('[data-road-step="demo"]').textContent, /Owners and admins fix this/)
})

test('a CMS chip with no version (a design pack) draws no version label, never "none"', async () => {
  const ui = await mount(lib.CmsChip, {
    cms: 'joomla',
    pressed: true,
    onClick: noop,
    label: 'Joomla',
    count: ''
  })
  assert.equal(ui.host.textContent, 'JJoomla', 'the glyph letter and the name, nothing after')
  assert.doesNotMatch(ui.host.textContent, /none/)
  const withVersion = await mount(lib.CmsChip, {
    cms: 'joomla',
    pressed: true,
    onClick: noop,
    label: 'Joomla',
    count: '1.0.2'
  })
  assert.equal(withVersion.host.textContent, 'JJoomla1.0.2')
})

// ── Customize your site (ADR 0029 §4) ─────────────────────────────────────────────────────────

/** A failing rule as the road sends it. */
const rule = (id, question, text, owner = 'template') => ({
  rule: id,
  question,
  text,
  owner,
  message: `${id} fails on the release.`,
  fix: null
})

/** ja-restaurant with its contract in place and a check with must-fix and worth-fixing rules. */
const customizeRoad = (state, code, params) =>
  WITH_CONTRACT_ROAD.map((s) => (s.step === 'customize' ? { step: 'customize', state, code, params } : s))
const FAILING = {
  passed: 26,
  total: 29,
  version: '1.0.2',
  mustFix: [
    rule('LOGO-1', 'Logo', 'Some pages keep the demo logo.'),
    rule('NAME-1', 'Business name', 'The home page tab keeps the demo name.')
  ],
  worthFixing: [rule('LANG-6', 'Site language', 'Dates keep the English format.')]
}

test('Customize your site with must-fix rules: the score, two groups, one prompt, and Check again reads the list again', async () => {
  const pressed = []
  let reread = 0
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    version: '1.0.2',
    road: customizeRoad('todo', 'customize-must-fix', FAILING)
  })
  const ui = await mount(lib.RoadToLive, {
    releases: [r],
    writable: true,
    onGo: noop,
    onChanged: () => {
      reread += 1
    },
    checkAgain: async (tag) => {
      pressed.push(tag)
      return null
    }
  })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="customize"]')
  assert.equal(row.getAttribute('data-road-state'), 'todo')
  assert.equal(row.querySelector('b').textContent, 'Customize your site · 26/29 passed')
  assert.match(ui.host.querySelector('[data-road-todo]').textContent, /Customize your site/)
  const must = row.querySelector('[data-road-rules="must-fix"]')
  const worth = row.querySelector('[data-road-rules="worth-fixing"]')
  assert.equal(must.firstElementChild.textContent, 'Must fix (2)')
  assert.match(must.firstElementChild.className, /text-destructive/)
  assert.equal(worth.firstElementChild.textContent, 'Worth fixing (1)')
  assert.match(worth.firstElementChild.className, /text-amber/)
  assert.deepEqual(
    [...must.querySelectorAll('[data-road-rule]')].map((li) => li.textContent),
    [
      'Logo: Some pages keep the demo logo. LOGO-1',
      'Business name: The home page tab keeps the demo name. NAME-1'
    ]
  )
  // ONE prompt for the whole release, with its copy button.
  const prompts = row.querySelectorAll('[data-road-prompt]')
  assert.equal(prompts.length, 1)
  for (const id of ['LOGO-1', 'NAME-1', 'LANG-6']) assert.match(prompts[0].textContent, new RegExp(id))
  assert.ok(row.querySelector('[data-road-copy]'))
  // Check again presses the door for this release, then reads the list again.
  await ui.click(row.querySelector('[data-road-check-again]'))
  assert.deepEqual(pressed, ['quickstart/ja-restaurant/j6'])
  assert.equal(reread, 1)
  assert.doesNotMatch(ui.host.textContent, /[\u2013\u2014]/, 'no dash anywhere in the panel')
})

test('Check again refused: the server text shows under the button, the list is not read again', async () => {
  let reread = 0
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    version: '1.0.2',
    road: customizeRoad('todo', 'customize-must-fix', FAILING)
  })
  const ui = await mount(lib.RoadToLive, {
    releases: [r],
    writable: true,
    onGo: noop,
    onChanged: () => {
      reread += 1
    },
    checkAgain: async () => 'Only a quickstart Tracy can read is checked.'
  })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  await ui.click(ui.host.querySelector('[data-road-check-again]'))
  assert.equal(
    ui.host.querySelector('[data-road-check-error]').textContent,
    'Only a quickstart Tracy can read is checked.'
  )
  assert.equal(reread, 0)
})

test('Customize your site while checking: one line, a spinning icon, no Check again; a viewer never gets the button', async () => {
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    version: '1.0.2',
    road: WITH_CONTRACT_ROAD
  })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="customize"]')
  assert.equal(row.getAttribute('data-road-state'), 'checking')
  assert.match(row.textContent, /Customize your site/)
  assert.match(row.textContent, /Checking now\. This takes a few minutes\./)
  assert.match(row.querySelector('svg').getAttribute('class'), /animate-spin/)
  assert.equal(row.querySelector('[data-road-check-again]'), null)
  assert.equal(row.querySelector('[data-road-customize-rules]'), null)

  const viewer = await mount(lib.RoadToLive, {
    releases: [{ ...r, road: customizeRoad('todo', 'customize-must-fix', FAILING) }],
    writable: false,
    onGo: noop,
    onChanged: noop
  })
  await viewer.click(viewer.host.querySelector('[data-road-release] [data-road-toggle]'))
  assert.equal(viewer.host.querySelector('[data-road-check-again]'), null)
  assert.ok(viewer.host.querySelector('[data-road-rules="must-fix"]'), 'the groups still show')
})

test('Customize your site re-checking: the last result stays with a Rechecking note, no Check again', async () => {
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    version: '1.0.2',
    road: customizeRoad('todo', 'customize-must-fix', { ...FAILING, rechecking: true })
  })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="customize"]')
  assert.equal(row.getAttribute('data-road-state'), 'todo', 'the last result, not an empty checking')
  assert.equal(row.querySelector('b').textContent, 'Customize your site · 26/29 passed')
  assert.ok(row.querySelector('[data-road-rules="must-fix"]'), 'the last failing rules still show')
  assert.equal(row.querySelector('[data-road-rechecking]').textContent, 'Rechecking…')
  assert.equal(row.querySelector('[data-road-check-again]'), null, 'one check at a time')

  const clean = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    version: '1.0.2',
    road: customizeRoad('done', 'customize-ready', {
      passed: 29,
      total: 29,
      version: '1.0.2',
      mustFix: [],
      worthFixing: [],
      rechecking: true
    })
  })
  const done = await mount(lib.RoadToLive, { releases: [clean], writable: true, onGo: noop, onChanged: noop })
  await done.click(done.host.querySelector('[data-road-release] [data-road-toggle]'))
  const doneRow = done.host.querySelector('[data-road-step="customize"]')
  assert.equal(doneRow.getAttribute('data-road-state'), 'done')
  assert.equal(doneRow.querySelector('[data-road-rechecking]').textContent, 'Rechecking…')
  assert.doesNotMatch(done.host.textContent, /[\u2013\u2014]/, 'no dash anywhere in the panel')
})

test('the panel reads the list again while a release is re-checked, and stops after', () => {
  const rechecking = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    road: customizeRoad('todo', 'customize-must-fix', { ...FAILING, rechecking: true })
  })
  const settled = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    road: customizeRoad('todo', 'customize-must-fix', FAILING)
  })
  assert.equal(lib.roadIsChecking([rechecking]), true)
  assert.equal(lib.roadIsChecking([settled]), false)
})

test('a live release failing must-fix rules: the step warns, groups show, the release stays Live', async () => {
  const road = customizeRoad('warn', 'customize-live-failing', FAILING).map((s) =>
    s.step === 'published' ? { step: 'published', state: 'done', code: 'published', params: {} } : s
  )
  const r = release('quickstart/ja-restaurant/j6', 'joomla', 'on', { version: '1.0.2', road })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="customize"]')
  assert.equal(row.getAttribute('data-road-state'), 'warn')
  assert.match(row.textContent, /Live, so it stays published\./)
  assert.match(ui.host.querySelector('[data-road-live]').textContent, /^Live/)
})

test('the header Publish lists Customize your site under Needs', async () => {
  const hidden = release('quickstart/ja-restaurant/j6', 'joomla', 'card', {
    road: customizeRoad('todo', 'customize-must-fix', FAILING).map((s) =>
      s.step === 'published'
        ? {
            step: 'published',
            state: 'blocked',
            code: 'not-published',
            params: { waiting: ['customize'] },
            blockedBy: 'customize'
          }
        : s
    )
  })
  const needs = lib.templatePublishNeeds([hidden])
  assert.deepEqual(
    needs.map((n) => [n.step, n.label]),
    [['customize', 'Customize your site']]
  )
  const ui = await mount(lib.CardActions, {
    releases: [hidden],
    active: false,
    blockers: needs,
    writable: true,
    onChanged: noop
  })
  assert.equal(
    ui.host.querySelector('[data-card-publish]').parentElement.getAttribute('title'),
    'Needs: Customize your site'
  )
})

// Dev 14/10 (after #1321): on JA Nova j6 1.0.6, a live release failing ROLE-1, "Measured on" showed only
// inside the prompt. Every measured rule row carries its own sub line; the rules that passed on that run
// are listed too; a rule the run could not read stays in Not measured yet, with no such line.
test('Design system: the run every rule was measured on is said once, "Built site measured on <version>, <date>, <machine>" (JA Nova 1.0.6)', async () => {
  const STAMP = '1.0.6, 2026-10-13, imac'
  const built = (id, text, measuredOn) => ({
    rule: id,
    text,
    question: 'Built site',
    owner: 'contract',
    message: `${text} Measured on ${STAMP}.`,
    fix: null,
    ...(measuredOn ? { measuredOn } : {})
  })
  const params = {
    passed: 4,
    total: 8,
    grade: 'C',
    version: '1.0.6',
    measuredOn: STAMP,
    mustFix: [built('ROLE-1', 'Roles do not wear the system.', STAMP)],
    worthFixing: [],
    unmeasured: [built('IDENT-1', 'Not measured yet.'), built('MODE-1', 'Not measured yet.')],
    measuredPassed: [
      built('SCREEN-1', 'The first screen visibly changes: at most 1% keeps the template colours.', STAMP),
      built('CON-1', 'Every text reads on its ground under every system.', STAMP)
    ]
  }
  const road = WITH_CONTRACT_ROAD.map((s) => s).concat([
    { step: 'design-system', state: 'warn', code: 'ds-live-failing', params }
  ])
  const r = release('quickstart/ja-nova/j6', 'joomla', 'card', { version: '1.0.6', road })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="design-system"]')
  // the run is said ONCE above the groups (15/10/2026: a stamp under each of 40 rows was a wall)
  for (const id of ['ROLE-1', 'SCREEN-1', 'CON-1'])
    assert.ok(row.querySelector(`[data-road-rule="${id}"]`), `${id} is a row`)
  assert.equal(
    row.querySelector('[data-ds-run="Built site"]')?.textContent,
    `Built site measured on ${STAMP}`
  )
  assert.equal(row.querySelectorAll('[data-road-rule-measured]').length, 0, 'no row repeats the shared run')
  assert.ok(row.querySelector('[data-road-rules="passed"] [data-road-rule="SCREEN-1"]'), 'passed group')
  const notMeasured = row.querySelector('[data-road-rules="not-measured"]')
  assert.deepEqual(
    [...notMeasured.querySelectorAll('[data-road-rule]')].map((li) => li.getAttribute('data-road-rule')),
    ['IDENT-1', 'MODE-1']
  )
  assert.equal(notMeasured.querySelector('[data-road-rule-measured]'), null)
  assert.doesNotMatch(row.textContent, /[–—]/, 'no dash')
})

// Dev 14/10 (after #1333): Tracy Business EmDash 1.7.18 reads "A, 13/13 passed" with no rule rows. The
// server sends the eight built-site passes, each stamped from contracts/1.7.18/design-system-measurement.json,
// but a done step stayed shut, so the Passed group and its "Measured on" lines never showed.
test('Design system done (Tracy Business EmDash 1.7.18): the Passed group shows, closed, under its run said once', async () => {
  const STAMP = '1.7.18, 2026-10-13, imac'
  const BUILT = ['ROLE-1', 'SCREEN-1', 'CON-1', 'UNDO-1', 'FONT-1', 'IDENT-1', 'MODE-1', 'MODE-2']
  const params = {
    passed: 13,
    total: 13,
    grade: 'A',
    version: '1.7.18',
    measuredOn: STAMP,
    mustFix: [],
    worthFixing: [],
    unmeasured: [],
    measuredPassed: BUILT.map((id) => ({
      rule: id,
      text: `${id} passes.`,
      question: 'Built site',
      owner: 'contract',
      message: `${id} passes. Measured on ${STAMP}.`,
      fix: null,
      measuredOn: STAMP
    }))
  }
  const road = WITH_CONTRACT_ROAD.map((s) => s).concat([
    { step: 'design-system', state: 'done', code: 'ds-ready', params }
  ])
  const r = release('tracy-business/emdash-0.x', 'emdash', 'card', { version: '1.7.18', road })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="design-system"]')
  const passed = row.querySelector('[data-road-rules="passed"]')
  assert.ok(passed, 'a done step lists its Passed group')
  assert.deepEqual(
    [...passed.querySelectorAll('[data-road-rule]')].map((li) => li.getAttribute('data-road-rule')),
    BUILT
  )
  // the passes sit inside the closed Details fold; their run is said once above it
  const details = row.querySelector('[data-ds-details]')
  assert.equal(details.tagName, 'DETAILS')
  assert.equal(details.hasAttribute('open'), false, 'Details starts closed')
  assert.ok(details.contains(passed), 'Passed is inside Details')
  assert.equal(row.querySelectorAll('[data-ds-run]').length, 1)
  assert.equal(row.querySelector('[data-ds-run="Built site"]').textContent, `Built site measured on ${STAMP}`)
  assert.equal(row.querySelectorAll('[data-road-rule-measured]').length, 0)
  assert.equal(row.querySelector('[data-road-rules="must-fix"]'), null)
  assert.doesNotMatch(row.textContent, /[–—]/, 'no dash')
})

// PR 2 of 14/10/2026 ("/ops shows every template error when wearing a design system"): a failing preview
// rule says what each detector saw, on which system and scheme, the elements, and the fix; a static
// rule says the check's words and its fix; a preview not measured and a template with no demo are
// must-fix rows with their fix, never a silent pass.
test('Design system preview rows: what was seen, where (system/scheme, elements) and the fix; DEMO-1 and an unmeasured preview are must-fix', async () => {
  const STAMP = '1.0.3, 2026-10-14, imac'
  const params = {
    passed: 3,
    total: 7,
    grade: 'C',
    version: '1.0.3',
    measuredOn: STAMP,
    mustFix: [
      {
        rule: 'TPL-1',
        text: "The template's own colours stay visible in the preview under a system.",
        question: 'Preview',
        owner: 'contract',
        message: `No colour of the template's own stays visible under a system: blocks. Measured on ${STAMP}.`,
        fix: 'Let the auto palette map it.',
        measuredOn: STAMP,
        findings: [
          {
            kind: 'glare-band',
            what: 'a glare band of the template stays',
            on: ['Moxie/dark 2', 'Ink/light 1'],
            pages: ['/pricing 2', '/ 1'],
            sitewide: ['footer.t4-footer on every page'],
            where: ['section.hero', '.t4-footer'],
            fix: 'Point the band at the slot ground.'
          }
        ]
      },
      {
        rule: 'CON-2',
        text: 'The Add site preview of this version is not measured yet.',
        question: 'Preview',
        owner: 'contract',
        message: 'Every text of the preview reads under every system: not measured yet on 1.0.3.',
        fix: 'Measure the Add site preview with node apps/tracy-web/scripts/preview-check.mjs.',
        measuredOn: null,
        unmeasured: true
      },
      {
        rule: 'DEMO-1',
        text: 'No live demo on this server, so the Add site panel offers no design system for this template.',
        question: 'Preview',
        owner: 'ops',
        message:
          'No live demo on this server. The preview door answers 409 DS_PREVIEW_UNAVAILABLE (NO_DEMO) for it.',
        fix: 'Install the demo of this release on this server: press Install demo.',
        measuredOn: null
      }
    ],
    worthFixing: [
      {
        rule: 'CSS-2',
        text: 'Some palette colours do not follow the system (literals, or the wrong role).',
        question: 'Stylesheets',
        owner: 'template',
        message: 'css/template.css paints #c00 at .btn-primary.',
        fix: 'Read the slot there.'
      }
    ],
    unmeasured: [],
    measuredPassed: []
  }
  const road = WITH_CONTRACT_ROAD.map((s) => s).concat([
    { step: 'design-system', state: 'todo', code: 'ds-must-fix', params }
  ])
  const r = release('quickstart/ja-impact/j6', 'joomla', 'card', { version: '1.0.3', road })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="design-system"]')
  const must = row.querySelector('[data-road-rules="must-fix"]')
  assert.deepEqual(
    [...must.querySelectorAll('[data-road-rule]')].map((li) => li.getAttribute('data-road-rule')),
    ['TPL-1', 'CON-2', 'DEMO-1']
  )
  const tpl = must.querySelector('[data-road-rule="TPL-1"]')
  const finding = tpl.querySelector('[data-road-rule-finding="glare-band"]')
  assert.equal(
    finding.querySelector('[data-road-rule-what]').textContent,
    'A glare band of the template stays'
  )
  // the systems read by name and scheme, the count after a ×, grouped by system (15/10/2026)
  assert.equal(finding.querySelector('[data-road-rule-on]').textContent, 'Moxie dark ×2Ink light ×1')
  // the elements sit behind a closed disclosure
  const elements = finding.querySelector('details[data-road-rule-where]')
  assert.equal(elements.getAttribute('data-road-rule-where'), 'section.hero, .t4-footer')
  assert.equal(elements.hasAttribute('open'), false)
  // the page each finding is on (every declared page is measured, 15/10/2026)
  assert.equal(finding.querySelector('[data-road-rule-pages]').textContent, '/pricing ×2/ ×1')
  // an element shared by the pages is told once, not once per page (15/10/2026)
  assert.equal(
    finding.querySelector('[data-road-rule-sitewide]').textContent,
    'footer.t4-footer on every page'
  )
  assert.equal(
    finding.querySelector('[data-road-rule-fix]').textContent,
    'Fix: Point the band at the slot ground.'
  )
  // the detector's fix stands for the rule's: one Fix line, not two
  assert.equal(tpl.querySelectorAll('[data-road-rule-fix]').length, 1)
  const con = must.querySelector('[data-road-rule="CON-2"]')
  assert.match(con.querySelector('[data-road-rule-fix]').textContent, /^Fix: Measure the Add site preview/)
  const demo = must.querySelector('[data-road-rule="DEMO-1"]')
  assert.match(demo.querySelector('[data-road-rule-where]').textContent, /NO_DEMO/)
  assert.match(demo.querySelector('[data-road-rule-fix]').textContent, /Install demo/)
  // a static rule reads alike: the check's words, then its fix
  const css = row.querySelector('[data-road-rules="worth-fixing"] [data-road-rule="CSS-2"]')
  assert.equal(
    css.querySelector('[data-road-rule-where]').textContent,
    'css/template.css paints #c00 at .btn-primary.'
  )
  assert.equal(css.querySelector('[data-road-rule-fix]').textContent, 'Fix: Read the slot there.')
  // the prompt names where DEMO-1 is fixed, and the findings of TPL-1
  const prompt = row.querySelector('[data-road-prompt]').textContent
  assert.match(prompt, /DEMO-1 \(must fix, Preview, fix in \/ops on this server/)
  assert.match(prompt, /CON-2 \(must fix, not measured yet, Preview/)
  assert.match(
    prompt,
    /Found: a glare band of the template stays on Moxie\/dark 2, Ink\/light 1, site-wide footer\.t4-footer on every page, pages \/pricing 2, \/ 1 at section\.hero, \.t4-footer/
  )
  assert.doesNotMatch(row.textContent, /[–—]/, 'no dash')
})

// U1 of PR 2 (14/10/2026), rendered from real measurement files: a preview measured without its
// stylesheets (or not measured for the new kinds) held 21 to 24 preview rules as must-fix, each row
// repeating the same line, reason and long fix. They fold into one row naming every rule, and the
// prompt says the reason and the fix once; a rule with its own finding keeps its own row.
test('Design system: preview rules waiting for the same measurement fold into one row and one prompt line', async () => {
  const STAMP = '1.0.9, 2026-10-14, imac'
  const HOW =
    'Measure the Add site preview with node apps/tracy-web/scripts/preview-check.mjs and bring the file.'
  const REASON =
    'that run could not read it (the preview loaded without its stylesheets on Moxie/light (PREV-1): measure again once they load).'
  const held = (id, title) => ({
    rule: id,
    text: 'The Add site preview of this version is not measured yet.',
    question: 'Preview',
    owner: 'contract',
    // the server cuts the message to a length, so the tail after the stamp differs by title
    message: `${title}: ${REASON} Measured on ${STAMP}. ${HOW}`.slice(0, 200 + title.length),
    fix: HOW,
    measuredOn: null,
    unmeasured: true
  })
  const params = {
    passed: 2,
    total: 6,
    grade: 'C',
    version: '1.0.9',
    measuredOn: STAMP,
    mustFix: [
      {
        rule: 'PREV-1',
        text: 'The preview is not the page alone.',
        question: 'Preview',
        owner: 'contract',
        message: `The preview is the page alone: one document: stylesheets did not load. Measured on ${STAMP}.`,
        fix: 'Make every stylesheet load.',
        measuredOn: STAMP
      },
      held('TPL-1', "No colour of the template's own stays visible under a system"),
      held('IDENT-2', 'The logo reads on its ground in the preview under every system'),
      held('HOVER-1', 'Every button and link reads in its hover and focus state')
    ],
    worthFixing: [],
    unmeasured: [],
    measuredPassed: []
  }
  const road = WITH_CONTRACT_ROAD.map((s) => s).concat([
    { step: 'design-system', state: 'todo', code: 'ds-must-fix', params }
  ])
  const r = release('quickstart/ja-impact/wp7', 'wordpress', 'card', { version: '1.0.9', road })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const must = ui.host.querySelector('[data-road-step="design-system"] [data-road-rules="must-fix"]')
  assert.match(must.textContent, /^Must fix \(4\)/, 'the count is still every rule')
  assert.equal(
    must.querySelectorAll(':scope > ul > li').length,
    2,
    'PREV-1 alone, the three held rules folded'
  )
  const folded = must.querySelector('[data-road-rule-folded]')
  assert.equal(folded.getAttribute('data-road-rule-folded'), 'TPL-1 IDENT-2 HOVER-1')
  assert.equal(folded.querySelectorAll('[data-road-rule-fix]').length, 1, 'the fix once')
  assert.match(
    folded.querySelector('[data-road-rule-where]').textContent,
    /^That run could not read it \(the preview loaded without its stylesheets/
  )
  const prompt = ui.host.querySelector('[data-road-step="design-system"] [data-road-prompt]').textContent
  assert.match(prompt, /TPL-1, IDENT-2, HOVER-1 \(must fix, not measured yet, Preview/)
  assert.equal(prompt.split(HOW).length - 1, 1, 'the prompt says the fix once')
})

// 15/10/2026 ("look on dev and you will see it", Tracy Business): the Design system step was a wall of text.
// Rows from the real WordPress 1.3.6 and Joomla 1.2.3 reports: 27 preview rules not measured, each message
// clipped by the server at a different word, fold into ONE card; a system's UUID never reaches the screen;
// a row whose run differs from its source's says its own run.
test('Design system (Tracy Business): clipped not-measured messages fold into one card, no raw system id, a stray run stays on its row', async () => {
  const REASON =
    'that run could not read it (not measured on 24 of 83 declared pages (/pl/, /nl/, /nb/, …) (pages: multilingual (40 locales): every default-locale page, every page of de and ru, the home page of every locale; 532 other locale copies are the same pages in another language and are not measured)'
  const HOW =
    'Measure the Add site preview with node apps/tracy-web/scripts/preview-check.mjs and bring the file.'
  const held = (id, title, cut) => ({
    rule: id,
    text: 'The Add site preview of this version is not measured yet.',
    question: 'Preview',
    owner: 'contract',
    message: `${title}: ${REASON}`.slice(0, cut) + '…',
    fix: HOW,
    measuredOn: null,
    unmeasured: true
  })
  const BUILT = '1.3.6, 2026-10-15 05:33 Dubai time, macbook-pro'
  const params = {
    passed: 2,
    total: 6,
    grade: 'C',
    version: '1.3.6',
    measuredOn: BUILT,
    mustFix: [
      held('TPL-1', "No colour of the template's own stays visible under a system", 330),
      held('CON-2', 'Every text of the preview reads under every system', 345),
      held('BTN-1', 'Every button keeps its shape under every system', 340)
    ],
    worthFixing: [
      {
        rule: 'BORDER-1',
        text: 'Grid or card lines on a dark ground are far harder than the system draws its borders.',
        question: 'Preview',
        owner: 'contract',
        message: 'No line on a dark ground is far harder than the border role.',
        fix: null,
        measuredOn: '1.3.6, 2026-10-15 17:01 Dubai time, macbook-pro, preview probe v7',
        findings: [
          {
            kind: 'hard-line',
            what: 'hard light lines on a dark ground',
            on: [
              'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671/light 1',
              'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671/dark 1'
            ],
            pages: ['/ 1'],
            where: ['figure.tb-hero__visual'],
            fix: 'Map the line to the border role of the slot.'
          }
        ]
      },
      {
        rule: 'GROUND-2',
        text: 'A full-width band stands out as a block under a system.',
        question: 'Preview',
        owner: 'contract',
        message: 'Every band stays quiet.',
        fix: 'Map the raised ground.',
        measuredOn: '1.3.5, 2026-10-01 10:00 Dubai time, imac, preview probe v6'
      }
    ],
    unmeasured: [],
    measuredPassed: [
      {
        rule: 'SCREEN-1',
        text: 'The first screen changes.',
        question: 'Built site',
        owner: 'contract',
        message: '',
        fix: null,
        measuredOn: BUILT
      }
    ]
  }
  const road = WITH_CONTRACT_ROAD.map((s) => s).concat([
    { step: 'design-system', state: 'warn', code: 'ds-live-failing', params }
  ])
  const r = release('tracy-business/wp7', 'wordpress', 'card', { version: '1.3.6', road })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="design-system"]')
  const must = row.querySelector('[data-road-rules="must-fix"]')
  assert.equal(must.querySelectorAll(':scope > ul > li').length, 1, 'three clipped rows, one card')
  const folded = must.querySelector('[data-road-rule-folded]')
  assert.equal(folded.getAttribute('data-road-rule-folded'), 'TPL-1 CON-2 BTN-1')
  const why = folded.querySelector('[data-road-rule-where]').textContent
  assert.match(why, /^That run could not read it \(not measured on 24 of 83 declared pages/)
  assert.match(why, /…$/, 'the part they all say, cut at a word')
  assert.equal(folded.querySelectorAll('[data-road-rule-fix]').length, 1)
  // the system reads as its library and short id, never the UUID
  const on = row.querySelector('[data-road-rule="BORDER-1"] [data-road-rule-on]').textContent
  assert.equal(on, 'Refero 5fd3b3b4 light ×1, dark ×1')
  assert.doesNotMatch(row.querySelector('[data-ds-rules]').textContent, /e4395636b671/)
  // two preview runs disagree: no shared Preview run, each preview row says its own
  assert.deepEqual(
    [...row.querySelectorAll('[data-ds-run]')].map((x) => x.getAttribute('data-ds-run')),
    ['Built site']
  )
  assert.match(
    row.querySelector('[data-road-rule="GROUND-2"] [data-road-rule-measured]').textContent,
    /^Measured on 1\.3\.5/
  )
  // the step's detail never repeats the run said above the groups
  assert.doesNotMatch(row.textContent, /Measured on 1\.3\.6, 2026-10-15 05:33 Dubai time, macbook-pro\./)
  assert.doesNotMatch(row.textContent, /[–—]/, 'no dash')
})

// 15/10/2026, second round ("still too long; the important part is only the paste block"): the
// step is a verdict line, the run once, the prompt as the main element (three lines, Show all, Copy
// copies the whole text), and every rule behind ONE closed "Details (n rules)", each rule one line
// that opens to its detail.
test('Design system: verdict, runs, the paste block up front, every rule behind one closed Details fold', async () => {
  const STAMP = '1.2.3, 2026-10-15 09:21 Dubai time, macbook-pro'
  const PREVIEW = '1.2.3, 2026-10-15 17:01 Dubai time, macbook-pro, preview probe v7'
  const params = {
    passed: 3,
    total: 5,
    grade: 'C',
    version: '1.2.3',
    measuredOn: STAMP,
    mustFix: [
      {
        rule: 'VARS-1',
        text: 'The quickstart does not declare every role variable.',
        question: 'Role variables',
        owner: 'template',
        message: 'Not scanned yet: the release carries no design-system-roles.json.',
        fix: 'Package the quickstart with the role scanner.',
        measuredOn: null
      }
    ],
    worthFixing: [
      {
        rule: 'BORDER-1',
        text: 'Grid or card lines on a dark ground are far harder than the system draws its borders.',
        question: 'Preview',
        owner: 'contract',
        message: 'No line on a dark ground is far harder.',
        fix: null,
        measuredOn: PREVIEW,
        findings: [
          {
            kind: 'hard-line',
            what: 'hard light lines on a dark ground',
            on: ['Figma/light 1', 'Figma/dark 1'],
            pages: ['/ 1'],
            where: ['figure.tb-hero__visual'],
            fix: 'Map the line to the border role of the slot.'
          }
        ]
      }
    ],
    unmeasured: [],
    measuredPassed: ['ROLE-1', 'SCREEN-1', 'CON-1'].map((id) => ({
      rule: id,
      text: `${id} passes.`,
      question: 'Built site',
      owner: 'contract',
      message: '',
      fix: null,
      measuredOn: STAMP
    }))
  }
  const road = WITH_CONTRACT_ROAD.map((s) => s).concat([
    { step: 'design-system', state: 'warn', code: 'ds-live-failing', params }
  ])
  const r = release('tracy-business/j6', 'joomla', 'card', { version: '1.2.3', road })
  const ui = await mount(lib.RoadToLive, { releases: [r], writable: true, onGo: noop, onChanged: noop })
  await ui.click(ui.host.querySelector('[data-road-release] [data-road-toggle]'))
  const row = ui.host.querySelector('[data-road-step="design-system"]')
  const step = row.querySelector('[data-ds-step]')
  // 1. one verdict line: the counts, must fix and worth fixing always
  assert.deepEqual(
    [...step.querySelectorAll('[data-ds-count]')].map((x) => [
      x.getAttribute('data-ds-count'),
      x.textContent
    ]),
    [
      ['must-fix', '1 must fix'],
      ['worth-fixing', '1 worth fixing'],
      ['passed', '3 passed']
    ]
  )
  assert.deepEqual(
    [...step.querySelectorAll('[data-ds-run]')].map((x) => x.textContent),
    [`Built site measured on ${STAMP}`, `Preview measured on ${PREVIEW}`]
  )
  // 2. the paste block comes before the Details fold, shut to three lines, Copy prominent
  const kids = [...step.children]
  const paste = step.querySelector('[data-ds-paste]')
  const details = step.querySelector('[data-ds-details]')
  assert.ok(kids.indexOf(paste) < kids.indexOf(details), 'the prompt comes first')
  assert.match(paste.textContent, /Paste into Claude Code/)
  assert.equal(paste.querySelector('[data-road-copy]').textContent, 'Copy prompt')
  const prompt = paste.querySelector('[data-road-prompt]')
  assert.match(prompt.className, /line-clamp-3/)
  assert.match(prompt.textContent, /VARS-1/)
  assert.match(
    prompt.textContent,
    /Found: hard light lines on a dark ground on Figma\/light 1, Figma\/dark 1/
  )
  await ui.click(paste.querySelector('[data-ds-paste-toggle]'))
  assert.doesNotMatch(
    paste.querySelector('[data-road-prompt]').className,
    /line-clamp-3/,
    'Show all opens it'
  )
  assert.equal(paste.querySelector('[data-ds-paste-toggle]').textContent, 'Show less')
  // 3. one closed fold holds every rule; a failing rule is one line that opens to its detail
  assert.equal(details.hasAttribute('open'), false)
  assert.match(details.querySelector('summary').textContent, /^Details \(5 rules\)$/)
  const border = details.querySelector('details[data-road-rule="BORDER-1"]')
  assert.equal(border.hasAttribute('open'), false, 'a rule starts as its line')
  assert.equal(
    border.querySelector('summary').textContent,
    'Grid or card lines on a dark ground are far harder than the system draws its borders.BORDER-1'
  )
  assert.equal(border.querySelector('[data-road-rule-on]').textContent, 'Figma light ×1, dark ×1')
  assert.equal(
    border.querySelector('[data-road-rule-fix]').textContent,
    'Fix: Map the line to the border role of the slot.'
  )
  assert.doesNotMatch(row.textContent, /[–—]/, 'no dash')
})
