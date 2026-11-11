/**
 * The Workspace card rows (#537): each row carries one muted description line under its title, with the full text in
 * a title attribute so a narrow column can truncate it. Business facts and the brief are one button each that opens
 * the sub-page, with no expand control; Sources still opens and folds in place. Mounted with React 18 in jsdom for the
 * presses.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-workspace-card.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { en as STRINGS } from '../src/client/strings.ts'

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
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://tracy.test/'
  })
  for (const name of [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'HTMLElement',
    'MouseEvent',
    'Event'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? dom.window : dom.window[name],
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-workspace-card-'))
  const outfile = path.join(outDir, 'card.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { WorkspaceCard } from './workspace-card.tsx'
        export { effectiveOf, stepperView } from './stepper-model.ts'
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

const t = (key, params = {}) =>
  (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => String(params[n] ?? `{${n}}`))

const DESCRIPTIONS = {
  sources: 'Where Tracy read about your business.',
  profile: 'What Tracy found, for you to check and approve.',
  brief: 'The words your site will use, for you to approve.',
  demo: 'The site Tracy builds from the approved brief.'
}

/** A finished place (research, facts and brief approved, site built) and one that has not started. */
function cardOf(started, onSection = () => {}) {
  const stepInput = started
    ? {
        research: { state: 'done', researchedAt: '2026-11-10T08:00:00Z', done: true },
        researchJob: { state: 'completed' },
        briefJob: null,
        brief: { id: 'b-1', n: 1, createdAt: '2026-11-10T10:00:00Z' },
        demo: 'ready',
        demoAt: '2026-11-11T09:00:00Z',
        approval: {
          profile: 'approved',
          profileApprovedAt: '2026-11-10T09:00:00Z',
          brief: 'approved',
          briefApprovedAt: '2026-11-10T11:00:00Z'
        }
      }
    : {
        research: { state: 'not_started', researchedAt: null, done: false },
        researchJob: { state: 'completed' },
        briefJob: null,
        brief: null,
        demo: 'none',
        demoAt: null,
        approval: { profile: 'none', brief: 'none' }
      }
  const effective = lib.effectiveOf(stepInput)
  const el = lib.createElement(lib.WorkspaceCard, {
    t,
    opportunityId: started ? 'o-1' : 'o-2',
    onSection,
    bodies: {
      sources: lib.createElement('p', { className: 'sources-body' }, 'the sources table'),
      demo: null
    },
    input: {
      stepper: lib.stepperView(stepInput),
      researchDone: stepInput.research.done,
      researchMoving: false,
      researchedAt: stepInput.research.researchedAt,
      sources: started ? ['collected', 'collected', 'collected'] : ['waiting'],
      fields: 4,
      brief: effective.brief == null ? null : { n: 1 },
      briefEmpty: null,
      demo: effective.demo,
      demoHost: started ? 'tennis-padel-coach.example.test' : null,
      locale: 'en-US'
    }
  })
  return el
}
const render = (started) => lib.renderToStaticMarkup(cardOf(started))

for (const [name, started] of [
  ['a finished place', true],
  ['a place that has not started', false]
]) {
  test(`${name}: every row renders its description under the title`, () => {
    const html = render(started)
    for (const [id, text] of Object.entries(DESCRIPTIONS)) {
      assert.match(html, new RegExp(`<span class="tracy-wo-ws-desc" title="${text}">${text}</span>`), id)
    }
    assert.equal((html.match(/tracy-wo-ws-desc/g) ?? []).length, 4)
    // The description sits inside the title column, after the name.
    assert.match(
      html,
      /tracy-wo-ws-main"><span class="tracy-wo-ws-name">[^]*?<\/span><span class="tracy-wo-ws-desc"/
    )
  })
}

test('the descriptions use no dash and do not mention steps', () => {
  for (const text of Object.values(DESCRIPTIONS)) {
    assert.equal(
      text.includes(String.fromCharCode(0x2013)) || text.includes(String.fromCharCode(0x2014)),
      false
    )
    assert.doesNotMatch(text, /\bstep\b/i)
  }
})

/** Mounts the finished place's card; returns the host, the sub-pages pressed open, a press and an unmount. */
async function mount() {
  const opened = []
  window.sessionStorage.clear()
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(cardOf(true, (id) => opened.push(id))))
  const press = (el) =>
    lib.act(async () => {
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
  const sec = (id) => host.querySelector(`[data-section="${id}"]`)
  const done = async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  }
  return { opened, press, sec, done }
}

test('Business facts and the brief have no expand control: the whole row opens the sub-page', async () => {
  const m = await mount()
  try {
    for (const id of ['profile', 'brief']) {
      const sec = m.sec(id)
      assert.equal(sec.querySelector('[aria-expanded]'), null, id)
      assert.equal(sec.querySelector('.tracy-wo-ws-chev'), null, id)
      assert.equal(sec.querySelector('.tracy-wo-ws-body'), null, id)
      const buttons = sec.querySelectorAll('button')
      assert.equal(buttons.length, 1, id)
      assert.ok(buttons[0].classList.contains('tracy-wo-ws-row'), id)
      // The Open pill is drawn inside that one button, and the summary stays.
      assert.match(buttons[0].querySelector('.tracy-wo-ws-pill').textContent, /Open/)
      assert.notEqual(buttons[0].querySelector('.tracy-wo-ws-sum').textContent, '')
    }
    // Pressing the name opens the sub-page, the same navigation as the pill.
    await m.press(m.sec('profile').querySelector('.tracy-wo-ws-name'))
    await m.press(m.sec('brief').querySelector('.tracy-wo-ws-pill'))
    assert.deepEqual(m.opened, ['profile', 'brief'])
    assert.equal(window.sessionStorage.length, 0)
  } finally {
    await m.done()
  }
})

test('Sources still opens and folds its body in place', async () => {
  const m = await mount()
  try {
    const toggle = m.sec('sources').querySelector('button[aria-expanded]')
    assert.ok(toggle)
    assert.ok(m.sec('sources').querySelector('.tracy-wo-ws-chev'))
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(m.sec('sources').querySelector('.sources-body'), null)
    await m.press(toggle)
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
    assert.equal(m.sec('sources').querySelector('.sources-body').textContent, 'the sources table')
    assert.deepEqual(m.opened, [])
  } finally {
    await m.done()
  }
})
