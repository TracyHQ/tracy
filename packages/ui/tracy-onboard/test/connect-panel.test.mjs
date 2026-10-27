/**
 * What the connect panel under the AI-account grid shows (`src/client/connect-panel.ts`), the mock's
 * states A–G (tasks/evidence/desktop-onboard/mock/onboard-connect-now.html `stepAI`): idle, pending
 * (browser or device), the pasted callback, connected, error, an API-key vendor, connecting off, and
 * nothing picked. Pure: the pick, the offer and the sign-in under way in, the panel out.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-panel-'))
  const outfile = path.join(outDir, 'panel.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'connect-panel.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const CATALOGUE = [
  { id: 'claude', name: 'Claude', homepage: null },
  { id: 'copilot', name: 'GitHub Copilot', homepage: null },
  { id: 'gemini', name: 'Gemini', homepage: null }
]
const OFFER = {
  catalogue: CATALOGUE,
  connect: true,
  connected: [],
  accounts: {},
  connectable: ['claude', 'copilot']
}
const panel = (picked, attempt = null, offer = OFFER) =>
  lib.connectPanel({ catalogue: CATALOGUE, picked, offer, attempt })
const vendor = { id: 'claude', name: 'Claude' }

test('G: nothing picked → no panel', () => {
  assert.deepEqual(panel(null), { kind: 'none' })
})

test('F: connecting off on /ops → the off line, whatever is picked', () => {
  assert.deepEqual(panel('claude', null, { ...OFFER, connect: false }), { kind: 'off' })
  assert.deepEqual(panel(null, null, { ...OFFER, connect: false }), { kind: 'off' })
})

test('A: a picked vendor not connected and no sign-in under way → idle', () => {
  assert.deepEqual(panel('claude'), { kind: 'idle', vendor })
})

test('E: a vendor the deployment offers without a sign-in → the API-key panel', () => {
  assert.deepEqual(panel('gemini'), { kind: 'key', vendor: { id: 'gemini', name: 'Gemini' } })
  assert.deepEqual(
    panel('gemini', null, { ...OFFER, connectable: null }),
    { kind: 'idle', vendor: { id: 'gemini', name: 'Gemini' } },
    'the status door unread: nothing claimed, the sign-in is offered and the server decides'
  )
})

test('B: a sign-in under way for the picked vendor → pending (browser, device, starting, completing)', () => {
  assert.deepEqual(panel('claude', { kind: 'starting', provider: 'claude' }), {
    kind: 'pending',
    vendor,
    authorizeUrl: null,
    device: null,
    busy: true
  })
  assert.deepEqual(
    panel('claude', {
      kind: 'browser',
      provider: 'claude',
      attemptId: 'a',
      state: 's',
      authorizeUrl: 'https://x'
    }),
    { kind: 'pending', vendor, authorizeUrl: 'https://x', device: null, busy: false }
  )
  assert.deepEqual(panel('claude', { kind: 'completing', provider: 'claude' }).busy, true)
  const attempt = {
    provider: 'copilot',
    attemptId: 'a',
    state: 's',
    userCode: 'AB-CD',
    authorizeUrl: 'https://g',
    intervalMs: 0
  }
  assert.deepEqual(panel('copilot', { kind: 'device', provider: 'copilot', attempt }), {
    kind: 'pending',
    vendor: { id: 'copilot', name: 'GitHub Copilot' },
    authorizeUrl: 'https://g',
    device: { code: 'AB-CD' },
    busy: false
  })
})

test('T: the built-in Tracy AI picked → its own panel, whatever the offer says', () => {
  assert.deepEqual(panel('tracy'), { kind: 'tracy' })
  assert.deepEqual(panel('tracy', null, { ...OFFER, connect: false }), { kind: 'tracy' })
  assert.deepEqual(panel('tracy', { kind: 'failed', provider: 'claude', message: 'x' }), { kind: 'tracy' })
})

test('a sign-in for another vendor than the picked one is not shown', () => {
  assert.deepEqual(panel('claude', { kind: 'starting', provider: 'copilot' }), { kind: 'idle', vendor })
})

test('C: connected, from the offer or from the sign-in just now, names the account when known', () => {
  assert.deepEqual(
    panel('claude', null, { ...OFFER, connected: ['claude'], accounts: { claude: 'lee@example.com' } }),
    {
      kind: 'connected',
      vendor,
      account: 'lee@example.com'
    }
  )
  assert.deepEqual(panel('claude', null, { ...OFFER, connected: ['claude'] }), {
    kind: 'connected',
    vendor,
    account: null
  })
})

test('D: a failed sign-in → error with Try again', () => {
  assert.deepEqual(panel('claude', { kind: 'failed', provider: 'claude', reason: 'refused', message: '' }), {
    kind: 'error',
    vendor
  })
})

test('offerWithStatus: a status answer updates which vendors are connected and their accounts', () => {
  const status = {
    providers: [{ id: 'claude', name: 'Claude' }],
    connections: [
      { connectionId: '1', provider: 'claude', name: 'Claude', account: 'lee@example.com', connected: true },
      { connectionId: '2', provider: 'copilot', name: 'GitHub Copilot', account: 'old', connected: false }
    ]
  }
  const next = lib.offerWithStatus(OFFER, status)
  assert.deepEqual(next.connected, ['claude'])
  assert.deepEqual(next.accounts, { claude: 'lee@example.com' })
  assert.deepEqual(next.connectable, ['claude'])
  assert.equal(next.catalogue, OFFER.catalogue)
})

test('offerWithStatus: the connection in use (`next`) leads the connected list, then the route order', () => {
  const connections = [
    { connectionId: 'a', provider: 'claude', connected: true },
    { connectionId: 'b', provider: 'copilot', connected: true },
    { connectionId: 'c', provider: 'codex', connected: true }
  ]
  const inUse = lib.offerWithStatus(OFFER, {
    connections,
    next: { connectionId: 'b', name: 'GitHub Copilot' }
  })
  assert.deepEqual(inUse.connected, ['copilot', 'claude', 'codex'])
  const noNext = lib.offerWithStatus(OFFER, { connections, next: null })
  assert.deepEqual(noNext.connected, ['claude', 'copilot', 'codex'])
})
