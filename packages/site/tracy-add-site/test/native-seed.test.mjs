import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeBriefAnswers, readNativeSeed } from '../src/client/native-seed.mjs'

test('imported brief fills the actual questionnaire feeds and never replaces an existing answer or address', () => {
  const questions = [
    { id: 'business', kind: 'text', feeds: ['site.name'] },
    { id: 'description', kind: 'longtext', feeds: ['copy.about'] },
    { id: 'address', kind: 'text', feeds: ['site.address'] },
    { id: 'tone', kind: 'choice', feeds: ['copy.about'] }
  ]
  assert.deepEqual(nativeBriefAnswers(questions, { name: 'Family Bakery', about: 'Fresh bread.' }, {}), {
    business: 'Family Bakery',
    description: 'Fresh bread.'
  })
  assert.deepEqual(
    nativeBriefAnswers(
      questions,
      { name: 'Family Bakery', about: 'Fresh bread.' },
      { business: 'My new name' }
    ),
    { description: 'Fresh bread.' }
  )
})

test('native seed needs a real catalogue pairing and never prepares a second build for an existing job', async () => {
  const originalFetch = globalThis.fetch
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const calls = []
  const context = {
    schema: 'widget-imported-context/v1',
    brief: { name: 'Bakery', about: 'Bread', platform: 'wordpress' },
    selection: { template: 'bakery', designSystem: 'warm' }
  }
  let build = { state: 'missing' }
  let templates = [{ id: 'bakery', platforms: [{ platform: 'wordpress' }] }]
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { pathname: '/widget/native/s/example' }
  })
  globalThis.fetch = async (path) => {
    calls.push(path)
    return Response.json(path.includes('?session=') ? { context, currentBuild: build } : { templates })
  }
  try {
    assert.equal(await readNativeSeed('ordinary-session'), null)
    assert.equal(calls.length, 0)
    const id = 'session-widget-00000000-0000-4000-8000-000000000001'
    assert.deepEqual(await readNativeSeed(id), {
      platform: 'wordpress',
      template: 'bakery',
      brief: { name: 'Bakery', about: 'Bread' },
      designSystem: 'warm'
    })
    assert.match(calls[0], /^\/widget\/api\/native\/context\?session=/)
    assert.equal(calls[1], '/widget/native/backend/api/templates')
    templates = [{ id: 'bakery', platforms: [{ platform: 'joomla' }] }]
    assert.equal(await readNativeSeed(id), null)
    templates = [{ id: 'bakery', platforms: [{ platform: 'wordpress' }] }]
    build = { state: 'unavailable' }
    assert.equal(await readNativeSeed(id), null)
    build = { state: 'running' }
    assert.equal(await readNativeSeed(id), null)
  } finally {
    globalThis.fetch = originalFetch
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
    else delete globalThis.location
  }
})
