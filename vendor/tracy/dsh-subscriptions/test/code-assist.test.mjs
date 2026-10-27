import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  antigravityPlatform, antigravityMetadata, antigravityIdentityHeaders, assistHeaders,
  postAssist, accountFromLoad, resolveProjectId, discoverProject,
  fetchAvailableModels, retrieveQuotaPercent, streamEnvelope, inspectGoogleAccount,
  CODE_ASSIST,
} from '../lib/code-assist.js'

// #298: Cloud Code Assist flows, driven through fetchImpl stubs.

const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status })
const calls = []
const stub = (payload, status = 200) => async (url, init) => {
  calls.push({ url: String(url), init })
  return json(payload, status)
}

test('antigravityPlatform matches the host platform', () => {
  const p = antigravityPlatform()
  assert.ok(['WINDOWS_AMD64', 'DARWIN_ARM64', 'DARWIN_AMD64', 'LINUX_ARM64', 'LINUX_AMD64'].includes(p))
  if (process.platform === 'linux') assert.ok(p === 'LINUX_ARM64' || p === 'LINUX_AMD64')
})

test('antigravityMetadata carries the project only when known', () => {
  const without = antigravityMetadata('')
  assert.equal(without.ideType, 'ANTIGRAVITY')
  assert.equal(without.pluginType, 'GEMINI')
  assert.equal('duetProject' in without, false)
  assert.equal(antigravityMetadata('proj-1').duetProject, 'proj-1')
})

test('antigravityIdentityHeaders embed the metadata as JSON', () => {
  const h = antigravityIdentityHeaders('proj-2')
  assert.match(h['user-agent'], /antigravity\//)
  assert.equal(h['X-Goog-Api-Client'], 'google-cloud-sdk vscode_cloudshelleditor/0.1')
  assert.equal(JSON.parse(h['Client-Metadata']).duetProject, 'proj-2')
})

test('assistHeaders set bearer auth and allow extra headers', () => {
  const h = assistHeaders('tok', { 'X-Extra': '1' })
  assert.equal(h.Authorization, 'Bearer tok')
  assert.equal(h['Content-Type'], 'application/json')
  assert.equal(h.Accept, 'application/json')
  assert.equal(h['X-Extra'], '1')
})

test('postAssist posts to the method endpoint and returns json', async () => {
  calls.length = 0
  const out = await postAssist(stub({ ok: 1 }), 'loadCodeAssist', 'tok', { metadata: { a: 1 } }, { 'X-E': '2' })
  assert.deepEqual(out, { ok: 1 })
  assert.equal(calls[0].url, CODE_ASSIST + ':loadCodeAssist')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(calls[0].init.body), { metadata: { a: 1 } })
})

test('postAssist surfaces vendor errors through readJson', async () => {
  await assert.rejects(() => postAssist(stub({ error: 'quota exceeded' }, 429), 'x', 'tok', {}, {}), (e) => e.code === 'RATE_LIMIT')
})

test('accountFromLoad reads every supported project shape', () => {
  assert.equal(accountFromLoad({ cloudaicompanionProject: 'p1' }).projectId, 'p1')
  assert.equal(accountFromLoad({ cloudaicompanionProject: { id: 'p2' } }).projectId, 'p2')
  assert.equal(accountFromLoad({ cloudaicompanionProject: { name: 'p3' } }).projectId, 'p3')
  assert.equal(accountFromLoad({ response: { cloudaicompanionProject: 'p4' } }).projectId, 'p4')
  assert.equal(accountFromLoad({ response: { cloudaicompanionProject: { id: 'p5' } } }).projectId, 'p5')
  assert.equal(accountFromLoad(null).projectId, '')
})

test('accountFromLoad falls back through the tier fields', () => {
  assert.equal(accountFromLoad({ currentTier: { id: 't1' } }).tierId, 't1')
  assert.equal(accountFromLoad({ paidTier: { id: 'g1-pro-tier', name: 'Pro' } }).tierId, 'g1-pro-tier')
  assert.equal(accountFromLoad({ paidTier: { id: 'g1-pro-tier', name: 'Pro' } }).paidTierName, 'Pro')
  assert.equal(accountFromLoad({}).tierId, 'free-tier')
})

test('resolveProjectId prefers the discovered project, then the current one', async () => {
  const withProject = await resolveProjectId(stub({ cloudaicompanionProject: 'disc' }), 'tok', {}, {}, '')
  assert.equal(withProject.projectId, 'disc')
  const fallback = await resolveProjectId(stub({}), 'tok', {}, {}, 'current')
  assert.equal(fallback.projectId, 'current')
  const none = await resolveProjectId(stub({}), 'tok', {}, {}, '')
  assert.equal(none.projectId, '')
})

test('discoverProject returns the account project without onboarding', async () => {
  calls.length = 0
  const out = await discoverProject(stub({ cloudaicompanionProject: 'p9', paidTier: { id: 'g1-pro-tier', name: 'Pro' } }), 'tok', {}, {})
  assert.equal(out.projectId, 'p9')
  assert.equal(out.paidTierId, 'g1-pro-tier')
  assert.equal(calls.filter((c) => c.url.endsWith(':onboardUser')).length, 0)
})

test('discoverProject onboards and reads the project from the operation', async () => {
  let n = 0
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith(':loadCodeAssist')) {
      n += 1
      return json(n === 1 ? {} : { cloudaicompanionProject: 'after-onboard' })
    }
    if (String(url).endsWith(':onboardUser')) return json({ done: true, response: { cloudaicompanionProject: 'after-onboard' } })
    return json({})
  }
  const out = await discoverProject(fetchImpl, 'tok', {}, {})
  assert.equal(out.projectId, 'after-onboard')
})

test('discoverProject survives a missing onboarding operation', async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith(':loadCodeAssist')) return json({})
    return json({}, 500)
  }
  const out = await discoverProject(fetchImpl, 'tok', {}, {})
  assert.equal(out.projectId, '')
  assert.equal(typeof out.tierId, 'string')
})

test('fetchAvailableModels filters, normalizes and sorts the live catalog', async () => {
  const payload = {
    models: [
      { id: 'models/gemini-pro', displayName: 'Gemini Pro', maxTokens: 1000, recommended: true },
      { id: 'chat_hidden', displayName: 'Hidden' },
      { id: 'internal', displayName: 'Internal', isInternal: true },
      { id: 'no-display', displayName: '' },
      { id: 'zeta', displayName: 'Zeta' },
      'plain-id',
      'chat_plain',
    ],
  }
  const out = await fetchAvailableModels(stub(payload), 'tok', {}, [], 'antigravity')
  const ids = out.map((m) => m.id)
  assert.ok(ids.includes('gemini-pro'))
  assert.ok(ids.includes('zeta'))
  assert.ok(ids.includes('plain-id'))
  assert.ok(!ids.includes('chat_hidden'))
  assert.ok(!ids.includes('internal'))
  assert.ok(!ids.includes('no-display'))
  assert.ok(!ids.includes('chat_plain'))
  const pro = out.find((m) => m.id === 'gemini-pro')
  assert.equal(pro.name, 'Gemini Pro')
  assert.equal(pro.contextWindow, 1000)
  assert.equal(pro.description, 'Recommended')
  assert.equal(out[0].id, 'gemini-pro', 'recommended models sort first')
})

test('fetchAvailableModels accepts the object-map catalog shape', async () => {
  const out = await fetchAvailableModels(stub({ models: { 'models/alpha': { displayName: 'Alpha' } } }), 'tok', {}, [], 'antigravity')
  assert.deepEqual(out.map((m) => m.id), ['alpha'])
})

test('fetchAvailableModels falls back to the static ids', async () => {
  const out = await fetchAvailableModels(stub({ models: [] }), 'tok', {}, ['fb-1', { id: 'fb-2', name: 'Fallback Two' }], 'antigravity')
  assert.equal(out.length, 2)
  assert.equal(out[0].id, 'fb-1')
  assert.equal(out[1].name, 'Fallback Two')
  const errored = await fetchAvailableModels(stub({}, 500), 'tok', {}, ['fb-3'], 'antigravity')
  assert.deepEqual(errored.map((m) => m.id), ['fb-3'])
})

test('retrieveQuotaPercent degrades to null instead of throwing', async () => {
  const nulled = await retrieveQuotaPercent(stub({}, 500), 'tok', {})
  assert.equal(nulled, null)
  const malformed = await retrieveQuotaPercent(stub({ nonsense: true }), 'tok', {})
  assert.ok(malformed === null || typeof malformed === 'object')
})

test('streamEnvelope builds the request envelope and defaults the session', () => {
  const { envelope, sessionId } = streamEnvelope({ projectId: 'p', model: 'm', request: { contents: [] }, userAgent: 'ua' })
  assert.equal(envelope.project, 'p')
  assert.equal(envelope.model, 'm')
  assert.equal(envelope.userAgent, 'ua')
  assert.ok(envelope.user_prompt_id)
  assert.equal(envelope.request.session_id, sessionId)
  assert.equal('enabled_credit_types' in envelope, false)
})

test('streamEnvelope drops the project and honors a supplied session', () => {
  const { envelope } = streamEnvelope({ projectId: '', model: 'm', request: { session_id: 'keep-me' }, sessionId: 'given' })
  assert.equal('project' in envelope, false)
  assert.equal(envelope.request.session_id, 'keep-me')
})

test('streamEnvelope marks g1-pro requests with the credit type', () => {
  const { envelope } = streamEnvelope({ projectId: 'p', model: 'm', request: {}, paidTierId: 'g1-pro-tier' })
  assert.deepEqual(envelope.enabled_credit_types, ['GOOGLE_ONE_AI'])
})

test('inspectGoogleAccount reports the resolved project on success', async () => {
  const out = await inspectGoogleAccount(stub({ cloudaicompanionProject: 'proj-ok', paidTier: { id: 'g1-pro-tier', name: 'Pro' } }), 'tok', { metadata: {}, extraHeaders: {}, projectId: '' })
  assert.equal(out.projectId, 'proj-ok')
  assert.equal(out.validation, null)
  assert.equal(out.paidTierId, 'g1-pro-tier')
})

test('inspectGoogleAccount falls back to the provided project on failure', async () => {
  const out = await inspectGoogleAccount(stub({}, 500), 'tok', { metadata: {}, extraHeaders: {}, projectId: 'fallback-p' })
  assert.equal(out.projectId, 'fallback-p')
  assert.equal(out.validation, null)
})
