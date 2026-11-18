// tools/personalize.mjs on this template's own seed: the contact card and the reservation button carry the customer's
// phone. QA on dev 16/11/2026 (JA Restaurant EmDash 1.0.2, site built with #654 live): the contact card kept the demo's
// "(084) 555-0110" and "048 594 5483", and "Call Now" on the reservation page still dialled tel:+10845550110, though the
// brief gave a phone. Hano's decision (16/11): a phone the brief gives is written there, the link in the themes' `telHref`
// form; none given, the demo's values stay as placeholders, as the address does (`unanswered: keep-demo`). The
// questionnaire asks for one hotline (`contact`, seed/questions.json) and never for a second number, so the demo's mobile
// line goes once the customer's phone takes the first (`requires`), and stays beside the demo phone when none is given.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, planFrom } from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))

const fieldsOf = (plan, collection) => plan.patches.get(`${collection}/${collection}/en`)?.fields ?? {}

test("a phone the brief gives is the contact card's phone and the reservation button's number", () => {
  const facts = factsFrom({ name: 'Trattoria Lume', contact: '12 Bach Dang, Da Nang · +84 236 555 0199' })
  const plan = planFrom(map, seed, facts)
  const contact = fieldsOf(plan, 'contact')
  assert.equal(contact.phone, '+84 236 555 0199')
  assert.equal(contact.mobile, '', "the demo's second number is not the customer's")
  // The `tel:` form of src/lib/tel.ts (`+` only in front, digits only), the one the contact card prints for the phone.
  assert.equal(fieldsOf(plan, 'reservation').online_link, 'tel:+842365550199')
  assert.equal(plan.patches.get('contact/contact/en').origins.phone, 'customer')
})

test("no phone in the brief keeps the demo's numbers as placeholders and says so", () => {
  const plan = planFrom(map, seed, factsFrom({ name: 'Trattoria Lume', contact: '12 Bach Dang, Da Nang' }))
  const contact = fieldsOf(plan, 'contact')
  assert.equal('phone' in contact, false)
  assert.equal('mobile' in contact, false)
  assert.equal('online_link' in fieldsOf(plan, 'reservation'), false)
  const named = plan.unanswered.map((u) => u.rule)
  for (const rule of [
    'contact.contact.phone',
    'contact.contact.mobile',
    'reservation.reservation.online_link'
  ])
    assert.ok(named.includes(rule), `${rule} is named in the report`)
})
