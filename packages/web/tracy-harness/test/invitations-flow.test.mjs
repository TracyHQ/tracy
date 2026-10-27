/** Real Invitations screen with synthetic API responses; no database or network. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(pkgRoot, '../../..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const { parseHTML } = rootRequire('linkedom')
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))
const globals = [
  'window',
  'document',
  'location',
  'fetch',
  'MutationObserver',
  'HTMLElement',
  'Element',
  'Node',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'ResizeObserver',
  'IS_REACT_ACT_ENVIRONMENT'
]
const original = new Map()
const cleanups = []
let lib
let dom

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { createElement, act } from 'react';
        export { createRoot } from 'react-dom/client';
        export { Invitations } from './Invitations';`,
      resolveDir: path.join(pkgRoot, 'src/invitations'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [opsI18nPlugin()],
    write: false,
    logLevel: 'silent'
  })
  for (const name of globals) original.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('location', {
    origin: 'http://harness.test',
    href: 'http://harness.test/ops/invitations',
    pathname: '/ops/invitations',
    search: ''
  })
  dom.window.location = globalThis.location
  dom.window.history = { replaceState() {} }
  for (const name of ['MutationObserver', 'HTMLElement', 'Element', 'Node']) set(name, dom.window[name])
  set(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const styles = () =>
    new Proxy({ getPropertyValue: () => '' }, { get: (object, key) => (key in object ? object[key] : '') })
  set('getComputedStyle', styles)
  set('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0))
  set('cancelAnimationFrame', clearTimeout)
  set('IS_REACT_ACT_ENVIRONMENT', true)
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  dom.window.getComputedStyle = styles
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports)
  lib = module.exports
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
after(() => {
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

const at = '2026-10-09T00:00:00.000Z'
const draft = (approved = false) => ({
  subject: 'Saved fictional invitation',
  bodyText: 'Hello Sandbox Friend, this is a fictional invitation.',
  revision: 1,
  contentHash: 'fixture-content-hash',
  approved,
  templateGroup: 'group_1',
  templateVersion: 1,
  ...(approved
    ? {
        approval: {
          actor: 'owner@fixture.test',
          contentHash: 'fixture-content-hash',
          revision: 1,
          createdAt: at
        }
      }
    : {})
})
function campaignFixture() {
  const recipient = (id, group, fields = {}) => ({
    id,
    email: `${id}@fixture.test`,
    identities: [{ memberId: `sandbox-${id}` }],
    group,
    state: 'ready',
    firstName: 'Sandbox Friend',
    draft: null,
    messages: [],
    attempts: [],
    ...fields
  })
  return {
    id: 'campaign-fixture',
    name: 'Fictional campaign',
    revision: 7,
    counts: { recipients: 4, drafts: 2, approved: 1, simulated: 0, suppressed: 0 },
    recipients: [
      recipient('editable', 'group_1', { state: 'draft', draft: draft() }),
      recipient('approved', 'group_1', { state: 'draft', draft: draft(true) }),
      recipient('missing', 'group_2'),
      recipient('message-only', 'group_3', {
        messages: [
          {
            id: 'inbound-fixture',
            direction: 'inbound',
            bodyText: 'Fictional customer message',
            createdAt: at
          }
        ]
      })
    ],
    content: [1, 2].map((index) => ({
      group: `group_${index}`,
      activeVersion: 1,
      versions: [
        {
          version: 1,
          subject: `Fictional group ${index} template`,
          bodyText: 'Hello {{first_name}}, welcome to {{group}}.',
          createdAt: at
        }
      ]
    })),
    audit: [
      { id: 'audit-fixture', actor: 'owner@fixture.test', action: 'content', revision: 7, createdAt: at }
    ]
  }
}

async function mount({ rejectDraft = false } = {}) {
  let campaign = campaignFixture()
  const requests = []
  const unexpected = []
  const confirmations = []
  let confirmResult = false
  dom.window.confirm = (message) => {
    confirmations.push(message)
    return confirmResult
  }
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://harness.test')
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    const request = { path: url.pathname, method, body }
    requests.push(request)
    const base = '/api/ops/invitations'
    if (method === 'GET' && url.pathname === base)
      return json(200, {
        enabled: true,
        mode: 'sandbox',
        writable: true,
        groups: Array.from({ length: 5 }, (_, index) => ({
          key: `group_${index + 1}`,
          label: `Sandbox group ${index + 1}`
        })),
        campaigns: [
          { id: campaign.id, name: campaign.name, revision: campaign.revision, counts: campaign.counts }
        ],
        integrations: { gmail: 'not_connected', amember: 'not_connected', sendy: 'not_connected' }
      })
    if (method === 'GET' && url.pathname === `${base}/gmail`)
      return json(200, {
        status: 'not_connected',
        configured: false,
        address: null,
        from: null,
        read: false,
        send: false,
        generation: 0,
        lastVerifiedAt: null,
        lastSyncAt: null,
        errorCode: null,
        redirectUri: 'http://harness.test/api/ops/invitations/gmail/callback',
        sendingEnabled: false
      })
    if (method === 'GET' && url.pathname === `${base}/${campaign.id}`) return json(200, campaign)
    if (method === 'POST' && url.pathname === `${base}/${campaign.id}/content`) {
      const next = structuredClone(campaign)
      const content = next.content.find((row) => row.group === body.group)
      assert.ok(content, 'the selected fixture group has stored content')
      content.versions.push({ version: 2, subject: body.subject, bodyText: body.bodyText, createdAt: at })
      content.activeVersion = 2
      next.revision++
      next.audit.push({
        id: 'saved-content',
        actor: 'owner@fixture.test',
        action: 'content',
        revision: next.revision,
        createdAt: at
      })
      campaign = next
      return json(200, campaign)
    }
    if (method === 'POST' && url.pathname === `${base}/${campaign.id}/generate`) {
      const next = structuredClone(campaign)
      next.recipients[2] = {
        ...next.recipients[2],
        state: 'draft',
        draft: {
          subject: 'Revised group two template',
          bodyText: 'Hello Sandbox Friend, welcome to group_2.',
          revision: 1,
          contentHash: 'generated-fixture-hash',
          approved: false,
          templateGroup: 'group_2',
          templateVersion: 2
        }
      }
      next.revision++
      next.counts.drafts = 3
      next.audit.push({
        id: 'generated-draft',
        actor: 'owner@fixture.test',
        action: 'generate',
        revision: next.revision,
        createdAt: at
      })
      campaign = next
      return json(200, campaign)
    }
    if (
      method === 'POST' &&
      url.pathname === `${base}/${campaign.id}/recipients/editable/draft` &&
      rejectDraft
    )
      return json(409, { code: 'stale_revision' })
    unexpected.push(request)
    return json(500, { code: 'unexpected_fixture_request' })
  }
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
    assert.deepEqual(unexpected, [], 'all requests stay inside the synthetic API contract')
  })
  const settle = () => lib.act(async () => tick())
  await lib.act(async () => root.render(lib.createElement(lib.Invitations)))
  await settle()
  const button = (name, scope = host) => {
    const found = [...scope.querySelectorAll('button')].find((element) => element.textContent.trim() === name)
    assert.ok(found, `button ${name} exists`)
    return found
  }
  const press = async (element) => {
    assert.equal(element.disabled, false, `button ${element.textContent.trim()} is enabled`)
    await lib.act(async () => {
      element.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
      await tick()
    })
    await settle()
  }
  const ui = {
    host,
    requests,
    confirmations,
    button,
    press,
    confirm(value) {
      confirmResult = value
    },
    async view(name) {
      await press(button(name, host.querySelector('[aria-label="Invitation views"]')))
    },
    async type(element, value) {
      assert.ok(element, 'input exists')
      assert.equal(element.disabled, false, 'input is editable')
      // As in question-actions.test.mjs, exercise React's own change handler because
      // linkedom does not implement the browser input-value tracker.
      const propsKey = Object.keys(element).find((key) => key.startsWith('__reactProps$'))
      await lib.act(async () => {
        element.value = value
        element[propsKey].onChange({ target: { value }, currentTarget: { value } })
      })
      await settle()
    },
    field(label) {
      const element = [...host.querySelectorAll('label')].find((item) => item.textContent.trim() === label)
      assert.ok(element, `label ${label} exists`)
      return dom.document.getElementById(element.getAttribute('for'))
    },
    async openRecipient(email) {
      const row = [...host.querySelectorAll('tbody tr')].find((element) =>
        element.textContent.includes(email)
      )
      assert.ok(row, `recipient ${email} exists`)
      await press(button('Open', row))
    },
    listed() {
      return [...host.querySelectorAll('tbody tr')].map((row) => row.querySelector('td').textContent)
    }
  }
  await press(button('Fictional campaign'))
  return ui
}

test('saving group two keeps its selection and generation posts that group then opens Review emails', async () => {
  const ui = await mount()
  await ui.view('Content / Templates')
  const groups = ui.host.querySelector('[aria-label="Template groups"]')
  const groupTwo = [...groups.querySelectorAll('button')].find((button) =>
    button.textContent.includes('Sandbox group 2')
  )
  await ui.press(groupTwo)
  await ui.type(ui.field('Subject'), 'Revised group two template')
  await ui.press(ui.button('Save new version'))
  assert.deepEqual(
    ui.requests.filter((request) => request.method === 'POST'),
    [
      {
        path: '/api/ops/invitations/campaign-fixture/content',
        method: 'POST',
        body: {
          revision: 7,
          group: 'group_2',
          subject: 'Revised group two template',
          bodyText: 'Hello {{first_name}}, welcome to {{group}}.'
        }
      }
    ]
  )
  assert.equal(ui.field('Subject').value, 'Revised group two template')
  assert.match(
    ui.host.querySelector('[aria-label="Template groups"] [aria-pressed="true"]').textContent,
    /Sandbox group 2/
  )
  assert.equal(ui.button('Save new version').disabled, true)
  await ui.press(ui.button('Generate missing drafts'))
  assert.deepEqual(ui.requests.filter((request) => request.method === 'POST').at(-1), {
    path: '/api/ops/invitations/campaign-fixture/generate',
    method: 'POST',
    body: { revision: 8, group: 'group_2', replaceExisting: false }
  })
  assert.equal(
    ui.host.querySelector('[aria-label="Invitation views"] [aria-pressed="true"]').textContent,
    'Review emails'
  )
  assert.equal(ui.host.querySelector('#review-group').value, 'group_2')
  assert.deepEqual(ui.listed(), ['missing@fixture.test'])
  await ui.openRecipient('missing@fixture.test')
  assert.equal(ui.field('Subject').value, 'Revised group two template')
  assert.equal(ui.button('Save draft').disabled, true)
  assert.equal(ui.button('Approve snapshot').disabled, false)
})

test('unsaved edits block approval and sandbox, survive a failed save, and cancel tab navigation', async () => {
  const ui = await mount({ rejectDraft: true })
  await ui.view('Review emails')
  await ui.openRecipient('editable@fixture.test')
  assert.equal(ui.button('Save draft').disabled, true)
  assert.equal(ui.button('Approve snapshot').disabled, false)
  assert.equal(ui.button('Run sandbox').disabled, false, 'another eligible draft is already approved')
  await ui.type(ui.field('Email body'), 'Unsaved fictional personal text')
  assert.equal(ui.button('Approve snapshot').disabled, true)
  assert.equal(ui.button('Run sandbox').disabled, true)
  await ui.press(ui.button('Save draft'))
  assert.equal(ui.field('Email body').value, 'Unsaved fictional personal text')
  assert.match(ui.host.querySelector('[role="alert"]').textContent, /stale_revision/)
  assert.equal(ui.button('Save draft').disabled, false)
  assert.equal(ui.button('Approve snapshot').disabled, true)
  await ui.view('Conversations')
  assert.equal(ui.confirmations.length, 1)
  assert.match(ui.confirmations[0], /Discard.*unsaved/i)
  assert.equal(
    ui.host.querySelector('[aria-label="Invitation views"] [aria-pressed="true"]').textContent,
    'Review emails'
  )
  assert.equal(ui.field('Email body').value, 'Unsaved fictional personal text')
  assert.deepEqual(
    ui.requests.filter((request) => request.method === 'POST'),
    [
      {
        path: '/api/ops/invitations/campaign-fixture/recipients/editable/draft',
        method: 'POST',
        body: {
          revision: 7,
          subject: 'Saved fictional invitation',
          bodyText: 'Unsaved fictional personal text'
        }
      }
    ]
  )
  ui.confirm(true)
  await ui.view('Conversations')
  assert.equal(ui.confirmations.length, 2)
  assert.equal(ui.host.querySelector('[data-invitations-review]'), null)
  assert.deepEqual(ui.listed(), ['message-only@fixture.test'])
})

test('reopening the current campaign discards template edits only after confirmation', async () => {
  const ui = await mount()
  await ui.view('Content / Templates')
  await ui.type(ui.field('Subject'), 'Unsaved fictional template')
  await ui.press(ui.button('Fictional campaign'))
  assert.equal(ui.field('Subject').value, 'Unsaved fictional template')
  assert.equal(ui.confirmations.length, 1)
  ui.confirm(true)
  await ui.press(ui.button('Fictional campaign'))
  assert.equal(ui.field('Subject').value, 'Fictional group 1 template')
  assert.equal(ui.button('Save new version').disabled, true)
  await ui.type(ui.field('Subject'), 'Another unsaved fictional template')
  ui.confirm(false)
  await ui.view('Review emails')
  assert.equal(ui.field('Subject').value, 'Another unsaved fictional template')
  assert.equal(ui.confirmations.length, 3)
})

test('Review lists drafts, Conversations lists recorded messages, and Import describes recipients', async () => {
  const ui = await mount()
  await ui.view('Review emails')
  assert.deepEqual(ui.listed(), ['editable@fixture.test', 'approved@fixture.test'])
  await ui.view('Conversations')
  assert.deepEqual(ui.listed(), ['message-only@fixture.test'])
  await ui.openRecipient('message-only@fixture.test')
  assert.equal(ui.host.querySelector('[data-invitations-review]'), null)
  const conversation = ui.host.querySelector('[data-invitations-conversation]')
  assert.ok(conversation)
  assert.match(conversation.textContent, /Fictional customer message/)
  assert.equal(conversation.querySelector('#draft-subject'), null)
  await ui.view('Import')
  assert.ok(
    [...ui.host.querySelectorAll('h3')].some((heading) => /Import recipients/i.test(heading.textContent))
  )
  assert.match(ui.host.textContent, /CSV is for the recipient list/)
  assert.match(ui.host.textContent, /templates directly in Content \/ Templates/)
  assert.equal(
    ui.requests.some((request) => request.method === 'POST'),
    false
  )
})
