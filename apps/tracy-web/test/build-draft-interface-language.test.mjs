// The interface language of the person the build chat's tool acts for (#609, `build-draft/caller.js`): every build
// draft door answers a tool call (a signed actor in the person's build session) with the stored interface language in
// `x-tracy-interface-language`, so the agent speaks the language the owner's screen speaks. A browser call carries
// none, and an account with no stored language carries none. Every address here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-interface-language.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { INTERFACE_LANGUAGE_HEADER } from '../src/build-draft/caller.js'
import { ensureAccount } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import { KIT_ROOT, OWNER, actor, config, kits } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

function server() {
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine: {}
  })
  /** One door call; `tool` calls as `tracy_build` does, else as nobody signed in. */
  return async (path, { tool = true } = {}) => {
    const headers = tool
      ? {
          'x-tracy-actor': actor(OWNER),
          'x-tracy-session': await buildSessionIdFor(OWNER, config.sessionSecret)
        }
      : {}
    return app.fetch(new Request(`${config.origin}/api/build-draft${path}`, { headers }))
  }
}
const setLanguage = (language) =>
  db.pool.query('update account set language = $2 where email = $1', [OWNER, language])

test('a tool call reads the owner interface language on every build draft door', opts, async () => {
  await ensureAccount(db.pool, OWNER)
  await setLanguage('vi')
  const call = server()
  for (const path of ['/engine', '/templates', '/build', '']) {
    const res = await call(path)
    assert.equal(res.headers.get(INTERFACE_LANGUAGE_HEADER), 'vi', path)
  }
})

test(
  'a stored tag is matched to one of the interface languages, and an unknown one is not sent',
  opts,
  async () => {
    await ensureAccount(db.pool, OWNER)
    const call = server()
    await setLanguage('de-AT')
    assert.equal((await call('/engine')).headers.get(INTERFACE_LANGUAGE_HEADER), 'de')
    await setLanguage('ja')
    assert.equal((await call('/engine')).headers.get(INTERFACE_LANGUAGE_HEADER), null)
    await setLanguage(null)
    assert.equal((await call('/engine')).headers.get(INTERFACE_LANGUAGE_HEADER), null)
  }
)

test('a browser call carries no interface language: only the tool needs it', opts, async () => {
  await ensureAccount(db.pool, OWNER)
  await setLanguage('fr')
  const res = await server()('/engine', { tool: false })
  assert.equal(res.headers.get(INTERFACE_LANGUAGE_HEADER), null)
})
