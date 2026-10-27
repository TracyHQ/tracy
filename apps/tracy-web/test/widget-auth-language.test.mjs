import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import { Hono } from 'hono'
import { parseCode } from '../src/widget/assets/auth-panel.js'
import {
  decimalDigits,
  phoneticEmail,
  speechLanguageCode,
  spokenEmail
} from '../src/widget/assets/email-voice.js'
import { authLanguagePacks, languageCode, validateLanguagePack } from '../src/widget/auth-language.js'
import { widgetRoutes } from '../src/widget/route.js'

const originals = JSON.parse(
  await readFile(new URL('../src/widget/assets/auth-voice.json', import.meta.url), 'utf8')
)

import { fr } from './_widget-auth-language.mjs'

const config = {
  sessionSecret: 'test-session-secret',
  model: { apiKey: 'test-private-key', baseUrl: 'https://model.invalid', words: 'test' }
}
const pool = {
  async query(sql) {
    return {
      rows: sql.includes('ui_setting') ? [{ on: true }] : sql.includes('llm_assignment') ? [] : [{ count: 1 }]
    }
  }
}
test('language pack uses existing assistant for fixed public templates only; cache/coalescing and validation fail closed', async (t) => {
  let calls = 0,
    admissions = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'test')
    assert.doesNotMatch(JSON.stringify(body), /test-private-key|person@example|012345|tracy_sess/)
    assert.match(body.messages[1].content, /"language":"fr"/)
    return Response.json({ choices: [{ message: { content: JSON.stringify(fr) } }] })
  })
  const packs = authLanguagePacks({
    pool,
    config,
    admit: async () => {
      admissions++
      return true
    }
  })
  const [a, b] = await Promise.all([packs('fr-FR'), packs('fr')])
  assert.deepEqual(a, b)
  assert.equal(calls, 1)
  assert.equal(admissions, 1)
  assert.deepEqual(await packs('fr-CA'), a)
  assert.equal(calls, 1)
  assert.equal((await packs('eng')).language, 'en')
  assert.equal((await packs('vi-VN')).language, 'vi')
  assert.equal(calls, 1)
  assert.equal(languageCode('zh-Hant-TW'), 'zh')
  assert.equal(languageCode('fr; inject'), null)
  for (const patch of [
    { guides: { ...fr.guides, confirmEmail: 'No placeholders' } },
    { guides: { ...fr.guides, email: originals.en.email } },
    { lexicon: { ...fr.lexicon, yes: ['non'] } },
    { lexicon: { ...fr.lexicon, yes: ['no'] } },
    { lexicon: { ...fr.lexicon, digits: ['one'] } },
    { lexicon: { ...fr.lexicon, letterPattern: 'missing' } }
  ])
    assert.equal(validateLanguagePack({ ...fr, ...patch }, 'fr'), null)
})
test('auth-language route accepts language only and rejects credentials before any translation', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return Response.json({ choices: [{ message: { content: JSON.stringify(fr) } }] })
  })
  const app = new Hono()
  app.route(
    '/widget',
    widgetRoutes({
      config: { ...config, origin: 'https://tracy.test' },
      pool,
      contextStore: null,
      request: async () => Response.json({})
    })
  )
  const send = (body) =>
    app.request('https://tracy.test/widget/api/auth/language', {
      method: 'POST',
      headers: { origin: 'https://tracy.test', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  assert.equal((await send({ language: 'fr', email: 'person@example.test', code: '012345' })).status, 400)
  assert.equal(calls, 0)
  assert.equal((await send({ language: 'fr' })).status, 200)
  assert.equal(calls, 1)
  const upstream = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('secret-upstream-error', { status: 402 })
  )
  const failure = await send({ language: 'de' })
  assert.equal(failure.status, 503)
  assert.deepEqual(await failure.json(), { code: 'AUTH_LANGUAGE_UNAVAILABLE' })
  upstream.mock.restore()
})
test('locale lexicon handles spoken email, localized readback, Unicode digits and non-Latin six-digit words', () => {
  assert.equal(spokenEmail('mon adresse est h a arobase gmail point com', fr.lexicon), 'ha@gmail.com')
  assert.equal(spokenEmail('marobase gmail point com', fr.lexicon), null)
  assert.match(phoneticEmail('ha2@gmail.com', fr.lexicon), /H comme Hotel/)
  assert.match(phoneticEmail('ha2@gmail.com', fr.lexicon), /deux.*arobase.*point/)
  assert.equal(parseCode('zéro un deux trois quatre cinq', fr.lexicon), '012345')
  assert.equal(parseCode('zero one deux trois quatre cinq', fr.lexicon), '012345')
  assert.equal(parseCode('mon code zéro un deux trois quatre cinq', fr.lexicon), null)
  assert.equal(parseCode('zéro un deux trois quatre cinq six', fr.lexicon), null)
  for (const text of ['٠١٢٣٤٥', '۰۱۲۳۴۵', '०१२३४५', '０１２３４５'])
    assert.equal(decimalDigits(text), '012345')
  const zh = { digits: ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] }
  assert.equal(parseCode('零一二三四五', zh), '012345')
  assert.equal(parseCode('请零一二三四五', zh), null)
  assert.equal(parseCode('٠١٢٣٤٥', fr.lexicon), '012345')
  assert.equal(parseCode('رمزي ٠١٢٣٤٥'), null)
  assert.equal(parseCode('我的验证码012345'), null)
})
test('dynamic guide requests contain language only; no silent English fallback or mismatched stale language', async () => {
  const source = await readFile(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
  const guide = source.slice(
    source.indexOf('async function authGuide('),
    source.indexOf('const auth = createAuth(')
  )
  const requests = [],
    notices = []
  const c = vm.createContext({
    language: 'fr-FR',
    speechLanguageCode,
    navigator: { language: 'en' },
    authWords: originals,
    activeAuthLanguagePack: null,
    voiceOn: false,
    setNotice: (text) => notices.push(text),
    api: async (path, body) => {
      requests.push({ path, body })
      return fr
    }
  })
  vm.runInContext(guide, c)
  await c.authGuide({ key: 'confirmEmail', email: 'person@example.test', spelling: 'private spelling' })
  assert.equal(
    JSON.stringify(requests),
    JSON.stringify([{ path: '/widget/api/auth/language', body: { language: 'fr' } }])
  )
  assert.match(notices[0], /person@example.test/)
  assert.equal(c.activeAuthLanguagePack.language, 'fr')
  await c.authGuide('code')
  assert.equal(requests.length, 1)
  c.language = 'ja'
  c.api = async () => {
    throw Error('private error')
  }
  await c.authGuide('email')
  assert.equal(c.activeAuthLanguagePack, null)
  assert.match(notices.at(-1), /instructions for this language are unavailable/)
  assert.doesNotMatch(notices.at(-1), /private error/)
})
