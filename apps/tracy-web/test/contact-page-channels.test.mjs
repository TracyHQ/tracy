// A Joomla contact record becomes a Contact page that links every channel of the site plan, says "By appointment" when the
// brief does, and keeps no plain-text number line; the final check judges the served pages (spec TracyHQ/tracy#189 item 19).
// Two fictional trades: a mobile dog groomer and a piano teacher.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactSteps } from '../src/sites/brief-engines/joomla-tidy.js'
import { writeMiscHeading, MISC_HEADING_KEY } from '../src/sites/brief-engines/joomla-contact-page.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

const door =
  ({ contacts = [], menu = [] }) =>
  async ({ action, params }) => {
    if (action !== 'content.list') return { ok: true, items: [] }
    const rows = params.kind === 'contact' ? contacts : params.kind === 'menuItem' ? menu : []
    return { ok: true, items: params.offset ? [] : rows }
  }

const record = {
  id: 7,
  published: 1,
  language: '*',
  name: 'Get in touch',
  email_to: '',
  user_id: 42,
  telephone: '',
  misc: '<p>Lorem ipsum studio</p>',
  params: JSON.stringify({ show_telephone: '', show_misc: '' })
}
const contactEntry = {
  id: 160,
  published: 1,
  language: '*',
  type: 'component',
  link: 'index.php?option=com_contact&view=contact&id=7',
  params: JSON.stringify({ show_telephone: '', show_email_form: '', show_name: '0' })
}
const groomer = {
  contact: {
    booking: { value: 'By appointment.', source: 'brief.inferred' },
    serviceArea: { value: 'Home visits across Northvale', source: 'business.serviceAreas' }
  },
  channels: [
    { kind: 'phone', value: '+1 555 0100', href: 'tel:+15550100', label: 'Call +1 555 0100' },
    { kind: 'phone', value: '+1 555 0101', href: 'tel:+15550101', label: 'Call +1 555 0101' },
    { kind: 'whatsapp', value: '+1 555 0100', href: 'https://wa.me/15550100', label: 'WhatsApp us' },
    {
      kind: 'message',
      value: 'instagram',
      href: 'https://ig.me/m/fluffy.paws.test',
      label: 'Message us on Instagram'
    }
  ]
}

test('a dog groomer by appointment: the record lists every channel as a link and the plain number lines are switched off on the record and its entry', async () => {
  const { steps } = await contactSteps({
    apply: door({ contacts: [record], menu: [contactEntry] }),
    siteKey: 's',
    given: { phone: '+1 555 0100', name: 'Fluffy Paws' },
    visible: new Set(),
    contact: groomer.contact,
    channels: groomer.channels
  })
  const own = steps.find((s) => s.kind === 'contact' && s.id === 7)
  assert.ok(own, 'the record is written')
  assert.match(own.fields.misc, /^<ul class="contact-channels"><li[^>]*>By appointment<\/li>/)
  for (const href of [
    'tel:+15550100',
    'tel:+15550101',
    'https://wa.me/15550100',
    'https://ig.me/m/fluffy.paws.test'
  ])
    assert.ok(own.fields.misc.includes(`href="${href}"`), `${href} is linked`)
  assert.match(own.fields.misc, /Home visits across Northvale<\/li><\/ul>$/)
  const params = JSON.parse(own.fields.params)
  assert.equal(params.show_telephone, '0')
  assert.equal(params.show_mobile, '0')
  assert.equal(params.show_misc, '1')
  assert.equal(params.show_email_form, '0', 'with no email the form stays off')
  const entry = steps.find((s) => s.kind === 'menuItem' && s.id === 160)
  assert.ok(entry, 'the entry of the record is written: its empty values would let the global options win')
  const set = JSON.parse(entry.fields.params)
  assert.deepEqual(
    [set.show_telephone, set.show_email_form, set.show_misc, set.show_name],
    ['0', '0', '1', '0']
  )
})

test('a piano teacher with no channel in the plan keeps the number lines as the template had them', async () => {
  const { steps } = await contactSteps({
    apply: door({ contacts: [record], menu: [contactEntry] }),
    siteKey: 's',
    given: { email: 'lessons@keys.test' },
    visible: new Set(),
    contact: {},
    channels: []
  })
  assert.ok(!steps.some((s) => s.fields.params), 'no setting is written')
  assert.ok(!steps.some((s) => s.fields.misc), 'the extra information is not rewritten')
})

test('the default "Miscellaneous Information" heading is replaced by the list role in English languages only', async () => {
  const calls = []
  const out = await writeMiscHeading({
    apply: async (call) => {
      calls.push(call)
      return { ok: true, written: 1 }
    },
    siteKey: 's',
    template: 'tpl_demo',
    locales: ['en-GB', 'fr-FR']
  })
  assert.deepEqual(out.written, ['en-GB'])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.locale, 'en-GB')
  assert.equal(calls[0].params.strings[MISC_HEADING_KEY], 'How to reach us')
  assert.match(out.note, /fr-FR keep the translated default heading/)
})

test('the leftover check fails a Contact page with plain numbers and walk-in copy for a business by appointment', async () => {
  const sitePlan = {
    ...groomer,
    pages: [
      { id: 'home', path: '/', role: 'home', decision: 'keep' },
      { id: 'contact', path: '/contact', role: 'contact', decision: 'keep' }
    ]
  }
  const pages = {
    '/': '<html><body><h2>Grooming at your door</h2></body></html>',
    '/index.php/contact':
      '<html><body><h3>Come visit</h3><dd>+1 555 0100</dd><a href="https://wa.me/15550100">WhatsApp us</a></body></html>'
  }
  const report = await runLeftoverCheck({
    readPage: async (path) =>
      pages[path] ? { status: 200, html: pages[path] } : { status: 404, html: 'Not found' },
    check: () => ({ pass: true, findings: [], counts: {} }),
    contentMap: { slots: [] },
    brief: { business: { name: 'Fluffy Paws', phone: '+1 555 0100' } },
    sitePlan,
    paths: ['/index.php/contact']
  })
  const kinds = new Set(report.contactPage.map((f) => f.kind))
  for (const kind of [
    'walk-in-copy',
    'contact-booking-missing',
    'contact-phone-unlinked',
    'contact-channel-missing'
  ])
    assert.ok(kinds.has(kind), `${kind} is found`)
  assert.equal(report.pass, false)
})
