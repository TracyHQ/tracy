/** Mounted production components, synthetic data and a controlled HTTP boundary. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'
const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(resolve(pkg, '../../../package.json'))
const original = new Map()
let lib, dom
before(async () => {
  dom = rootRequire('linkedom').parseHTML('<!doctype html><html><body></body></html>')
  const globals = {
    window: dom.window,
    document: dom.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Event: dom.window.Event,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: () => new Proxy({ getPropertyValue: () => '' }, { get: (o, k) => o[k] ?? '' }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: clearTimeout,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  for (const [key, value] of Object.entries(globals)) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  original.set('fetch', Object.getOwnPropertyDescriptor(globalThis, 'fetch'))
  dom.window.location = { pathname: '/ops/invitations', search: '', origin: 'http://harness.test' }
  dom.window.confirm = () => false
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents:
        "export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client'; export { RealCampaign } from './RealCampaign'; export { Invitations } from './Invitations';",
      resolveDir: resolve(pkg, 'src/invitations'),
      loader: 'tsx'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    loader: { '.css': 'empty' },
    plugins: [opsI18nPlugin()],
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports)
  lib = module.exports
})
after(() => {
  for (const [key, value] of original) {
    if (value) Object.defineProperty(globalThis, key, value)
    else delete globalThis[key]
  }
})
const groups = Array.from({ length: 5 }, (_, i) => ({
  key: `group_${i + 1}`,
  label: `Synthetic group ${i + 1}`
}))
function fixture() {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Private synthetic campaign',
    revision: 1,
    sourceDate: '2026-10-07',
    firstImportedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    counts: { total: 1340, groups: [318, 276, 103, 351, 292], suppressed: 42, recheck: 1298 },
    sendingEnabled: false,
    eligibleNow: null
  }
}
const row = {
  id: 'recipient-a',
  email: 'synthetic@example.test',
  firstName: 'there',
  group: 'group_1',
  groupLabel: 'Synthetic group 1',
  state: 'recheck',
  contentStatus: 'draft',
  reasons: ['SOURCE_ASSERTIONS_UNKNOWN']
}
const draft = {
  subject: 'Saved synthetic subject',
  html: '<p>Saved synthetic body</p>',
  bodyText: 'Saved synthetic fallback',
  assets: [],
  revision: 1,
  templateVersion: 1,
  reviewedTemplateVersion: 1,
  customized: true,
  contentApproved: false,
  stale: false,
  sendingEnabled: false
}
async function mount({
  writable = true,
  empty = false,
  handler,
  props = {},
  component = 'RealCampaign'
} = {}) {
  const c = fixture(),
    calls = []
  const detail = {
    ...row,
    rawSource: {
      headers: Array.from({ length: 43 }, (_, i) => `column_${i}`),
      values: Array.from({ length: 43 }, (_, i) => `Synthetic value ${i}`)
    },
    values: {},
    draft
  }
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api/ops/invitations/real', '')
    calls.push({ path, options })
    const custom = await handler?.(path, options)
    if (custom) return custom
    const data =
      path === ''
        ? {
            enabled: true,
            writable,
            groups,
            sendingEnabled: false,
            campaigns: empty ? [] : [{ ...c, ...(writable ? {} : { name: undefined }) }]
          }
        : path === '/settings'
          ? { days: 30 }
          : path === `/campaigns/${c.id}`
            ? c
            : path.endsWith('/recipients/query')
              ? { items: [row], revision: c.revision, nextCursor: 'synthetic-next', total: 1340 }
              : path.endsWith(`/recipients/${row.id}`)
                ? detail
                : path.endsWith('/fields')
                  ? { revision: 1, fields: [], campaignValues: {}, groupValues: {} }
                  : path.includes('/templates/')
                    ? null
                    : null
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  }
  const host = dom.document.createElement('div')
  dom.document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(lib.createElement(lib[component], props)))
  return {
    host,
    calls,
    c,
    detail,
    render: async (props) => lib.act(async () => root.render(lib.createElement(lib[component], props))),
    close: async () => {
      await lib.act(async () => root.unmount())
      host.remove()
    }
  }
}
const button = (host, label) => [...host.querySelectorAll('button')].find((b) => b.textContent === label)
const click = async (host, label) => {
  assert.ok(button(host, label), label)
  await lib.act(async () => button(host, label).click())
}
test('draft save keeps editors and navigation locked through the delayed detail refresh', async () => {
  let deliver,
    refresh = false
  const late = new Promise((resolve) => {
    deliver = resolve
  })
  const h = await mount({
    handler: (path) => {
      if (path.endsWith('/draft')) {
        refresh = true
        return new Response(JSON.stringify({ revision: 2 }))
      }
      if (refresh && path.endsWith(`/recipients/${row.id}`)) return late
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Recipients')
    await click(h.host, 'synthetic@example.test')
    await click(h.host, 'Review content')
    await click(h.host, 'Edit this email')
    const input = h.host.querySelector('textarea[aria-label="Draft HTML"]')
    await lib.act(async () => {
      input.value = '<p>My saved edit</p>'
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await click(h.host, 'Save this email')
    assert.equal(h.host.querySelector('textarea[aria-label="Draft HTML"]').disabled, true)
    assert.equal(button(h.host, 'Content / Templates').disabled, true)
    await lib.act(async () =>
      deliver(
        new Response(
          JSON.stringify({ ...h.detail, draft: { ...draft, html: '<p>My saved edit</p>', revision: 2 } })
        )
      )
    )
    const savedEditor = h.host.querySelector('textarea[aria-label="Draft HTML"]')
    // Linkedom does not initialize a remounted controlled textarea's native value.
    assert.equal(
      savedEditor[Object.keys(savedEditor).find((key) => key.startsWith('__reactProps$'))].value,
      '<p>My saved edit</p>'
    )
    assert.equal(h.host.querySelector('textarea[aria-label="Draft HTML"]').disabled, false)
  } finally {
    await lib.act(async () => deliver(new Response(JSON.stringify(h.detail))))
    await h.close()
  }
})
test('replacement continues across three explicitly confirmed batches and cancellation preserves the next cursor', async () => {
  const generated = []
  const h = await mount({
    handler: (path, opts) => {
      if (path.endsWith('/templates/group_1'))
        return new Response(
          JSON.stringify({ version: 2, subject: 'Hi', html: '<p>V2</p>', text: 'V2', assets: [] })
        )
      if (path.endsWith('/generate')) {
        const body = JSON.parse(opts.body)
        generated.push(body)
        return new Response(
          JSON.stringify({
            revision: generated.length + 1,
            created: generated.length === 3 ? 30 : 100,
            kept: 0,
            nextCursor: generated.length === 1 ? 'after-100' : generated.length === 2 ? 'after-200' : null
          })
        )
      }
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Content / Templates')
    const replace = () =>
      [...h.host.querySelectorAll('button')].find((b) =>
        /Replace .*drafts|Continue replacing/.test(b.textContent)
      )
    const press = () => lib.act(async () => replace().click())
    dom.window.confirm = () => true
    await press()
    assert.match(replace().textContent, /Continue replacing/)
    dom.window.confirm = () => false
    await press()
    assert.equal(generated.length, 1)
    dom.window.confirm = () => true
    await press()
    await press()
    assert.deepEqual(
      generated.map((r) => r.cursor),
      [null, 'after-100', 'after-200']
    )
    assert.ok(generated.every((r) => r.replaceExisting === true && r.limit === 100))
    assert.match(h.host.textContent, /Group replacement complete/)
  } finally {
    dom.window.confirm = () => false
    await h.close()
  }
})
test('template save keeps group and editor locked until refresh and ignores a refresh after unmount', async () => {
  let deliver,
    refresh = false
  const late = new Promise((resolve) => {
    deliver = resolve
  })
  const savedTemplate = { version: 1, subject: 'Hi', html: '<p>Template A</p>', text: 'A', assets: [] }
  const h = await mount({
    handler: (path) => {
      if (path.endsWith('/templates/edit')) {
        refresh = true
        return new Response(JSON.stringify({ revision: 2 }))
      }
      if (path.endsWith('/templates/group_1'))
        return refresh ? late : new Response(JSON.stringify(savedTemplate))
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Content / Templates')
    const input = h.host.querySelector('textarea[aria-label="Template HTML"]')
    await lib.act(async () => {
      input.value = '<p>Edited A</p>'
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await click(h.host, 'Save template version')
    assert.equal(h.host.querySelector('select[aria-label="Template group"]').disabled, true)
    assert.equal(h.host.querySelector('textarea[aria-label="Template HTML"]').disabled, true)
    await h.render({ campaignId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    await lib.act(async () =>
      deliver(new Response(JSON.stringify({ ...savedTemplate, html: '<p>Late old template</p>' })))
    )
    assert.ok(!h.host.querySelector('textarea[aria-label="Template HTML"]'))
  } finally {
    await lib.act(async () => deliver(new Response(JSON.stringify(savedTemplate))))
    await h.close()
  }
})
test('empty and developer views expose no PII editors or send controls', async () => {
  for (const options of [{ empty: true }, { writable: false }]) {
    const h = await mount(options)
    try {
      assert.match(h.host.textContent, /Reading sending status/)
      // Only a writer reads the sending switch; a developer's view never asks.
      assert.equal(
        h.calls.some((call) => call.path === '/sending'),
        options.writable !== false
      )
      assert.doesNotMatch(h.host.textContent, /synthetic@example.test/)
      if (!options.writable && !options.empty)
        assert.doesNotMatch(h.host.textContent, /Private synthetic campaign/)
      assert.ok(!button(h.host, 'Send') || button(h.host, 'Send').disabled)
      assert.ok(!h.calls.some((call) => call.path.includes('/gmail')))
      if (options.empty)
        assert.ok(!button(h.host, 'Content / Templates') || button(h.host, 'Content / Templates').disabled)
    } finally {
      await h.close()
    }
  }
})
test('recipient detail keeps all 43 fields and failed draft save preserves edits and dirty navigation', async () => {
  const h = await mount({
    handler: (path) =>
      path.endsWith('/draft')
        ? new Response(JSON.stringify({ code: 'REAL_STALE_REVISION' }), { status: 409 })
        : null
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Recipients')
    await click(h.host, 'synthetic@example.test')
    assert.equal(h.host.querySelectorAll('[data-source-field]').length, 43)
    await click(h.host, 'Review content')
    await click(h.host, 'Edit this email')
    const input = h.host.querySelector('textarea[aria-label="Draft HTML"]')
    assert.ok(input)
    await lib.act(async () => {
      input.value = '<p>Unsaved private synthetic body</p>'
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await click(h.host, 'Save this email')
    assert.match(h.host.textContent, /REAL_STALE_REVISION/)
    assert.equal(input.value, '<p>Unsaved private synthetic body</p>')
    const event = new dom.window.Event('tracy:before-ops-navigation', { cancelable: true })
    dom.window.dispatchEvent(event)
    assert.equal(event.defaultPrevented, true)
    assert.equal(input.value, '<p>Unsaved private synthetic body</p>')
  } finally {
    await h.close()
  }
})
test('CSV upload previews counts before committing and never uploads merely on file selection', async () => {
  const h = await mount({
    empty: true,
    handler: (path) =>
      path === '/imports/preview'
        ? new Response(
            JSON.stringify({
              previewId: 'synthetic-preview',
              digest: 'synthetic-digest',
              revision: 0,
              counts: fixture().counts,
              issues: [],
              expiresAt: new Date(Date.now() + 60000).toISOString()
            })
          )
        : path === '/imports/commit'
          ? new Response(JSON.stringify(fixture()), { status: 201 })
          : null
  })
  try {
    await click(h.host, 'Import')
    const file = h.host.querySelector('input[type="file"]')
    assert.ok(file)
    const selected = new Blob(['email,nhom_gui\nsynthetic@example.test,group_1'])
    Object.defineProperty(file, 'files', { value: [selected], configurable: true })
    await lib.act(async () => file.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
    assert.equal(h.calls.filter((c) => c.path === '/imports/preview').length, 0)
    await click(h.host, 'Preview CSV')
    assert.match(h.host.textContent, /1,340|1340/)
    assert.equal(h.calls.filter((c) => c.path === '/imports/commit').length, 0)
    await click(h.host, 'Confirm import')
    assert.equal(h.calls.filter((c) => c.path === '/imports/commit').length, 1)
    assert.match(h.host.textContent, /Private synthetic campaign/)
  } finally {
    await h.close()
  }
})
test('late group responses never replace the current filter and the next page sends a cursor only in POST', async () => {
  let deliver,
    delay = false
  const late = new Promise((resolve) => {
    deliver = resolve
  })
  const h = await mount({
    handler: (path, opts) => {
      if (!path.endsWith('/recipients/query')) return null
      const input = JSON.parse(opts.body)
      if (delay && input.group === 'group_2') return late
      return new Response(
        JSON.stringify({
          items: [{ ...row, email: `${input.group || 'all'}@example.test` }],
          revision: 1,
          nextCursor: 'next',
          total: 1
        })
      )
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Recipients')
    const select = h.host.querySelector('select[aria-label="Recipient group"]')
    const change = async (value) =>
      lib.act(async () => {
        select.querySelector(`option[value="${value}"]`).selected = true
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      })
    delay = true
    await change('group_2')
    await change('group_1')
    await lib.act(async () =>
      deliver(
        new Response(
          JSON.stringify({
            items: [{ ...row, email: 'wrong-late@example.test' }],
            revision: 1,
            nextCursor: 'old',
            total: 1
          })
        )
      )
    )
    assert.doesNotMatch(h.host.textContent, /wrong-late/)
    assert.match(h.host.textContent, /group_1@example.test/)
    await click(h.host, 'Next page')
    assert.equal(
      JSON.parse(h.calls.filter((c) => c.path.endsWith('/recipients/query')).at(-1).options.body).cursor,
      'next'
    )
  } finally {
    await h.close()
  }
})
test('expiry or revoked access removes all customer details and editors from the mounted view', async () => {
  let revoke = false
  const h = await mount({
    handler: (path) =>
      revoke && path.includes('/campaigns/')
        ? new Response(JSON.stringify({ code: 'REAL_EXPIRED' }), { status: 410 })
        : null
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Recipients')
    await click(h.host, 'synthetic@example.test')
    assert.match(h.host.textContent, /Synthetic value 42/)
    revoke = true
    await click(h.host, 'Refresh')
    assert.doesNotMatch(
      h.host.textContent,
      /synthetic@example.test|Synthetic value 42|Private synthetic campaign/
    )
    assert.match(h.host.textContent, /REAL_EXPIRED/)
  } finally {
    await h.close()
  }
})

test('custom fields are configured in the campaign without deployment and ZIP preview never activates a template', async () => {
  let savedRegistry
  const h = await mount({
    handler: (path, opts) => {
      if (path.endsWith('/fields') && opts.method === 'POST') {
        savedRegistry = JSON.parse(opts.body).registry
        return new Response(JSON.stringify({ revision: 2, registryRevision: 2 }))
      }
      if (path.endsWith('/templates/preview'))
        return new Response(
          JSON.stringify({
            uploadId: 'synthetic-upload',
            warnings: ['REMOVED_SCRIPT'],
            unknownTokens: ['custom.opening'],
            preview: { html: '<p>Safe synthetic preview</p>', text: null, assets: [] },
            expiresAt: new Date(Date.now() + 60000).toISOString()
          })
        )
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Fields')
    const enter = async (label, value) =>
      lib.act(async () => {
        const input = h.host.querySelector(`[aria-label="${label}"]`)
        assert.ok(input, label)
        const key = Object.keys(input).find((key) => key.startsWith('__reactProps$'))
        input[key].onChange({ target: { value }, currentTarget: { value } })
      })
    await enter('New field key', 'opening')
    await enter('New field label', 'Opening line')
    await click(h.host, 'Add text field')
    assert.match(h.host.textContent, /custom.opening/)
    await click(h.host, 'Save fields')
    assert.equal(savedRegistry.fields[0].key, 'custom.opening')
    await click(h.host, 'Content / Templates')
    // The subject starts empty and is required before a preview.
    assert.equal(h.host.querySelector('[aria-label="Template subject"]').value, '')
    await enter('Template subject', 'Synthetic subject')
    const file = h.host.querySelector('input[type="file"]')
    Object.defineProperty(file, 'files', { value: [new Blob(['Synthetic ZIP'])], configurable: true })
    await lib.act(async () => file.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
    await click(h.host, 'Preview ZIP')
    assert.match(h.host.textContent, /REMOVED_SCRIPT/)
    assert.match(h.host.textContent, /Subject: Synthetic subject/)
    assert.match(h.host.textContent, /custom.opening/)
    assert.equal(h.calls.filter((c) => c.path.endsWith('/templates/commit')).length, 0)
    assert.equal(button(h.host, 'Confirm template').disabled, true)
    dom.window.confirm = () => true
    await click(h.host, 'Configure unknown fields')
    dom.window.confirm = () => false
    assert.match(h.host.textContent, /Add text field/)
  } finally {
    await h.close()
  }
})

test('a late registry read cannot reset an unsaved draft editor', async () => {
  let deliver
  const delayed = new Promise((resolve) => {
    deliver = resolve
  })
  const h = await mount({ handler: (path) => (path.endsWith('/fields') ? delayed : null) })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Recipients')
    await click(h.host, 'synthetic@example.test')
    await click(h.host, 'Review content')
    await click(h.host, 'Edit this email')
    const input = h.host.querySelector('textarea[aria-label="Draft HTML"]')
    await lib.act(async () => {
      input.value = '<p>Keep unsaved synthetic text</p>'
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await lib.act(async () =>
      deliver(new Response(JSON.stringify({ revision: 1, fields: [], campaignValues: {}, groupValues: {} })))
    )
    assert.equal(
      h.host.querySelector('textarea[aria-label="Draft HTML"]').value,
      '<p>Keep unsaved synthetic text</p>'
    )
    assert.equal(button(h.host, 'Save this email').disabled, false)
  } finally {
    await h.close()
  }
})
test('the real selector never calls sandbox transports and retention settings do not silently extend a campaign', async () => {
  const h = await mount({
    component: 'Invitations',
    handler: (path, options) =>
      path === '/settings' && options.method === 'POST' ? new Response(JSON.stringify({ days: 60 })) : null
  })
  try {
    await click(h.host, 'Real campaigns')
    assert.match(h.host.textContent, /Real campaign review/)
    const start = h.calls.length
    await click(h.host, 'Setup')
    const input = h.host.querySelector('input[aria-label="Retention days"]')
    assert.ok(input)
    const key = Object.keys(input).find((k) => k.startsWith('__reactProps$'))
    await lib.act(async () =>
      input[key].onChange({ target: { value: '60' }, currentTarget: { value: '60' } })
    )
    await click(h.host, 'Save retention')
    assert.equal(
      JSON.parse(
        h.calls.filter((c) => c.path === '/settings' && c.options.method === 'POST').at(-1).options.body
      ).days,
      60
    )
    assert.ok(!h.calls.slice(start).some((c) => /gmail|extend|simulate|send/.test(c.path)))
  } finally {
    await h.close()
  }
})

test('a late initial overview cannot switch the selected campaign after the parent selects another one', async () => {
  let deliver,
    initial = true
  const late = new Promise((resolve) => {
    deliver = resolve
  })
  const b = { ...fixture(), id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Second synthetic campaign' }
  const h = await mount({
    props: { campaignId: fixture().id },
    handler: (path) => {
      if (path === '' && initial) {
        initial = false
        return late
      }
      if (path === '')
        return new Response(
          JSON.stringify({ enabled: true, writable: true, groups, campaigns: [b], sendingEnabled: false })
        )
      if (path === `/campaigns/${b.id}`) return new Response(JSON.stringify(b))
      return null
    }
  })
  try {
    await h.render({ campaignId: b.id })
    assert.match(h.host.textContent, /Second synthetic campaign/)
    await lib.act(async () =>
      deliver(
        new Response(
          JSON.stringify({
            enabled: true,
            writable: true,
            groups,
            campaigns: [fixture()],
            sendingEnabled: false
          })
        )
      )
    )
    assert.doesNotMatch(h.host.textContent, /Private synthetic campaign/)
    assert.match(h.host.textContent, /Second synthetic campaign/)
  } finally {
    await h.close()
  }
})

test('a new template subject is an unsaved edit and cancelled navigation retains it', async () => {
  const h = await mount()
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Content / Templates')
    const input = h.host.querySelector('[aria-label="Template subject"]')
    const key = Object.keys(input).find((k) => k.startsWith('__reactProps$'))
    await lib.act(async () =>
      input[key].onChange({
        target: { value: 'Unsaved synthetic subject' },
        currentTarget: { value: 'Unsaved synthetic subject' }
      })
    )
    await click(h.host, 'Recipients')
    assert.equal(h.host.querySelector('[aria-label="Template subject"]')?.value, 'Unsaved synthetic subject')
    const unload = new dom.window.Event('beforeunload', { cancelable: true })
    dom.window.dispatchEvent(unload)
    assert.equal(unload.defaultPrevented, true)
  } finally {
    await h.close()
  }
})

test('campaign extension requires an explicit date and confirmation, independently of default retention', async () => {
  const h = await mount({
    handler: (path, options) =>
      path.endsWith('/extend')
        ? new Response(JSON.stringify({ revision: 2, expiresAt: JSON.parse(options.body).expiresAt }))
        : null
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Setup')
    const input = h.host.querySelector('[aria-label="Campaign expiry date"]')
    assert.ok(input)
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    await lib.act(async () => {
      input.value = date
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await click(h.host, 'Extend this campaign…')
    assert.equal(h.calls.filter((c) => c.path.endsWith('/extend')).length, 0)
    dom.window.confirm = () => true
    await click(h.host, 'Extend this campaign…')
    const sent = JSON.parse(h.calls.find((c) => c.path.endsWith('/extend')).options.body)
    assert.equal(sent.confirm, true)
    assert.equal(sent.revision, 1)
    assert.equal(sent.expiresAt, `${date}T23:59:59.999Z`)
  } finally {
    dom.window.confirm = () => false
    await h.close()
  }
})

test('focus admission still clears private data after a successful write changed the request generation', async () => {
  let revoked = false
  const h = await mount({
    handler: (path, options) => {
      if (path === '/settings' && options.method === 'POST') return new Response(JSON.stringify({ days: 31 }))
      if (path === `/campaigns/${fixture().id}` && revoked)
        return new Response(JSON.stringify({ code: 'REAL_FORBIDDEN' }), { status: 403 })
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Setup')
    const input = h.host.querySelector('[aria-label="Retention days"]'),
      key = Object.keys(input).find((k) => k.startsWith('__reactProps$'))
    await lib.act(async () =>
      input[key].onChange({ target: { value: '31' }, currentTarget: { value: '31' } })
    )
    await click(h.host, 'Save retention')
    revoked = true
    await lib.act(async () => dom.window.dispatchEvent(new dom.window.Event('focus')))
    assert.match(h.host.textContent, /Private data is unavailable/)
    assert.doesNotMatch(h.host.textContent, /Private synthetic campaign/)
  } finally {
    await h.close()
  }
})

test('duplicate pending draft saves publish once and keep the editor until the response arrives', async () => {
  let deliver
  const late = new Promise((resolve) => {
    deliver = resolve
  })
  const h = await mount({ handler: (path) => (path.endsWith('/draft') ? late : null) })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Recipients')
    await click(h.host, 'synthetic@example.test')
    await click(h.host, 'Review content')
    await click(h.host, 'Edit this email')
    const input = h.host.querySelector('[aria-label="Draft HTML"]')
    await lib.act(async () => {
      input.value = '<p>Pending synthetic edit</p>'
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    const save = button(h.host, 'Save this email'),
      key = Object.keys(save).find((k) => k.startsWith('__reactProps$'))
    await lib.act(async () => {
      save[key].onClick()
      save[key].onClick()
    })
    assert.equal(h.calls.filter((c) => c.path.endsWith('/draft')).length, 1)
    assert.equal(button(h.host, 'Save this email').disabled, true)
    assert.equal(input.value, '<p>Pending synthetic edit</p>')
    await lib.act(async () => deliver(new Response(JSON.stringify({ revision: 2, draftRevision: 2 }))))
  } finally {
    await h.close()
  }
})

test('Review content lists recipients on its own and shows the first email with its subject, no Recipients tab needed', async () => {
  const second = { ...row, id: 'recipient-b', email: 'second@example.test', contentStatus: 'draft' }
  const approved = []
  const h = await mount({
    handler: (path) => {
      if (path.endsWith('/recipients/query'))
        return new Response(JSON.stringify({ items: [row, second], revision: 1, nextCursor: null, total: 2 }))
      if (path.endsWith('/approve')) {
        approved.push(path)
        return new Response(JSON.stringify({ revision: 2 }))
      }
      if (path.endsWith(`/recipients/${second.id}`))
        return new Response(
          JSON.stringify({ ...h.detail, ...second, draft: { ...draft, subject: 'Second subject' } })
        )
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Review content')
    assert.match(h.host.textContent, /Subject: Saved synthetic subject/)
    assert.equal(h.host.querySelector('[aria-current="true"]')?.textContent.includes(row.email), true)
    await click(h.host, 'Approve content and go to next')
    assert.equal(approved.length, 1)
    assert.match(h.host.textContent, /Subject: Second subject/)
    assert.equal(h.host.querySelector('[aria-current="true"]')?.textContent.includes(second.email), true)
  } finally {
    await h.close()
  }
})

test('generating missing drafts runs every page in one press and shows group progress', async () => {
  const generated = []
  const h = await mount({
    handler: (path, opts) => {
      if (path.endsWith('/templates/group_1'))
        return new Response(
          JSON.stringify({ version: 1, subject: 'Hi', html: '<p>V1</p>', text: null, assets: [] })
        )
      if (path.endsWith('/drafts/progress'))
        return new Response(
          JSON.stringify({ groups: groups.map((g) => ({ key: g.key, total: 318, drafted: 100 })) })
        )
      if (path.endsWith('/generate')) {
        const body = JSON.parse(opts.body)
        generated.push(body)
        const n = generated.length
        return new Response(
          JSON.stringify({
            revision: n + 1,
            created: n === 3 ? 18 : 100,
            kept: 0,
            groupTotal: 318,
            groupDrafted: 100 + (n === 3 ? 218 : n * 100),
            nextCursor: n < 3 ? `after-${n}` : null
          })
        )
      }
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Content / Templates')
    assert.match(h.host.textContent, /100 of 318 recipients in this group have a draft/)
    await click(h.host, 'Generate missing drafts')
    assert.equal(generated.length, 3)
    assert.deepEqual(
      generated.map((g) => [g.cursor, g.revision]),
      [
        [null, 1],
        ['after-1', 2],
        ['after-2', 3]
      ]
    )
    assert.match(h.host.textContent, /All 318 recipients in this group have a draft/)
    assert.match(h.host.textContent, /218 drafts created/)
  } finally {
    await h.close()
  }
})

test('Send a test lists only the server test addresses and sends the approved email once per press', async () => {
  const sent = []
  const h = await mount({
    handler: (path, opts) => {
      if (path.split('?')[0] === '/sending')
        return new Response(
          JSON.stringify({
            mode: 'test',
            testRecipients: ['me@fixture.test', 'other@fixture.test'],
            testDailyLimit: 50,
            testUsed: 2,
            mailbox: {
              status: 'connected',
              address: 'sender@example.com',
              from: 'Sarah <sender@example.com>',
              send: true
            },
            customersEnabled: false
          })
        )
      if (path.endsWith(`/recipients/${row.id}`))
        return new Response(JSON.stringify({ ...h.detail, draft: { ...draft, contentApproved: true } }))
      if (path.endsWith('/sends'))
        return new Response(
          JSON.stringify({
            items: sent.map((s, i) => ({
              id: `send-${i}`,
              kind: 'test',
              to: s.to,
              subject: '[Test] Saved synthetic subject',
              state: 'sent',
              errorCode: null,
              draftRevision: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              gmailMessageId: 'g',
              reconcileAttempts: 0,
              nextReconcileAt: null
            }))
          })
        )
      if (path.endsWith('/send-test')) {
        sent.push(JSON.parse(opts.body))
        return new Response(JSON.stringify({ id: 'send-0', state: 'sent' }))
      }
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Review content')
    const options = [...h.host.querySelectorAll('[aria-label="Test address"] option')].map(
      (o) => o.textContent
    )
    assert.deepEqual(options, ['me@fixture.test', 'other@fixture.test'])
    assert.match(h.host.textContent, /2 of 50 test sends used/)
    await click(h.host, 'Send test')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'me@fixture.test')
    assert.equal(sent[0].draftRevision, draft.revision)
    assert.match(sent[0].requestKey, /^[0-9a-f-]{36}$/)
    assert.match(h.host.querySelector('[aria-label="Sends"]').textContent, /Test: Sent.*to me@fixture\.test/)
  } finally {
    await h.close()
  }
})

test('Send to customer asks once more, then posts no address; the server picks the customer', async () => {
  const sent = []
  const h = await mount({
    handler: (path, opts) => {
      if (path.split('?')[0] === '/sending')
        return new Response(
          JSON.stringify({
            mode: 'pilot',
            testRecipients: ['me@fixture.test'],
            testDailyLimit: 50,
            testUsed: 0,
            pilotMax: 20,
            pilotUsed: 3,
            opens: { tracked: 2, opened: 1 },
            // The server answers per-group numbers for the campaign it was asked about.
            campaignId: new URLSearchParams(path.split('?')[1] ?? '').get('campaign'),
            groups: [
              {
                group: 'group_1',
                sent: 2,
                opens: { tracked: 2, opened: 1 },
                clicks: { tracked: 2, clicked: 1 }
              },
              { group: 'group_2', sent: 1, opens: { tracked: 1, opened: 0 }, clicks: null }
            ],
            nextInvitationAt: null,
            mailbox: {
              status: 'connected',
              address: 'sender@example.com',
              from: 'Sarah <sender@example.com>',
              send: true
            },
            customersEnabled: true
          })
        )
      if (path.endsWith(`/recipients/${row.id}`))
        return new Response(JSON.stringify({ ...h.detail, draft: { ...draft, contentApproved: true } }))
      if (path.endsWith('/sends'))
        return new Response(
          JSON.stringify({
            items: sent.map(() => ({
              id: 'send-9',
              kind: 'invitation',
              to: 'customer@fixture.test',
              subject: 'Saved synthetic subject',
              state: 'sent',
              errorCode: null,
              draftRevision: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              gmailMessageId: 'g',
              reconcileAttempts: 0,
              nextReconcileAt: null,
              opens: { firstAt: new Date().toISOString(), count: 2 },
              clicks: { firstAt: new Date().toISOString(), count: 1 }
            }))
          })
        )
      if (path.endsWith('/send-invitation')) {
        sent.push(JSON.parse(opts.body))
        return new Response(JSON.stringify({ id: 'send-0', state: 'sent' }))
      }
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Review content')
    assert.match(h.host.textContent, /3 of 20 customer emails used/)
    assert.match(h.host.querySelector('[data-estimated-opens]').textContent, /1 of 2 sent customer emails/)
    await click(h.host, 'Send')
    assert.match(
      h.host.querySelector('[data-group-engagement]').textContent,
      /Synthetic group 1: 2 sent · opened 1 of 2 \(50%\) · clicked 1 of 2 \(50%\)Synthetic group 2: 1 sent · opened 0 of 1 \(0%\) · clicks not measured/
    )
    await click(h.host, 'Review content')
    await click(h.host, 'Send to customer')
    assert.equal(sent.length, 0)
    const yes = [...h.host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Yes, send to '))
    assert.ok(yes)
    await click(h.host, yes.textContent)
    assert.equal(sent.length, 1)
    assert.deepEqual(Object.keys(sent[0]).sort(), ['draftRevision', 'requestKey'])
    assert.match(
      h.host.querySelector('[aria-label="Sends"]').textContent,
      /Customer: Sent.*Opened \(estimated\)/
    )
    assert.match(h.host.textContent, /already been sent this invitation/)
  } finally {
    await h.close()
  }
})

test('Send lists approved emails, sends one after a confirmation and shows outcome and estimated opens', async () => {
  const posted = []
  const sends = []
  const status = () => ({
    mode: 'pilot',
    testRecipients: ['me@fixture.test'],
    testDailyLimit: 50,
    testUsed: 0,
    pilotMax: 100,
    pilotUsed: sends.length,
    nextInvitationAt: null,
    mailbox: {
      status: 'connected',
      address: 'sender@example.com',
      from: 'Sarah <sender@example.com>',
      send: true
    },
    customersEnabled: true,
    pilotMissing: [],
    opens: sends.length ? { tracked: 1, opened: 1 } : null
  })
  let refuse = true
  const h = await mount({
    handler: (path, opts) => {
      if (path.split('?')[0] === '/sending') return new Response(JSON.stringify(status()))
      if (path.endsWith('/recipients/query')) {
        posted.push(JSON.parse(opts.body))
        return new Response(
          JSON.stringify({
            items: [{ ...row, contentStatus: 'approved' }],
            revision: 1,
            nextCursor: null,
            total: 1
          })
        )
      }
      if (path.endsWith(`/recipients/${row.id}`))
        return new Response(JSON.stringify({ ...h.detail, draft: { ...draft, contentApproved: true } }))
      if (path.endsWith('/sends')) return new Response(JSON.stringify({ items: sends }))
      if (path.endsWith('/send-invitation')) {
        if (refuse) {
          refuse = false
          return new Response(JSON.stringify({ code: 'REAL_NOT_MEMBER' }), { status: 409 })
        }
        const body = JSON.parse(opts.body)
        assert.deepEqual(Object.keys(body).sort(), ['draftRevision', 'requestKey'])
        sends.push({
          id: 'send-1',
          recipientId: row.id,
          kind: 'invitation',
          to: row.email,
          subject: 'Saved synthetic subject',
          state: 'sent',
          errorCode: null,
          draftRevision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          gmailMessageId: 'g',
          reconcileAttempts: 0,
          nextReconcileAt: null,
          opens: { firstAt: new Date().toISOString(), count: 1 }
        })
        return new Response(JSON.stringify(sends[0]))
      }
      return null
    }
  })
  try {
    assert.match(h.host.querySelector('[data-sending-banner]').textContent, /Pilot sending on/)
    await click(h.host, 'Open campaign')
    await click(h.host, 'Send')
    assert.equal(posted.at(-1).content, 'approved')
    assert.match(h.host.textContent, /Estimated opens: not measured yet/)
    const sendButton = () =>
      [...h.host.querySelectorAll(`[data-send-row="${row.id}"] button`)].find((b) => b.textContent === 'Send')
    await lib.act(async () => sendButton().click())
    const yes = [...h.host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Yes, send to '))
    await click(h.host, yes.textContent)
    // A refusal stays on its row, with what it means; nothing was sent.
    assert.match(h.host.querySelector(`[data-send-row="${row.id}"]`).textContent, /aMember: no active plan/)
    assert.equal(sends.length, 0)
    await lib.act(async () => sendButton().click())
    await click(
      h.host,
      [...h.host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Yes, send to '))
        .textContent
    )
    const rowText = h.host.querySelector(`[data-send-row="${row.id}"]`).textContent
    assert.match(rowText, /Sent ·/)
    assert.match(rowText, /Opened \(estimated\)/)
    assert.ok(!sendButton())
    assert.match(
      h.host.querySelector('[data-estimated-opens]').textContent,
      /1 of 1 sent customer emails \(100%\)/
    )
    await click(h.host, 'Conversations')
    assert.match(h.host.querySelector('[data-conversations]').textContent, /Not available yet/)
  } finally {
    await h.close()
  }
})

test('Check eligibility asks page after page until done, then shows the stored answers', async () => {
  const pages = []
  let stored = {
    checkable: 1298,
    checked: 0,
    counts: { allow: 0, none: 0, unknown: 0 },
    oldest: null,
    newest: null,
    items: []
  }
  const h = await mount({
    handler: (path, opts) => {
      if (path.endsWith('/eligibility')) return new Response(JSON.stringify(stored))
      if (path.endsWith('/eligibility/check')) {
        const body = JSON.parse(opts.body)
        pages.push(body)
        const last = pages.length === 3
        if (last)
          stored = {
            ...stored,
            checked: 120,
            counts: { allow: 100, none: 15, unknown: 5 },
            oldest: new Date().toISOString(),
            newest: new Date().toISOString()
          }
        return new Response(
          JSON.stringify({
            checked: last ? 20 : 50,
            counts: {},
            nextCursor: last ? null : `c${pages.length}`
          })
        )
      }
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    assert.match(h.host.querySelector('[data-eligibility]').textContent, /Not checked yet\. 1298 recipients/)
    await click(h.host, 'Check eligibility')
    assert.deepEqual(
      pages.map((p) => p.cursor),
      [null, 'c1', 'c2']
    )
    assert.ok(pages.every((p) => p.limit === 50))
    assert.match(
      h.host.querySelector('[data-eligibility]').textContent,
      /100 with an active plan · 15 without · 5 not answered, of 120 checked/
    )
    assert.ok(button(h.host, 'Check eligibility again'))
  } finally {
    await h.close()
  }
})

test('Setup › Email format reads the server format and saves exactly the six switches', async () => {
  const saved = []
  let format = {
    oneClickHeader: true,
    footer: 'notice',
    messageIdDomain: 'tracy',
    html: 'full',
    openImage: true,
    clickTracking: false
  }
  const h = await mount({
    handler: (path, opts) => {
      if (path === '/mail-format') {
        if (opts.method === 'POST') {
          format = JSON.parse(opts.body)
          saved.push(format)
        }
        return new Response(JSON.stringify(format))
      }
      return null
    }
  })
  try {
    await click(h.host, 'Setup')
    const panel = h.host.querySelector('[data-mail-format]')
    assert.ok(panel)
    assert.equal(button(h.host, 'Save email format').disabled, true)
    const pick = (label, v) =>
      lib.act(async () => {
        const select = panel.querySelector(`select[aria-label="${label}"]`)
        select.querySelector(`option[value="${v}"]`).selected = true
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      })
    await pick('One-click unsubscribe headers', 'off')
    const footer = panel.querySelector('select[aria-label="Footer"]')
    await lib.act(async () => {
      footer.querySelector('option[value="personal"]').selected = true
      footer.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    // Turning clicks on warns about Gmail placement before it is saved.
    assert.equal(panel.querySelector('[role="note"]'), null)
    await pick('Estimated clicks', 'on')
    assert.match(panel.querySelector('[role="note"]').textContent, /still land in Primary/)
    await click(h.host, 'Save email format')
    assert.deepEqual(saved, [
      {
        oneClickHeader: false,
        footer: 'personal',
        messageIdDomain: 'tracy',
        html: 'full',
        openImage: true,
        clickTracking: true
      }
    ])
    assert.equal(panel.querySelector('[role="note"]'), null)
    assert.equal(button(h.host, 'Save email format').disabled, true)
  } finally {
    await h.close()
  }
})

test('Send approved: a number per group, asks once more, starts the server queue, and shows pause and resume', async () => {
  const posts = []
  const bodies = []
  let queue = {
    state: 'none',
    pauseReason: null,
    startedAt: null,
    groups: [],
    counts: { pending: 0, sent: 0, skipped: 0 },
    items: []
  }
  const h = await mount({
    handler: (path, opts) => {
      if (path.split('?')[0] === '/sending')
        return new Response(
          JSON.stringify({
            mode: 'pilot',
            testRecipients: ['me@fixture.test'],
            testDailyLimit: 50,
            testUsed: 0,
            pilotMax: 100,
            pilotUsed: 0,
            nextInvitationAt: null,
            mailbox: {
              status: 'connected',
              address: 'sender@example.com',
              from: 'Sarah <sender@example.com>',
              send: true
            },
            customersEnabled: true,
            pilotMissing: [],
            opens: null
          })
        )
      if (path.endsWith('/recipients/query'))
        return new Response(
          JSON.stringify({
            items: [{ ...row, contentStatus: 'approved' }],
            revision: 1,
            nextCursor: null,
            total: 1
          })
        )
      if (path.endsWith('/sends')) return new Response(JSON.stringify({ items: [] }))
      if (path.endsWith('/eligibility'))
        return new Response(
          JSON.stringify({
            checkable: 1,
            checked: 0,
            counts: { allow: 0, none: 0, unknown: 0 },
            oldest: null,
            newest: null,
            items: []
          })
        )
      if (path.endsWith('/queue')) return new Response(JSON.stringify(queue))
      for (const action of ['start', 'pause', 'resume'])
        if (path.endsWith(`/queue/${action}`)) {
          posts.push(action)
          bodies.push(JSON.parse(opts.body))
          const body = bodies.at(-1)
          queue = {
            ...queue,
            ...(action === 'start'
              ? {
                  groups: Object.entries(body.groups).map(([group, limit]) => ({
                    group,
                    limit,
                    sent: 0,
                    skipped: 0,
                    pending: 1
                  }))
                }
              : {}),
            state: action === 'pause' ? 'paused' : 'running',
            pauseReason: action === 'pause' ? 'BY_OPERATOR' : null,
            counts: { pending: 1, sent: 0, skipped: 0 }
          }
          return new Response(JSON.stringify(queue))
        }
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Send')
    // The Base UI input ignores synthetic DOM events under jsdom: call its React handler directly.
    const type = async (label, value) =>
      lib.act(async () => {
        const input = h.host.querySelector(`input[aria-label="How many to send in ${label}"]`)
        const props = input[Object.keys(input).find((k) => k.startsWith('__reactProps$'))]
        props.onChange({ target: { value }, currentTarget: { value } })
      })
    // Nothing typed: nothing to send.
    assert.equal(button(h.host, 'Type a number for a group').disabled, true)
    await type('Synthetic group 1', '0')
    assert.equal(button(h.host, 'Type a number for a group').disabled, true)
    assert.match(
      h.host.querySelector('[data-send-queue]').textContent,
      /from 1 to 10000 for Synthetic group 1/
    )
    await type('Synthetic group 1', '30')
    await type('Synthetic group 2', '20')
    await click(h.host, 'Send 50 approved')
    assert.deepEqual(posts, [])
    await click(h.host, 'Yes, send up to 30 in Synthetic group 1 and 20 in Synthetic group 2')
    assert.deepEqual(posts, ['start'])
    assert.deepEqual(bodies[0], { groups: { group_1: 30, group_2: 20 } })
    assert.match(
      h.host.querySelector('[data-send-queue]').textContent,
      /Sending: Synthetic group 1 0\/30 sent · Synthetic group 2 0\/20 sent · 2 waiting/
    )
    await click(h.host, 'Pause')
    assert.match(h.host.querySelector('[data-send-queue]').textContent, /Paused by you/)
    await click(h.host, 'Resume')
    assert.deepEqual(posts, ['start', 'pause', 'resume'])
    assert.deepEqual(bodies.slice(1), [{}, {}])
    // Pause again, then start over with group 2 only.
    await click(h.host, 'Pause')
    await type('Synthetic group 1', '')
    await click(h.host, 'Start again with these numbers (20)')
    await click(h.host, 'Yes, send up to 20 in Synthetic group 2')
    assert.deepEqual(bodies.at(-1), { groups: { group_2: 20 } })
  } finally {
    await h.close()
  }
})

test('Approve all works on the chosen group only, asks once more, and loops pages until done', async () => {
  const pages = []
  const h = await mount({
    handler: (path, opts) => {
      if (path.endsWith('/approve-group')) {
        const body = JSON.parse(opts.body)
        pages.push(body)
        const last = pages.length === 2
        return new Response(
          JSON.stringify({
            revision: body.revision + 1,
            approved: last ? 10 : 48,
            already: 0,
            skipped: last ? { NO_ACTIVE_PLAN: 1 } : { CUSTOMIZED: 2 },
            nextCursor: last ? null : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
          })
        )
      }
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    await click(h.host, 'Review content')
    assert.ok(![...h.host.querySelectorAll('button')].some((b) => b.textContent.startsWith('Approve all')))
    const select = h.host.querySelector('select[aria-label="Review group"]')
    await lib.act(async () => {
      select.querySelector('option[value="group_1"]').selected = true
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    const start = [...h.host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Approve all'))
    await click(h.host, start.textContent)
    assert.equal(pages.length, 0)
    const yes = [...h.host.querySelectorAll('button')].find((b) =>
      b.textContent.startsWith('Yes, approve all in')
    )
    await click(h.host, yes.textContent)
    assert.deepEqual(
      pages.map((p) => [p.group, p.cursor]),
      [
        ['group_1', null],
        ['group_1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']
      ]
    )
    assert.match(
      h.host.querySelector('[data-approve-all-result]').textContent,
      /58 approved · 0 already approved · 2 skipped \(edited by hand\) · 1 skipped \(no active plan at last aMember check\)/
    )
  } finally {
    await h.close()
  }
})

test('campaign settings show the campaign’s own groups and save the audience and a new group name', async () => {
  const own = [
    { key: 'group_1', label: 'Group A' },
    { key: 'group_2', label: 'Group B' },
    { key: 'group_3', label: 'Group C' }
  ]
  let saved = null
  const h = await mount({
    handler: (path, options) => {
      const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      const view = {
        ...fixture(),
        counts: { total: 6, groups: [2, 1, 3, 0, 0], suppressed: 0, recheck: 6 },
        groups: own,
        audience: 'active_plan'
      }
      if (path === `/campaigns/${id}/settings` && options.method === 'POST') {
        saved = JSON.parse(options.body)
        return new Response(
          JSON.stringify({
            ...view,
            revision: 2,
            audience: saved.audience,
            groups: own.map((g) => ({ ...g, label: saved.groupLabels[g.key] ?? g.label }))
          })
        )
      }
      if (path === `/campaigns/${id}`) return new Response(JSON.stringify(view))
      return null
    }
  })
  try {
    await click(h.host, 'Open campaign')
    assert.match(h.host.textContent, /Group A: 2/)
    assert.match(h.host.textContent, /Group C: 3/)
    assert.doesNotMatch(h.host.textContent, /Synthetic group 4/)
    assert.match(h.host.textContent, /Sends to: customers with an active plan/)
    assert.equal(button(h.host, 'Save settings').disabled, true)
    const past = h.host.querySelector('input[type="radio"][value="past_customers"]')
    await lib.act(async () => past.click())
    const name = h.host.querySelector('input[aria-label="Name of group_1"]')
    const key = Object.keys(name).find((k) => k.startsWith('__reactProps$'))
    await lib.act(async () =>
      name[key].onChange({
        target: { value: 'Expired since 2025' },
        currentTarget: { value: 'Expired since 2025' }
      })
    )
    await click(h.host, 'Save settings')
    assert.deepEqual(saved, {
      audience: 'past_customers',
      groupLabels: { group_1: 'Expired since 2025' },
      revision: 1
    })
    assert.match(h.host.textContent, /Sends to: past customers too/)
    assert.match(h.host.textContent, /Expired since 2025: 2/)
  } finally {
    await h.close()
  }
})
