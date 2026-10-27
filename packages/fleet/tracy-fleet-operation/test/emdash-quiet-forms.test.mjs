#!/usr/bin/env node
/**
 * `provision/emdash/quiet-forms.mjs` (25/10/2026: "Don't send email"): a new EmDash site's forms mail
 * nobody. Driven against a fake forms plugin that stores what the real `forms/update` stores (it merges the
 * settings it is sent), so what is asserted is what the site holds afterwards.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-quiet-forms.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FORMS_PATH, loud, quietForms } from '../scripts/provision/emdash/quiet-forms.mjs'

const ORIGIN = 'http://127.0.0.1:4321'
const TOKEN = 'ec_pat_ABCdef0123456789ghijkl'
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A fake site's forms plugin; `sticks: false` acknowledges updates and stores nothing. */
function site(forms, { plugin = true, sticks = true } = {}) {
  const calls = []
  const stored = structuredClone(forms)
  const fetch = async (url, init) => {
    const path = new URL(url).pathname
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ path, body, auth: init.headers.authorization })
    if (!plugin)
      return json({ success: false, error: { code: 'NOT_FOUND', message: 'Plugin route not found' } }, 404)
    if (path === `${FORMS_PATH}/list`) return json({ success: true, data: { items: stored, hasMore: false } })
    if (path === `${FORMS_PATH}/update`) {
      const form = stored.find((f) => f.id === body.id)
      if (sticks) form.settings = { ...form.settings, ...body.settings }
      return json({ success: true, data: form })
    }
    return json({ success: false }, 404)
  }
  return { calls, stored, fetch }
}
const form = (id, settings) => ({
  id,
  name: id,
  slug: id,
  pages: [{ fields: [{ id: 'f', label: 'Name' }] }],
  settings
})
const TEMPLATE = { notifyEmails: ['sales@northgate-ind.ru'], digestEnabled: false, submitLabel: 'Send' }

test('every form that would mail or call out is quieted, the rest left alone, and the site holds it', async () => {
  const s = site([
    form('quote', TEMPLATE),
    form('news', { ...TEMPLATE, notifyEmails: [], webhookUrl: 'https://hooks.template.test/x' }),
    form('digest', { notifyEmails: [], digestEnabled: true }),
    form('quiet', { notifyEmails: [], submitLabel: 'Go' })
  ])
  const r = await quietForms({ origin: ORIGIN, token: TOKEN, fetch: s.fetch })
  assert.deepEqual(r, { forms: 4, quieted: 3, autoresponders: 0 })
  assert.deepEqual(
    s.calls.filter((c) => c.path.endsWith('/update')).map((c) => c.body.id),
    ['quote', 'news', 'digest']
  )
  assert.ok(!s.stored.some(loud))
  assert.equal(s.stored[0].settings.submitLabel, 'Send', 'words are not touched')
  assert.ok(s.calls.every((c) => c.auth === `Bearer ${TOKEN}`))
})

test('a site without the forms plugin has nothing to quiet; one whose update does not hold is refused', async () => {
  assert.deepEqual(
    await quietForms({ origin: ORIGIN, token: TOKEN, fetch: site([], { plugin: false }).fetch }),
    {
      plugin: 'absent'
    }
  )
  await assert.rejects(
    quietForms({
      origin: ORIGIN,
      token: TOKEN,
      fetch: site([form('quote', TEMPLATE)], { sticks: false }).fetch
    }),
    (err) => err.code === 'UNVERIFIED'
  )
})

test('an autoresponder is counted, never claimed gone; a public origin or a bad token is refused before a call', async () => {
  const s = site([form('quote', { ...TEMPLATE, autoresponder: { subject: 'Thanks', body: 'We got it' } })])
  assert.deepEqual(await quietForms({ origin: ORIGIN, token: TOKEN, fetch: s.fetch }), {
    forms: 1,
    quieted: 1,
    autoresponders: 1
  })
  const none = site([form('quote', TEMPLATE)])
  await assert.rejects(quietForms({ origin: 'http://8.8.8.8:80', token: TOKEN, fetch: none.fetch }))
  await assert.rejects(quietForms({ origin: ORIGIN, token: 'nope', fetch: none.fetch }))
  assert.equal(none.calls.length, 0)
})
