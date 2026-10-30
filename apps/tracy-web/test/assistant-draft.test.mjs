import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { draftPrompt, draftQuestions, parseDraft } from '../src/assistant/onboarding-draft.js'
import { assistantRoutes } from '../src/assistant/route.js'
import { currentConversation, saveTurn } from '../src/assistant/store.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { accountByEmail } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'

const valid = (extra = {}) => ({
  platform: 'joomla',
  answersByFeed: {
    'site.name': 'Hoa Mai',
    'copy.about': 'Bakery in Da Nang; green; Vietnamese and English requested'
  },
  importUrl: null,
  businessQuery: null,
  needsClarification: false,
  ...extra
})
const parse = (v, intent = 'create', platform) => parseDraft(JSON.stringify(v), intent, platform)
test('the extraction uses canonical questions and preserves both sides for references and corrections', () => {
  assert.ok(draftQuestions('joomla').some((q) => q.feeds.includes('site.name')))
  const turns = [
    { role: 'user', content: 'WordPress for Hoa Mai' },
    { role: 'assistant', content: 'WordPress or Joomla?' },
    { role: 'user', content: 'The second one, keep my details' }
  ]
  const messages = draftPrompt('create', turns)
  assert.deepEqual(
    JSON.parse(messages[1].content),
    turns.map((t) => ({ role: t.role, text: t.content }))
  )
  assert.match(messages[0].content, /Later explicit customer corrections replace/)
  assert.match(messages[0].content, /Files have NOT been read/)
  assert.match(messages[0].content, /multiple languages/)
  const result = parse(valid())
  assert.equal(result.platform, 'joomla')
  assert.equal(result.answersByFeed['site.name'], 'Hoa Mai')
  assert.equal(result.answersByFeed['site.languages'], undefined)
})
test('invalid model output never crosses the boundary', () => {
  for (const raw of ['no JSON', '[]', '{}']) assert.equal(parseDraft(raw, 'create'), null)
  for (const delta of [
    { platform: 'drupal' },
    { answersByFeed: { password: 'secret' } },
    { answersByFeed: { name: 'Hoa Mai', about: 'Bakery' } },
    { answersByFeed: { 'site.name': 12 } },
    { answersByFeed: { 'site.languages': ['vi', 'en'] } },
    { answersByFeed: { 'site.languages': ['unknown'] } },
    { answersByFeed: { 'copy.tone': 'invented' } },
    { answersByFeed: { 'copy.about': 'a'.repeat(301) } },
    { command: 'create' }
  ])
    assert.equal(parse(valid(delta)), null)
  assert.deepEqual(parse(valid({ needsClarification: true })), { needsClarification: true })
})
test('import addresses carry no credentials or operations; each intent exposes only its own seed', () => {
  for (const address of [
    'javascript:alert(1)',
    'https://user:pass@example.test/',
    'https://example.test/wp-admin',
    'https://example.test/?token=x',
    'https://example.test/#token'
  ])
    assert.equal(parse(valid({ importUrl: address }), 'import'), null)
  const imported = parse(valid({ importUrl: 'https://example.test/' }), 'import')
  assert.equal(imported.importUrl, 'https://example.test')
  // A site installed in a folder keeps its folder: the import reads the installation there (#202).
  for (const [address, kept] of [
    ['https://example.test/shop/', 'https://example.test/shop/'],
    ['https://example.test/shop', 'https://example.test/shop/'],
    ['https://example.test/shop/index.php', 'https://example.test/shop/'],
    ['http://example.test/a/b/', 'http://example.test/a/b/']
  ])
    assert.equal(parse(valid({ importUrl: address }), 'import')?.importUrl, kept, address)
  assert.equal(parse(valid({ importUrl: 'https://example.test/shop/wp-admin/' }), 'import'), null)
  assert.deepEqual(imported.answersByFeed, {})
  assert.equal(
    parse(valid({ businessQuery: 'Hoa Mai Da Nang' }), 'business').businessQuery,
    'Hoa Mai Da Nang'
  )
})

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: !process.env.TEST_DATABASE_URL }
const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})
const session = 'draft-session'
async function setup({ output = () => JSON.stringify(valid()), during } = {}) {
  const { pool } = db
  const {
    rows: [account]
  } = await pool.query("insert into account(email) values ('draft@example.test') returning id")
  const conv = await currentConversation(pool, account.id, session)
  const revision = await saveTurn(pool, {
    accountId: account.id,
    conversationId: conv.id,
    role: 'user',
    content: 'Create WordPress for Hoa Mai; change to Joomla, keep the name'
  })
  await saveTurn(pool, {
    accountId: account.id,
    conversationId: conv.id,
    role: 'assistant',
    content: 'Continue with Joomla'
  })
  let calls = 0
  const app = assistantRoutes({
    pool,
    config,
    readers: { accountByEmail },
    model: {
      async *stream({ messages }) {
        calls++
        assert.match(messages[1].content, /Hoa Mai/)
        await during?.({ pool, account, conv })
        yield { text: output() }
      }
    },
    log: { warn() {} }
  })
  async function request(body = {}, email = 'draft@example.test') {
    return app.fetch(
      new Request('http://tracy.test/api/assistant/onboarding-draft', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`
        },
        body: JSON.stringify({ intent: 'create', sourceRevision: revision, session, ...body })
      })
    )
  }
  return { request, revision, pool, account, conv, calls: () => calls }
}
test('an owner prepares a draft without creating a site or extra chat turns', opts, async () => {
  const h = await setup()
  const response = await h.request({ platform: 'joomla' })
  assert.equal(response.status, 200)
  const { draft } = await response.json()
  assert.equal(draft.sourceRevision, h.revision)
  assert.equal(draft.answersByFeed['site.name'], 'Hoa Mai')
  assert.equal((await h.pool.query('select count(*) from assistant_turn')).rows[0].count, '2')
  assert.equal((await h.pool.query('select count(*) from site')).rows[0].count, '0')
})
test(
  'stale revisions, another session and another owner cannot extract this conversation',
  opts,
  async () => {
    const h = await setup()
    await h.pool.query("insert into account(email) values ('other@example.test')")
    for (const args of [
      [{ sourceRevision: '999999' }],
      [{ session: 'different-session' }],
      [{}, 'other@example.test']
    ])
      assert.equal((await h.request(...args)).status, 409)
    assert.equal(h.calls(), 0)
  }
)
test('a correction while the model runs invalidates the prepared details', opts, async () => {
  const h = await setup({
    during: async ({ pool, account, conv }) => {
      await saveTurn(pool, {
        accountId: account.id,
        conversationId: conv.id,
        role: 'user',
        content: 'Actually EmDash'
      })
    }
  })
  const response = await h.request()
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'DRAFT_CHANGED')
})
test('an outdated platform link fails, malformed or ambiguous output can be retried', opts, async () => {
  let output = 'broken'
  const h = await setup({ output: () => output })
  assert.equal((await h.request()).status, 502)
  output = JSON.stringify(valid({ needsClarification: true }))
  assert.equal((await (await h.request()).json()).code, 'DRAFT_AMBIGUOUS')
  output = JSON.stringify(valid())
  assert.equal((await (await h.request({ platform: 'wordpress' })).json()).code, 'DRAFT_CHANGED')
  assert.equal((await h.request({ platform: 'joomla' })).status, 200)
})
test('oversized history is refused before spending a model call', opts, async () => {
  const h = await setup()
  await h.pool.query("update assistant_turn set content = repeat('x', 32001) where role = 'assistant'")
  const response = await h.request()
  assert.equal(response.status, 413)
  assert.equal((await response.json()).code, 'DRAFT_TOO_LONG')
  assert.equal(h.calls(), 0)
})
