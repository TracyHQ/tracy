/**
 * The header of a Details sub-page (#537, option B with a round back button): one title row with the back button,
 * the title, the "Step n of 3" chip and the page's actions, and one muted line that says what the page is for. The
 * real SubPage is mounted with React 18 in jsdom. Every business in this file is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-sub-page-header.test.mjs
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
let dom
let pendingScheduler
before(async () => {
  pendingScheduler = setInterval(() => {}, 1000)
  const { JSDOM } = createRequire(path.join(fromStore('jsdom@', 'jsdom'), 'package.json'))('jsdom')
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'HTMLElement',
    'MouseEvent',
    'KeyboardEvent',
    'Event'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const Channel = globalThis.MessageChannel
  globalThis.MessageChannel = class extends Channel {
    constructor() {
      super()
      queueMicrotask(() => this.port1.unref())
    }
  }
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-subhead-'))
  const outfile = path.join(outDir, 'subhead.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { SubPage } from './details-sections.tsx'
        export { stepperView } from './stepper-model.ts'
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
  clearInterval(pendingScheduler)
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const RESEARCHED = { state: 'done', researchedAt: '2026-11-09T08:00:00Z', done: true }
const NAME = 'Harbour Kite Lessons'

/** Mounts a sub-page with the given steps input; records Details, approve and step presses. */
function mount({ section = 'profile', input, approval = null, stepAction = null, locked = false }) {
  const calls = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  lib.act(() =>
    root.render(
      lib.createElement(
        lib.SubPage,
        {
          t,
          section,
          name: NAME,
          view: lib.stepperView(input),
          stepAction,
          locked,
          onSection: (s) => calls.push(['section', s]),
          approval:
            approval === null
              ? null
              : { ...approval, onApprove: async () => (calls.push(['approve', approval.kind]), null) }
        },
        lib.createElement('p', null, 'content')
      )
    )
  )
  const press = (el) =>
    lib.act(async () => {
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
    })
  const done = () => lib.act(() => root.unmount())
  return { host, calls, press, done }
}

test('Business facts: title, Step 1 chip and the description; no count, no progress line, no breadcrumb', async () => {
  const page = mount({
    input: { research: RESEARCHED, demo: 'none', approval: { profile: 'needed', brief: 'none' } },
    approval: { kind: 'profile', pending: true, approvedLine: null }
  })
  const head = page.host.querySelector('.tracy-wo-subhead')
  const row = head.querySelector('.tracy-wo-subhead-row')
  assert.equal(row.querySelector('h2').textContent, '[details.section.profile]')
  assert.equal(
    row.querySelector(':scope > .tracy-wo-pill[data-pill="info"]').textContent,
    '[band.kicker{"n":1,"total":3}]'
  )
  assert.equal(head.querySelector('.tracy-wo-subhead-desc').textContent, '[subhead.desc.profile]')
  assert.equal(head.querySelector('.tracy-wo-subhead-count'), null)
  assert.equal(head.querySelector('ol, .tracy-wo-subhead-line'), null)
  assert.equal(page.host.querySelector('.tracy-wo-crumbs'), null)
  assert.equal(page.host.querySelector('.tracy-wo-progress-strip'), null)
  assert.equal(
    [...page.host.querySelectorAll('button')].some((b) => b.textContent === '[approve.back]'),
    false
  )
  page.done()
})

test('the round back button names the place and opens its Details page', async () => {
  const page = mount({ input: { research: RESEARCHED, demo: 'none', approval: { profile: 'needed' } } })
  const back = page.host.querySelector('.tracy-wo-subhead-row > button.tracy-wo-subhead-back')
  assert.equal(back.getAttribute('aria-label'), `[section.backTo{"name":"${NAME}"}]`)
  assert.equal(back.textContent, '')
  await page.press(back)
  assert.deepEqual(page.calls, [['section', null]])
  page.done()
})

test('the primary Approve stays at the end of the title row and still approves', async () => {
  const step = lib.createElement('button', { type: 'button', className: 'step-act' }, 'step')
  const page = mount({
    input: { research: RESEARCHED, demo: 'none', approval: { profile: 'needed' } },
    approval: { kind: 'profile', pending: true, approvedLine: null },
    stepAction: step
  })
  const acts = page.host.querySelector('.tracy-wo-subhead-row > .tracy-wo-subhead-acts')
  const buttons = [...acts.querySelectorAll('button')]
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    ['step', '[approve.continue]']
  )
  // No scroll gate: Approve is on at once, and no scroll note stands beside it.
  assert.equal(buttons[1].disabled, false)
  assert.doesNotMatch(acts.textContent, /scrollHint/)
  await page.press(buttons[1])
  assert.deepEqual(page.calls, [['approve', 'profile']])
  page.done()
})

test('the brief page: Step 2 chip and its own description', () => {
  const page = mount({
    section: 'brief',
    input: {
      research: RESEARCHED,
      brief: { id: 'b1', n: 1, createdAt: '2026-11-09T09:00:00Z' },
      demo: 'none',
      approval: { profile: 'approved', brief: 'needed' }
    },
    approval: { kind: 'brief', pending: true, approvedLine: null }
  })
  assert.equal(
    page.host.querySelector('.tracy-wo-subhead-row > .tracy-wo-pill[data-pill="info"]').textContent,
    '[band.kicker{"n":2,"total":3}]'
  )
  assert.equal(page.host.querySelector('.tracy-wo-subhead-desc').textContent, '[subhead.desc.brief]')
  page.done()
})

test('an approved page shows when it was approved, with no button', () => {
  const page = mount({
    input: {
      research: RESEARCHED,
      brief: { id: 'b1', n: 1, createdAt: '2026-11-09T09:00:00Z' },
      demo: 'ready',
      approval: { profile: 'approved', brief: 'approved' }
    },
    approval: { kind: 'profile', pending: true, approvedLine: 'Approved Nov 9' }
  })
  const acts = page.host.querySelector('.tracy-wo-subhead-acts')
  assert.equal(acts.querySelector('button'), null)
  assert.match(acts.textContent, /Approved Nov 9/)
  assert.equal(page.host.querySelector('.tracy-wo-subhead-desc').textContent, '[subhead.desc.profile.locked]')
  page.done()
})

test('the descriptions are formal English without dashes and never speak of steps', async () => {
  const { en } = await import('../src/client/strings.ts')
  for (const key of [
    'subhead.desc.profile',
    'subhead.desc.brief',
    'subhead.desc.profile.locked',
    'subhead.desc.brief.locked'
  ]) {
    assert.equal(typeof en[key], 'string')
    assert.doesNotMatch(en[key], /[\u2013\u2014]|\bstep|\bnext\b/i)
  }
  assert.equal(en['approve.continue'], 'Approve and continue')
  assert.equal(en['approve.scrollHint'], undefined)
})

test('an approved brief page says what the site says, as approved', () => {
  const page = mount({
    section: 'brief',
    input: {
      research: RESEARCHED,
      brief: { id: 'b1', n: 1, createdAt: '2026-11-09T09:00:00Z' },
      demo: 'none',
      approval: { profile: 'approved', brief: 'approved' }
    },
    approval: { kind: 'brief', pending: true, approvedLine: 'Approved Nov 9' }
  })
  assert.equal(page.host.querySelector('.tracy-wo-subhead-desc').textContent, '[subhead.desc.brief.locked]')
  page.done()
})

test('approved Business facts have no header button but still say they are approved', () => {
  const page = mount({
    input: { research: RESEARCHED, demo: 'none', approval: { profile: 'approved', brief: 'none' } },
    locked: true
  })
  assert.equal(page.host.querySelector('.tracy-wo-subhead-desc').textContent, '[subhead.desc.profile.locked]')
  page.done()
})
