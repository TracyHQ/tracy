// Switch binding, measured on the product's own module in a real browser page.
//
// The module under test is `@tracy/core/ui-switches` (index.mjs + catalogue.json). It is bundled
// with esbuild into one script and loaded into a page whose `/api/ui` answers are intercepted by the
// fixture, so no deployment switch is ever pressed. The same bundle step runs on a scratch copy of
// the module for the RED proof (red.mjs), which is why `moduleDir` is a parameter.
//
// The expectations come from catalogue.json read directly in node plus the module's documented
// contract (an id the door lists as hidden rides on <html data-tracy-hide>; a locked switch keeps its
// default; a door failure keeps the defaults), never from what the bundle answered.

import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { REPO_ROOT, ensureDir, readJson, readRegular, writeAtomic } from './artifacts.mjs'
import { EnvError } from './browser.mjs'

const run = promisify(execFile)
export const MODULE_DIR = path.join(REPO_ROOT, 'packages/core/tracy-core/src/ui-switches')

export async function loadCatalogue(moduleDir = MODULE_DIR) {
  const doc = await readJson(path.join(moduleDir, 'catalogue.json'), { root: path.resolve(moduleDir, '..') })
  if (!Array.isArray(doc.switches) || doc.switches.length === 0)
    throw new Error('catalogue.json has no switches')
  return doc.switches
}

/** Bundle `moduleDir/index.mjs` into `workDir/bundle.js`; throws EnvError when esbuild is missing. */
export async function bundleModule(moduleDir, workDir) {
  await ensureDir(workDir)
  const entry = path.join(workDir, 'entry.mjs')
  await writeAtomic(
    entry,
    `import { uiSwitches, UI_SWITCHES } from ${JSON.stringify(path.join(moduleDir, 'index.mjs'))}\nwindow.QA = { uiSwitches, UI_SWITCHES }\n`
  )
  const esbuild = path.join(REPO_ROOT, 'node_modules/.bin/esbuild')
  const out = path.join(workDir, 'bundle.js')
  try {
    await run(
      esbuild,
      [entry, '--bundle', '--format=iife', '--platform=browser', `--outfile=${out}`, '--log-level=error'],
      { cwd: workDir }
    )
  } catch (error) {
    if (error.code === 'ENOENT') throw new EnvError('esbuild binary is missing', { probe: 'esbuild' })
    // A module that does not bundle is a broken scratch copy, not evidence about any switch.
    const bad = new Error(`bundle failed: ${String(error.stderr ?? error.message).slice(0, 400)}`)
    bad.code = 'BUNDLE_FAILED'
    throw bad
  }
  return { bundle: await readRegular(out, { root: workDir }), bundlePath: out }
}

const HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>qa-switches</title></head><body><script src="/bundle.js"></script></body></html>'

/** One scenario: the door answers with `door`, the page reads every switch. Fresh page per scenario. */
async function scenario(context, bundle, switches, door) {
  const page = await context.newPage()
  try {
    await page.route('http://qa.local/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: HTML })
      if (url.pathname === '/bundle.js')
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: bundle })
      if (url.pathname === '/api/ui') {
        if (door.kind === 'abort') return route.abort('failed')
        if (door.kind === 'status')
          return route.fulfill({ status: door.status, contentType: 'application/json', body: '{}' })
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ hidden: door.hidden })
        })
      }
      return route.fulfill({ status: 404, body: '' })
    })
    await page.goto('http://qa.local/', { waitUntil: 'load' })
    const tabs = [...new Set(switches.flatMap((s) => s.tabs ?? []))]
    return await page.evaluate(
      async ({ ids, tabs: tabList }) => {
        const s = window.QA.uiSwitches()
        await s.ready
        const policy = s.tabPolicy()
        return {
          attribute: document.documentElement.getAttribute('data-tracy-hide'),
          shown: Object.fromEntries(ids.map((id) => [id, s.isShown(id)])),
          allowed: Object.fromEntries(tabList.map((t) => [t, policy.isAllowed(t)])),
          listed: Object.fromEntries(tabList.map((t) => [t, policy.isListed(t)]))
        }
      },
      { ids: switches.map((s) => s.id), tabs }
    )
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * Measure every scenario. Returns { hidden: { [id]: reading }, doorDown: { 500, abort } }.
 * `only` limits the hidden-scenarios to some ids (RED proofs measure a handful).
 */
export async function measureSwitches(browser, { moduleDir = MODULE_DIR, workDir, only = null }) {
  const switches = await loadCatalogue(moduleDir)
  const { bundle } = await bundleModule(moduleDir, workDir)
  const context = await browser.newContext()
  try {
    const hidden = {}
    for (const s of switches) {
      if (only && !only.includes(s.id)) continue
      hidden[s.id] = await scenario(context, bundle, switches, { kind: 'list', hidden: [s.id] })
    }
    const doorDown = {
      status500: await scenario(context, bundle, switches, { kind: 'status', status: 500 }),
      abort: await scenario(context, bundle, switches, { kind: 'abort' })
    }
    return { switches, hidden, doorDown }
  } finally {
    await context.close().catch(() => {})
  }
}

const tokens = (attribute) => new Set((attribute ?? '').split(/\s+/).filter(Boolean))
const result = (violations) => ({ ok: violations.length === 0, vacuous: false, violations })

/** Oracle expectation for one switch under a scenario that lists `hiddenIds`. */
function expectedShown(s, hiddenIds) {
  return s.locked ? s.defaultOn : !hiddenIds.includes(s.id)
}

/** `reading` of a scenario where the door listed [id] as hidden. */
export function checkBinding(switchId, switches, reading) {
  if (!reading) return { ok: true, vacuous: true, violations: [] }
  const violations = []
  const attr = tokens(reading.attribute)
  for (const s of switches) {
    const want = expectedShown(s, [switchId])
    if (reading.shown[s.id] !== want) {
      violations.push({
        message: `isShown("${s.id}") is ${reading.shown[s.id]} but the contract says ${want} when the door hides "${switchId}"`,
        evidence: { id: s.id, got: reading.shown[s.id], want }
      })
    }
    if (attr.has(s.id) !== !want) {
      violations.push({
        message: `data-tracy-hide ${attr.has(s.id) ? 'carries' : 'lacks'} "${s.id}" but the contract says it should ${!want ? 'carry' : 'not carry'} it when the door hides "${switchId}"`,
        evidence: { id: s.id, attribute: reading.attribute }
      })
    }
  }
  return result(violations)
}

/** A door that fails must leave every switch at its catalogue default. */
export function checkDoorDown(switchId, switches, readings) {
  const violations = []
  for (const [name, reading] of Object.entries(readings)) {
    const s = switches.find((x) => x.id === switchId)
    const attr = tokens(reading.attribute)
    if (reading.shown[switchId] !== s.defaultOn)
      violations.push({
        message: `door ${name}: isShown("${switchId}") is ${reading.shown[switchId]}, catalogue default is ${s.defaultOn}`,
        evidence: { reading: name }
      })
    if (attr.has(switchId) !== !s.defaultOn)
      violations.push({
        message: `door ${name}: data-tracy-hide disagrees with the catalogue default of "${switchId}"`,
        evidence: { reading: name, attribute: reading.attribute }
      })
  }
  return result(violations)
}

/** tab-* turns a tab type off, launch-* delists it; only for an unlocked switch. */
export function checkTabPolicy(sw, reading) {
  const tabs = sw.tabs ?? []
  if (!reading || tabs.length === 0 || !/^(tab|launch)-/.test(sw.id))
    return { ok: true, vacuous: true, violations: [] }
  const violations = []
  for (const tab of tabs) {
    const isTab = sw.id.startsWith('tab-')
    const wantAllowed = isTab ? (sw.locked ? sw.defaultOn : false) : true
    const wantListed = isTab ? true : sw.locked ? sw.defaultOn : false
    if (reading.allowed[tab] !== wantAllowed)
      violations.push({
        message: `tabPolicy().isAllowed("${tab}") is ${reading.allowed[tab]}, expected ${wantAllowed} with "${sw.id}" off`,
        evidence: { tab }
      })
    if (reading.listed[tab] !== wantListed)
      violations.push({
        message: `tabPolicy().isListed("${tab}") is ${reading.listed[tab]}, expected ${wantListed} with "${sw.id}" off`,
        evidence: { tab }
      })
  }
  return result(violations)
}

/** Consumer check over file texts the caller already read: the id must appear in product code. */
export function checkConsumer(sw, texts) {
  const patterns = [
    new RegExp(`data-tracy-hide[~^*$|]?=["']?${sw.id}\\b`),
    new RegExp(`['"\`]${sw.id}['"\`]`)
  ]
  const tabDriven = sw.tabs?.length > 0 && /^(tab|launch)-/.test(sw.id)
  const found = texts
    .filter(
      (t) =>
        patterns.some((re) => re.test(t.text)) ||
        (tabDriven && /followTabPolicy\(|\.tabPolicy\(/.test(t.text))
    )
    .map((t) => t.file)
  if (found.length > 0) return { ok: true, vacuous: false, violations: [], consumers: found }
  return {
    ok: false,
    vacuous: false,
    violations: [
      { message: `no product code reads switch "${sw.id}" (static scan)`, evidence: { id: sw.id } }
    ],
    consumers: []
  }
}
