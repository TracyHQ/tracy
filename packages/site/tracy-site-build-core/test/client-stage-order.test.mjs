/**
 * #811 F-S4-001 — the Build tab counts and fills by the stage list the host runs.
 *
 * The tab's progress counter and the skeleton's fill take their total from the client's own list of
 * stage names (`stages:` in each plugin's `src/client/index.tsx`), while the job they read carries
 * the host's (`STAGES` in `src/host/stages.mjs`). The Joomla client listed six for the host's seven
 * (no `language`) and the EmDash client two for the host's three (no `personalize`), so the last
 * stage ran under a full count, a bar past its end and a page drawn as finished.
 *
 * WHAT THIS FILE RUNS. Each plugin's real client entry, bundled in memory with the core's client
 * factory replaced by a recorder, so the configuration read is the one the plugin ships; the host's
 * real `STAGES`; and the core's real `BuildTab`, mounted with react-dom on a linkedom document over
 * a job that walks those stages. WHAT IT DOES NOT. No dsh, no lane, no browser: the frame is read
 * as its `srcdoc`, nothing is laid out, and no build runs.
 *
 *   node --test packages/site/tracy-site-build-core/test/client-stage-order.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { STAGES as EMDASH_STAGES } from '../../tracy-site-build-emdash/src/host/stages.mjs'
import { STAGES as JOOMLA_STAGES } from '../../tracy-site-build-joomla/src/host/stages.mjs'
import { STAGES as WORDPRESS_STAGES } from '../../tracy-site-build-wordpress/src/host/stages.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const siteRoot = path.resolve(pkgRoot, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.resolve(repoRoot, 'packages', 'core', 'tracy-core')
const pluginRequire = createRequire(path.join(siteRoot, 'tracy-site-build-joomla', 'package.json'))
// react-dom is `@tracy/core`'s dependency; pnpm resolves every package's react to one copy.
const coreRequire = createRequire(path.join(corePkg, 'package.json'))
const { parseHTML } = createRequire(path.join(repoRoot, 'package.json'))('linkedom')
const esbuild = pluginRequire('esbuild')

const PLUGINS = {
  joomla: { dir: 'tracy-site-build-joomla', host: JOOMLA_STAGES },
  emdash: { dir: 'tracy-site-build-emdash', host: EMDASH_STAGES },
  wordpress: { dir: 'tracy-site-build-wordpress', host: WORDPRESS_STAGES }
}

/**
 * What a plugin's client entry hands the core's factory, read by running that entry with the
 * factory replaced: `{ stages, en, ... }` exactly as shipped.
 */
async function clientSpec(dir) {
  const root = path.join(siteRoot, dir)
  const built = await esbuild.build({
    entryPoints: [path.join(root, 'src', 'client', 'index.tsx')],
    absWorkingDir: root,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react/jsx-runtime'],
    plugins: [
      {
        name: 'record-the-spec',
        setup(build) {
          build.onResolve({ filter: /^@tracy\/site-build-core\/client$/ }, () => ({
            path: 'recorder',
            namespace: 'recorder'
          }))
          build.onLoad({ filter: /.*/, namespace: 'recorder' }, () => ({
            contents:
              'export const CLIENT_INJECT = []; export const makeSiteBuildClient = (spec) => { globalThis.__buildSpec = spec; return () => {} }',
            loader: 'js'
          }))
          // The stylesheet and the icons are not what is read here.
          build.onResolve({ filter: /^\.\/styles$|^@tracy\/ui\/icons\// }, (args) => ({
            path: args.path,
            namespace: 'blank'
          }))
          build.onLoad({ filter: /.*/, namespace: 'blank' }, () => ({
            contents:
              'export const TAILWIND = ""; export const JoomlaIcon = () => null; export const EmdashIcon = () => null; export const WordPressIcon = () => null; export const WordpressIcon = () => null',
            loader: 'js'
          }))
        }
      }
    ]
  })
  delete globalThis.__buildSpec
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(pluginRequire, mod, mod.exports)
  const spec = globalThis.__buildSpec
  delete globalThis.__buildSpec
  assert.ok(spec, `${dir}: the client entry called the core's factory`)
  return spec
}

const GLOBALS = [
  'window',
  'document',
  'location',
  'fetch',
  'DOMParser',
  'sessionStorage',
  'HTMLElement',
  'Element',
  'Node',
  'IS_REACT_ACT_ENVIRONMENT'
]
const saved = new Map()
/** @type {any} */
let lib
/** @type {any} */
let dom
/** @type {(() => Promise<void>)[]} */
const cleanups = []
/** @type {Record<string, any>} */
const specs = {}

const FIXTURE =
  '<!doctype html><html><head></head><body><h1>Author headline</h1><p>Author paragraph of the page.</p><a>Author button</a></body></html>'
const SLOTS = [
  { id: 's1', role: 'headline', tag: 'h1', n: 0, words: 2 },
  { id: 's2', role: 'paragraph', tag: 'p', n: 0, words: 5 },
  { id: 's3', role: 'button', tag: 'a', n: 0, words: 2 }
]

before(async () => {
  for (const [name, plugin] of Object.entries(PLUGINS)) specs[name] = await clientSpec(plugin.dir)
  const built = await esbuild.build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { BuildTab } from './BuildTab'
        export { filledAt } from './skeleton'
        export { baseEn } from './strings'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html lang="en"><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('location', {
    origin: 'http://lane.test',
    href: 'http://lane.test/site.test/',
    pathname: '/site.test/'
  })
  set('DOMParser', window.DOMParser)
  set('HTMLElement', window.HTMLElement)
  set('Element', window.Element)
  set('Node', window.Node)
  const store = new Map()
  set('sessionStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k)
  })
  for (const [name, value] of Object.entries({
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id)
  }))
    if (typeof window[name] !== 'function') window[name] = value
  // The inspiration's page and its slots, and no site file: the skeleton draws bars for the words.
  set('fetch', async (input) => {
    const url = String(input)
    if (url.endsWith('/components.html')) return new Response(FIXTURE, { status: 200 })
    if (url.endsWith('/slots')) return Response.json({ slots: SLOTS })
    return Response.json({ present: false }, { status: 200 })
  })
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : pluginRequire(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
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

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

/** A job as the host reports it: every host stage, each in the status given. */
function jobOf(hostStages, statuses, status = 'running') {
  return {
    job: 'j-1',
    inspiration: 'sys-alpha',
    platform: 'x',
    status,
    startedAt: new Date().toISOString(),
    stages: hostStages.map((name, i) => ({ name, status: statuses[i] })),
    runs: 1
  }
}

/** Mount the real tab over one job and read what the building screen says. */
async function building(name, statuses, status = 'running') {
  const spec = specs[name]
  const job = jobOf(PLUGINS[name].host, statuses, status)
  const api = {
    stages: spec.stages,
    prefix: '/api/x',
    fetchAsk: async () => null,
    fetchJob: async () => job,
    readJob: async () => ({ state: 'job', job }),
    fetchDesignPlan: async () => null,
    fetchQuestions: async () => null,
    startBuild: async () => ({ ok: false, message: 'not in this test' }),
    sendAnswers: async () => false,
    reportProvision: async () => {},
    rerun: async () => false,
    shotUrl: () => '',
    fetchWorkspace: async () => null,
    sendComment: async () => ({ ok: false, message: '' }),
    inspect: async () => ({ ok: false, message: '' })
  }
  const table = { ...lib.baseEn, ...spec.en }
  const missing = []
  const t = (key, params = {}) => {
    if (!(key in table)) missing.push(key)
    return key in table ? table[key].replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? '')) : key
  }
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await lib.act(async () => {
    root.render(
      lib.createElement(lib.BuildTab, {
        spec: { api, platform: 'x', platformName: 'X' },
        meta: { siteKey: 'site.test' },
        t
      })
    )
  })
  for (let i = 0; i < 40 && !host.querySelector('.tabular-nums'); i += 1) await lib.act(async () => tick(5))
  for (let i = 0; i < 40 && !host.querySelector('iframe'); i += 1) await lib.act(async () => tick(5))
  const count = host.querySelector('.tabular-nums')
  assert.ok(count, `${name}: the building screen is on show`)
  const [done, total] = count.textContent.split(' of ').map(Number)
  const bar = host.querySelector('.h-1 > div')
  const width = Number(/width:\s*([\d.]+)%/.exec(bar.getAttribute('style') ?? '')?.[1])
  const frame = host.querySelector('iframe')
  // React writes the property name as the attribute on this DOM.
  const doc = frame?.getAttribute('srcDoc') ?? frame?.getAttribute('srcdoc') ?? null
  const headline = count.parentElement.querySelector('.font-medium').textContent
  return {
    done,
    total,
    width,
    doc,
    bars: doc === null ? null : (doc.match(/data-skel=/g) ?? []).length,
    headline,
    missing
  }
}

/** Statuses for "stage `at` is `now`, everything before it done, everything after pending". */
const walk = (stages, at, now = 'running') =>
  stages.map((_, i) => (i < at ? 'done' : i === at ? now : 'pending'))

for (const name of ['joomla', 'emdash', 'wordpress']) {
  test(`F-S4-001: the ${name} client lists the host's stages, in the host's order`, () => {
    assert.deepEqual([...specs[name].stages], [...PLUGINS[name].host])
  })

  test(`F-S4-001: every ${name} stage has its two lines, so none renders its own key`, () => {
    const table = { ...lib.baseEn, ...specs[name].en }
    for (const stage of PLUGINS[name].host) {
      assert.ok(table[`stage.${stage}.run`], `stage.${stage}.run`)
      assert.ok(table[`stage.${stage}.done`], `stage.${stage}.done`)
    }
  })

  test(`F-S4-001: while a ${name} stage runs, the count is below the total and the bar inside its track`, async () => {
    const host = PLUGINS[name].host
    for (let at = 0; at < host.length; at += 1) {
      for (const now of ['running', 'waiting', 'failed']) {
        const status = now === 'failed' ? 'failed' : now === 'waiting' ? 'waiting' : 'running'
        const seen = await building(name, walk(host, at, now), status)
        const where = `${host[at]} ${now}`
        assert.equal(seen.total, host.length, `${where}: the total is the host's`)
        assert.equal(seen.done, at, `${where}: done counts the stages behind`)
        assert.ok(seen.done < seen.total, `${where}: "${seen.done} of ${seen.total}"`)
        assert.ok(seen.width <= 100, `${where}: bar at ${seen.width}%`)
        assert.deepEqual(seen.missing, [], `${where}: every word has a line`)
        assert.doesNotMatch(seen.headline, /stage\./, `${where}: no raw key`)
      }
    }
  })

  test(`F-S4-001: a skipped ${name} stage counts as settled and the total still holds`, async () => {
    const host = PLUGINS[name].host
    // Everything but the last stage skipped or done, the last one running: one short of the total.
    const statuses = host.map((_, i) => (i === host.length - 1 ? 'running' : i % 2 ? 'skipped' : 'done'))
    const seen = await building(name, statuses)
    assert.equal(seen.done, host.length - 1)
    assert.equal(seen.total, host.length)
    assert.ok(seen.width <= 100)
  })

  test(`F-S4-001: the ${name} page keeps bars for its labels until the last stage runs`, async () => {
    const host = PLUGINS[name].host
    for (let at = 0; at < host.length; at += 1) {
      const seen = await building(name, walk(host, at))
      assert.ok(seen.doc, `${host[at]}: the frame has a page`)
      const last = at === host.length - 1
      const prose = at >= host.length - 2
      // Three slots: a headline and a paragraph (prose) and a button (a label).
      assert.equal(seen.bars, last ? 0 : prose ? 1 : 3, `${host[at]}: bars left on the page`)
      // The fill is asked with the same index and total the counter shows.
      const filled = lib.filledAt(at, seen.total)
      assert.equal(filled('button'), last)
      assert.equal(filled('headline'), prose)
    }
  })

  test(`F-S4-001: a paused ${name} job points at the first unsettled stage, never past the end`, async () => {
    const host = PLUGINS[name].host
    for (let at = 0; at < host.length; at += 1) {
      const seen = await building(name, walk(host, at, 'pending'), 'paused')
      assert.equal(seen.done, at)
      assert.ok(seen.done < seen.total && seen.width <= 100, `${host[at]}`)
    }
  })
}

test('a job with no stage data yet draws no count past its total', async () => {
  // The host has answered with the job but not started a stage: nothing is done.
  for (const name of ['joomla', 'emdash']) {
    const seen = await building(
      name,
      PLUGINS[name].host.map(() => 'pending')
    )
    assert.equal(seen.done, 0)
    assert.equal(seen.total, PLUGINS[name].host.length)
    assert.ok(seen.width <= 100)
  }
})
