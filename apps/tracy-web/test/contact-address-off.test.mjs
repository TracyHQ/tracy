// With no street address given, the template's address lines are emptied on the contact record, so a visitor never reads the
// demo company's street (spec TracyHQ/tracy#189). A bakery with an address and a dental clinic without.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactSteps } from '../src/sites/brief-engines/joomla-tidy.js'

const door =
  (rows) =>
  async ({ action, params }) =>
    action === 'content.list' && params.kind === 'contact'
      ? { ok: true, items: params.offset ? [] : rows }
      : { ok: true, items: [] }
const row = {
  id: 3,
  published: 1,
  language: '*',
  name: 'Demo',
  address: '12 Demo Street, Sample City',
  suburb: 'Sampleton',
  postcode: '99999',
  telephone: '',
  email_to: ''
}

test('a clinic with no address given has the template’s address lines emptied', async () => {
  const { steps } = await contactSteps({
    apply: door([row]),
    siteKey: 's',
    given: { name: 'Northgate Dental' },
    visible: new Set()
  })
  const fields = steps.find((s) => s.id === 3).fields
  assert.equal(fields.address, '')
  assert.equal(fields.suburb, '')
  assert.equal(fields.postcode, '')
})

test('a bakery that gave its address has it written, not emptied', async () => {
  const { steps } = await contactSteps({
    apply: door([row]),
    siteKey: 's',
    given: { address: '14 Mill Lane' },
    visible: new Set()
  })
  assert.equal(steps.find((s) => s.id === 3).fields.address, '14 Mill Lane')
})
