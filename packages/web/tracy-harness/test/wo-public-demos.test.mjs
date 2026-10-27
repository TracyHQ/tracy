import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PUBLIC_DEMO_FIELDS,
  publicDemoInputError,
  readPublicDemoSettings,
  savePublicDemoSettings
} from '../src/wo-public-demos.ts'
import { en } from '../src/i18n/ns/wo-misc.ts'
import { translate } from '../src/i18n/translator.ts'

/** The screens' English, as `useT()` reads it with no language loaded. */
const t = (key, params) => translate('en', {}, en, key, params)

const settings = { liveDemosPerAccount: 20, sponsoredDemoMaxCents: 200, sponsoredMonthlyBudgetCents: 30000 }

test('every setting the /v1/demos door reads has a field, checked against the range the server accepts', () => {
  assert.deepEqual(PUBLIC_DEMO_FIELDS.map((f) => f.key).sort(), Object.keys(settings).sort())
  assert.equal(publicDemoInputError(t, settings), null)
  assert.match(publicDemoInputError(t, { ...settings, liveDemosPerAccount: -1 }), /from 0 to 10000/)
  assert.match(publicDemoInputError(t, { ...settings, sponsoredDemoMaxCents: 0 }), /from 1/)
  assert.match(publicDemoInputError(t, { ...settings, sponsoredMonthlyBudgetCents: 1.5 }), /whole number/)
})

test('the panel reads and saves through its own door, same origin, and says the server’s refusal', async () => {
  const calls = []
  const fake = async (input, init) => {
    calls.push({ input, init })
    return init?.method === 'PUT'
      ? Response.json(
          {
            error: 'INVALID_PUBLIC_DEMO_SETTING',
            message: 'liveDemosPerAccount: a whole number from 0 to 10000.'
          },
          { status: 400 }
        )
      : Response.json({ settings, writable: true })
  }
  assert.deepEqual((await readPublicDemoSettings(fake)).settings, settings)
  await assert.rejects(savePublicDemoSettings({ liveDemosPerAccount: 5 }, fake), /from 0 to 10000/)
  assert.equal(calls[0].input, '/api/ops/wo/public-demos')
  assert.equal(calls[1].init.method, 'PUT')
  assert.equal(calls[1].init.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(calls[1].init.body), { settings: { liveDemosPerAccount: 5 } })
})
