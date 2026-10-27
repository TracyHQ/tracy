import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const rootRequire = createRequire(path.join(root, 'package.json'))
const source = path.join(root, 'packages/web/tracy-harness/src/invitations/content-state.ts')
let state = {}
if (existsSync(source)) {
  const built = await rootRequire('esbuild').build({
    entryPoints: [source],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  state = mod.exports
}
const campaign = {
  content: [
    {
      group: 'group_1',
      activeVersion: 2,
      versions: [
        { version: 1, subject: 'Old', bodyText: 'Old' },
        { version: 2, subject: 'Hello {{first_name}}', bodyText: 'Sandbox {{group}}' }
      ]
    }
  ],
  recipients: [
    { id: 'a', group: 'group_1', state: 'ready', draft: null },
    { id: 'b', group: 'group_1', state: 'draft', draft: { approved: true, templateVersion: 1 } },
    { id: 'c', group: 'group_1', state: 'suppressed', draft: { approved: false } },
    { id: 'd', group: 'group_1', state: 'simulated', draft: { approved: true } },
    { id: 'e', group: 'group_2', state: 'ready', draft: null }
  ]
}

/** Runs `body` with a linkedom DOM installed as globals, restoring them afterwards. */
async function withDom(body) {
  const { parseHTML } = rootRequire('linkedom')
  const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>')
  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    MutationObserver: window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: () =>
      new Proxy({ getPropertyValue: () => '' }, { get: (target, key) => (key in target ? target[key] : '') }),
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  const saved = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  try {
    return await body(window)
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

async function buildContentPanel() {
  const built = await rootRequire('esbuild').build({
    entryPoints: [path.join(path.dirname(source), 'ContentPanel.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    loader: { '.css': 'empty' },
    plugins: [opsI18nPlugin()],
    write: false
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  return mod.exports
}

test('content summary counts only the selected group and replacement excludes blocked recipients', () => {
  assert.equal(typeof state.contentSummary, 'function')
  assert.deepEqual(state.contentSummary(campaign, 'group_1'), {
    recipients: 4,
    drafts: 3,
    approved: 2,
    missing: 1,
    replaceable: 1,
    approvalsReset: 1,
    skipped: 2,
    versions: [1]
  })
  assert.equal(state.activeTemplate(campaign, 'group_1').version, 2)
  assert.equal(state.activeTemplate(campaign, 'group_2'), undefined)
})

test('attempted and duplicate recipients never appear in the generation scope', () => {
  const summary = state.contentSummary(
    {
      recipients: [
        { group: 'group_1', state: 'ready', draft: null, attempts: [{ id: 'already-attempted' }] },
        { group: 'group_1', state: 'duplicate', draft: null }
      ]
    },
    'group_1'
  )
  assert.equal(summary.missing, 0)
  assert.equal(summary.skipped, 2)
})

test('content panel renders saved text, group counts, plain preview controls and sandbox limitation', async () => {
  assert.ok(existsSync(path.join(path.dirname(source), 'ContentPanel.tsx')), 'ContentPanel exists')
  const { ContentPanel } = await buildContentPanel()
  const { createElement, act } = require('react')
  const { createRoot } = require('react-dom/client')
  const html = await withDom(async (window) => {
    const host = window.document.getElementById('root')
    const mounted = createRoot(host)
    await act(async () =>
      mounted.render(
        createElement(ContentPanel, {
          campaign,
          groups: [
            { key: 'group_1', label: 'First group' },
            { key: 'group_2', label: 'Second group' }
          ],
          writable: true,
          busy: false,
          onDirty() {},
          onSave: async () => {},
          onPreview: async () => {},
          onGenerate: async () => {}
        })
      )
    )
    const markup = host.innerHTML
    await act(async () => mounted.unmount())
    return markup
  })
  assert.match(html, /Hello \{\{first_name\}\}/)
  assert.match(html, /First group/)
  assert.match(html, /Synthetic/)
  assert.match(html, /Generate missing drafts/)
  assert.match(html, /Preview recipient/)
  assert.match(html, /No changes to save/)
  assert.match(html, /No changes to discard/)
  assert.doesNotMatch(html, /<iframe|<img/)
})

test('template validation rejects missing fields, header control characters, unsupported tokens and real links', () => {
  assert.equal(typeof state.templateErrors, 'function')
  assert.deepEqual(state.templateErrors('Hello {{first_name}}', 'Sandbox {{group}}'), {})
  assert.ok(state.templateErrors('', 'x').subject)
  assert.ok(state.templateErrors('Hello\r\nBcc: outsider', 'x').subject)
  assert.ok(state.templateErrors('Hello', '').bodyText)
  assert.ok(state.templateErrors('Hello {{email}}', 'x').subject)
  assert.ok(state.templateErrors('Hello', '{{unfinished').bodyText)
  assert.ok(state.templateErrors('Hello', 'https://real.example.com').bodyText)
})

test('template validation accepts reserved sandbox destinations and rejects real contacts and oversized body', () => {
  assert.deepEqual(
    state.templateErrors('Hello', 'https://invitations.invalid/sandbox synthetic@invitations.test'),
    {}
  )
  assert.ok(state.templateErrors('Hello', 'Contact marketing@example.com').bodyText)
  assert.ok(state.templateErrors('Hello', 'https://invitations.invalid.example.com').bodyText)
  assert.ok(state.templateErrors('Hello', 'x'.repeat(16001)).bodyText)
  assert.ok(state.templateErrors('Hello\u2028World', 'Body').subject)
})

test('a delayed preview for an earlier template version cannot replace the current version', async () => {
  const { createElement, act } = require('react')
  const { createRoot } = require('react-dom/client')
  const { ContentPanel } = await buildContentPanel()
  await withDom(async (window) => {
    const host = window.document.getElementById('root')
    const mounted = createRoot(host)
    let resolvePreview
    const delayed = new Promise((resolve) => {
      resolvePreview = resolve
    })
    let calls = 0
    const props = {
      campaign,
      groups: [{ key: 'group_1', label: 'First group' }],
      writable: true,
      busy: false,
      onDirty() {},
      onSave: async () => {},
      onGenerate: async () => {},
      onPreview: async () => {
        calls += 1
        return delayed
      }
    }
    try {
      await act(async () => mounted.render(createElement(ContentPanel, props)))
      const select = host.querySelector('select')
      await act(async () => {
        select.querySelector('option[value="a"]').selected = true
        select.dispatchEvent(new window.Event('change', { bubbles: true }))
      })
      const previewButton = () =>
        [...host.querySelectorAll('button')].find((button) => button.textContent === 'Preview saved template')
      assert.equal(previewButton().disabled, false)
      await act(async () => previewButton().click())
      assert.equal(calls, 1)
      const newer = {
        ...campaign,
        revision: 3,
        content: [
          {
            group: 'group_1',
            activeVersion: 3,
            versions: [{ version: 3, subject: 'Current template', bodyText: 'Current body' }]
          }
        ]
      }
      await act(async () => mounted.render(createElement(ContentPanel, { ...props, campaign: newer })))
      await act(async () => {
        resolvePreview({
          group: 'group_1',
          templateVersion: 2,
          subject: 'Obsolete returned subject',
          bodyText: 'Old preview'
        })
        await delayed
      })
      assert.doesNotMatch(host.textContent, /Obsolete returned subject/)
      assert.match(host.textContent, /Saved version 3/)
    } finally {
      await act(async () => mounted.unmount())
    }
  })
})
