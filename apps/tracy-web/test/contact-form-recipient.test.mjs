// A contact form shows only when it has a real recipient, and the report says it is off only after the built pages were
// read (COO decision, spec TracyHQ/tracy#189 item 19). Two fictional trades: a bakery and a dental clinic.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactSteps } from '../src/sites/brief-engines/joomla-tidy.js'
import { checkContactForms, CONTACT_FORM_OFF_NOTE } from '../src/opportunities-build/contact-form-check.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

const door =
  ({ contacts = [], menu = [] }) =>
  async ({ action, params }) => {
    if (action !== 'content.list') return { ok: true, items: [] }
    const rows = params.kind === 'contact' ? contacts : params.kind === 'menuItem' ? menu : []
    return { ok: true, items: params.offset ? [] : rows }
  }

/** The template's contact record after its address was emptied, still linked to the account that installed it. */
const linked = (params = {}) => ({
  id: 4,
  published: 1,
  language: '*',
  name: 'Head office',
  email_to: '',
  user_id: 42,
  telephone: '',
  params: JSON.stringify({ show_email: '', show_email_form: '', ...params })
})
const entry = (id, contactId, params) => ({
  id,
  published: 1,
  language: '*',
  type: 'component',
  link: `index.php?option=com_contact&view=contact&id=${contactId}`,
  params: JSON.stringify(params)
})

test('a bakery with no email: the record linked to an account has its form switched off in its own settings', async () => {
  const { steps, note } = await contactSteps({
    apply: door({ contacts: [linked()] }),
    siteKey: 's',
    given: { name: 'Crumb & Crust Bakery' },
    visible: new Set()
  })
  const record = steps.find((s) => s.kind === 'contact' && s.id === 4)
  assert.ok(record, 'the record is written')
  const params = JSON.parse(record.fields.params)
  assert.equal(params.show_email_form, '0', 'the form is switched off where Joomla decides it')
  assert.equal(params.show_email, '', "the record's other settings are kept")
  assert.ok(note, 'the report says what was done')
  assert.doesNotMatch(
    note,
    /form is off/,
    'the engine does not claim a form is gone before the pages are read'
  )
})

test("a dental clinic with no email: the menu entry that turns the form on for its record is switched off too, another record's entry is not", async () => {
  const { steps } = await contactSteps({
    apply: door({
      contacts: [linked({ show_email_form: '0' })],
      menu: [entry(140, 4, { show_email_form: '1', show_name: '0' }), entry(141, 9, { show_email_form: '1' })]
    }),
    siteKey: 's',
    given: { name: 'Northgate Dental' },
    visible: new Set()
  })
  const own = steps.find((s) => s.kind === 'menuItem' && s.id === 140)
  assert.ok(own, 'the entry of this record is written')
  assert.deepEqual(JSON.parse(own.fields.params), { show_email_form: '0', show_name: '0' })
  assert.ok(!steps.some((s) => s.kind === 'menuItem' && s.id === 141), "another record's entry is left")
  assert.ok(!steps.some((s) => s.kind === 'contact' && s.fields.params), 'a record already off gets no write')
})

test("a bakery that gave its email keeps the form's settings as they are", async () => {
  const { steps, note } = await contactSteps({
    apply: door({ contacts: [linked()], menu: [entry(140, 4, { show_email_form: '1' })] }),
    siteKey: 's',
    given: { email: 'orders@crumbandcrust.test' },
    visible: new Set()
  })
  assert.equal(steps.find((s) => s.id === 4).fields.email_to, 'orders@crumbandcrust.test')
  assert.ok(!steps.some((s) => s.fields.params), 'no setting is touched')
  assert.equal(note, null)
})

const contactPage = (form) => `<html><body><main><h3>Drop us a line</h3>${form}</main></body></html>`
const joomlaForm =
  '<form id="contact-form" class="form-validate"><input type="text" name="jform[contact_name]"><input type="email" name="jform[contact_email]"><textarea name="jform[contact_message]"></textarea></form>'
const searchForm = '<form class="search"><input type="search" name="q"></form>'
const clinic = { business: { name: 'Northgate Dental', phone: '+1 555 0142' } }

test('a form that still shows without an email of the owner is a finding, and the report never says it is off', () => {
  const out = checkContactForms({
    pages: [{ path: '/contact', status: 200, html: contactPage(joomlaForm) }],
    brief: clinic
  })
  assert.equal(out.findings.length, 1)
  assert.equal(out.findings[0].path, '/contact')
  assert.equal(out.note, null)
})

test('with no message form on any page the report says the form is off; a search box is not a contact form', () => {
  const out = checkContactForms({
    pages: [{ path: '/contact', status: 200, html: contactPage(searchForm) }],
    brief: clinic
  })
  assert.deepEqual(out.findings, [])
  assert.equal(out.note, CONTACT_FORM_OFF_NOTE)
})

test('a form hidden from visitors is not judged, and a brief with an email has a recipient', () => {
  const hidden = contactPage(`<div hidden>${joomlaForm}</div>`)
  assert.deepEqual(
    checkContactForms({ pages: [{ path: '/contact', status: 200, html: hidden }], brief: clinic }).findings,
    []
  )
  const bakery = { business: { name: 'Crumb & Crust Bakery', email: 'orders@crumbandcrust.test' } }
  const withEmail = checkContactForms({
    pages: [{ path: '/contact', status: 200, html: contactPage(joomlaForm) }],
    brief: bakery
  })
  assert.deepEqual(withEmail, { recipient: true, findings: [], note: null })
})

test('the leftover check fails a build whose kept page still shows a form without a recipient', async () => {
  const pages = { '/': contactPage(''), '/contact': contactPage(joomlaForm) }
  const report = await runLeftoverCheck({
    readPage: async (path) =>
      pages[path] ? { status: 200, html: pages[path] } : { status: 404, html: 'Not found' },
    check: () => ({ pass: true, findings: [], counts: {} }),
    contentMap: { slots: [] },
    brief: clinic,
    paths: ['/contact']
  })
  assert.equal(report.contactForms.findings.length, 1)
  assert.ok(report.findings.some((f) => f.kind === 'contact-form' && f.path === '/contact'))
  assert.equal(report.pass, false)
})

test("a florist with no email: the record's own menu entry that leaves the form setting empty is switched off too, since the component's global option fills an empty entry and beats the record on that page", async () => {
  const { steps } = await contactSteps({
    apply: door({
      contacts: [linked()],
      menu: [entry(150, 4, { show_email_form: '', show_name: '0' }), entry(151, 4, { show_name: '0' })]
    }),
    siteKey: 's',
    given: { name: 'Petal Lane Florist' },
    visible: new Set()
  })
  for (const id of [150, 151]) {
    const own = steps.find((s) => s.kind === 'menuItem' && s.id === id)
    assert.ok(own, `the entry ${id} of this record is written`)
    assert.equal(JSON.parse(own.fields.params).show_email_form, '0')
    assert.equal(JSON.parse(own.fields.params).show_name, '0', "the entry's other settings are kept")
  }
})
