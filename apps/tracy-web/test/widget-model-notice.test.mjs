import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
const apiAndMapper = source.slice(source.indexOf('async function api('), source.indexOf('function head('))

test('model notices distinguish existing safe reasons and explicit billing refusal', async () => {
  for (const [status, reason, expected] of [
    [401, 'authentication', /rejected its credentials/],
    [403, 'authentication', /rejected its credentials/],
    [400, 'configuration', /connection needs to be checked/],
    [422, 'configuration', /connection needs to be checked/],
    [503, 'configuration', /connection needs to be checked/],
    [402, 'upstream', /credits or billing are unavailable/],
    [429, 'upstream', /request limit/],
    [504, 'upstream', /too long/],
    [502, 'upstream', /valid answer/]
  ]) {
    const context = vm.createContext({
      fetch: async () =>
        Response.json({ code: 'MODEL_UNAVAILABLE', reason, message: 'secret upstream text' }, { status })
    })
    vm.runInContext(apiAndMapper, context)
    let error
    try {
      await context.api('/widget/api/turn', { message: 'Test' })
    } catch (caught) {
      error = caught
    }
    assert.equal(error.status, status)
    assert.equal(error.reason, reason)
    const notice = context.modelFailureMessage(error)
    assert.match(notice, expected)
    assert.match(notice, /kept for review/)
    assert.match(notice, /Nothing will be sent again automatically/)
    assert.doesNotMatch(notice, /secret upstream text|MODEL_UNAVAILABLE/)
  }
})

test('unknown reasons and raw error messages never leak through model notice mapping', async () => {
  for (const reason of ['secret-api-key', undefined, { message: 'secret-api-key' }]) {
    const context = vm.createContext({
      fetch: async () =>
        Response.json({ code: 'MODEL_UNAVAILABLE', reason, message: 'secret-api-key' }, { status: 402 })
    })
    vm.runInContext(apiAndMapper, context)
    let error
    try {
      await context.api('/widget/api/turn', {})
    } catch (caught) {
      error = caught
    }
    assert.equal(error.reason, undefined)
    error.message = 'secret-api-key'
    const notice = context.modelFailureMessage(error)
    assert.match(notice, /valid answer/)
    assert.doesNotMatch(notice, /secret-api-key|billing/)
  }
})

test('billing and model auth refusals stay manual with one attempt and no automatic login', async () => {
  for (const [status, reason] of [
    [402, 'upstream'],
    [401, 'authentication']
  ]) {
    let requests = 0,
      logins = 0,
      playback = 0
    const notices = [],
      storage = new Map()
    const context = vm.createContext({
      nativeSession: null,
      busy: false,
      auth: { active: false },
      pendingDraft: '',
      voiceGeneration: 0,
      sessionStorage: { setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
      stopSpeaking() {},
      clearTimeout() {},
      sendTimer: null,
      link: null,
      committed: '',
      draft: '',
      state: { history: [] },
      render() {},
      visibleRows: () => [],
      pageSize: 12,
      mode: 'templates',
      keepPendingDraft: (text) => storage.set('manual', text),
      setNotice: (text) => notices.push(text),
      openSignInAction: () => {
        logins++
      },
      say: () => {
        playback++
      },
      voiceOn: true,
      fetch: async () => {
        requests++
        return Response.json({ code: 'MODEL_UNAVAILABLE', reason }, { status })
      }
    })
    vm.runInContext(apiAndMapper, context)
    context.api = async (path) => {
      if (path.endsWith('/visible')) return {}
      requests++
      throw Object.assign(new Error('secret upstream text'), { code: 'MODEL_UNAVAILABLE', status, reason })
    }
    vm.runInContext(
      source.slice(source.indexOf('async function submit('), source.indexOf('async function say(')),
      context
    )
    await context.submit('Keep this exact message')
    assert.equal(requests, 1)
    assert.equal(logins, 0)
    assert.equal(playback, 0)
    assert.equal(storage.get('manual'), 'Keep this exact message')
    assert.equal(context.busy, false)
    assert.doesNotMatch(notices[0], /secret upstream text/)
  }
})
