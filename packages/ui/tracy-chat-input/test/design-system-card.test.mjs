/**
 * The site start screen's Design system card (Akemi U2 A, 12/10/2026): what its end says for each answer
 * of the door, and that a press rides the toolbar button's own event.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DS_TOOLBAR_PRESS_EVENT,
  designSystemCardOf,
  pressDesignSystem,
  readWornDesignSystem
} from '../src/client/design-system-card.mjs'

const answer = (status, body) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('a worn system shows its name', async () => {
  const r = await readWornDesignSystem('acme.localhost', answer(200, { worn: { name: 'Calm Ledger' } }))
  assert.deepEqual(designSystemCardOf(r), { kind: 'worn', name: 'Calm Ledger' })
})

test('no worn system says the template default', async () => {
  const r = await readWornDesignSystem('acme.localhost', answer(200, { worn: null, template: 'ja_x' }))
  assert.deepEqual(designSystemCardOf(r), { kind: 'default' })
})

test('a template closed to customers draws no card, unless the site already wears a system', async () => {
  const bare = await readWornDesignSystem(
    'acme.localhost',
    answer(200, { worn: null, supported: false, reason: 'TEMPLATE_NOT_READY', locked: true })
  )
  assert.deepEqual(designSystemCardOf(bare), { kind: 'none' })
  const worn = await readWornDesignSystem(
    'acme.localhost',
    answer(200, {
      worn: { name: 'Calm Ledger' },
      supported: false,
      reason: 'TEMPLATE_NOT_READY',
      locked: true
    })
  )
  assert.deepEqual(designSystemCardOf(worn), { kind: 'worn', name: 'Calm Ledger' })
})

test('a site with no door, a refusal or no network draws no card', async () => {
  for (const r of [
    await readWornDesignSystem('acme.localhost', answer(404, { code: 'NOT_FOUND' })),
    await readWornDesignSystem('acme.localhost', answer(500, null)),
    await readWornDesignSystem('acme.localhost', async () => {
      throw new Error('offline')
    })
  ]) {
    assert.deepEqual(designSystemCardOf(r), { kind: 'none' })
  }
})

test('the read asks the site door with the page cookie', async () => {
  let asked
  await readWornDesignSystem('a b', async (url, init) => {
    asked = { url, init }
    return new Response('{}', { status: 200 })
  })
  assert.equal(asked.url, '/api/sites/a%20b/design-system')
  assert.equal(asked.init.credentials, 'same-origin')
})

test('a press sends the toolbar button event with the site and session', () => {
  const target = new EventTarget()
  let heard
  target.addEventListener(DS_TOOLBAR_PRESS_EVENT, (e) => {
    heard = e.detail
  })
  pressDesignSystem(target, 'acme.localhost', 's1')
  assert.deepEqual(heard, { siteKey: 'acme.localhost', sessionId: 's1' })
  pressDesignSystem(target, 'acme.localhost', undefined)
  assert.deepEqual(heard, { siteKey: 'acme.localhost', sessionId: '' })
})
