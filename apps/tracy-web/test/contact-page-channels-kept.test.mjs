// The Contact page keeps the channel list the build wrote, and the final check reads the page's own body, not the footer
// every page shares (spec TracyHQ/tracy#189 item 19, round 11). Measured 30/10/2026 on a brief build: the tidy-up wrote the
// channel list into the contact record, then the records write that empties demo lines, computed from the record as read
// before the tidy-up, wrote the old field back with its paragraph emptied; the page showed an empty "Contact" column while
// the check passed, because the footer on every page held the same phone and WhatsApp links.
// Two fictional trades: a mobile bike repairer and a calligraphy teacher.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withoutStaleRecordFields } from '../src/sites/brief-engines/joomla-contact-page.js'
import { checkContactPage } from '../src/opportunities-build/contact-page-check.js'

const list = '<ul class="contact-channels"><li><a href="tel:+15550170">Call +1 555 0170</a></li></ul>'

test('bike repairer: a later records write of the contact record never puts back the field the tidy-up wrote', () => {
  const tidy = [
    { kind: 'contact', id: 3, fields: { misc: list, params: '{"show_misc":"1"}' } },
    { kind: 'menuItem', id: 40, fields: { params: '{}' } }
  ]
  const records = [
    // Computed from the record as read before the tidy-up: its demo paragraph emptied, and its demo heading emptied.
    { kind: 'contact', id: 3, fields: { misc: '<p>&nbsp;</p>', name: ' ' } },
    { kind: 'module', id: 12, fields: { content: '<p></p>' } }
  ]
  const { steps, held } = withoutStaleRecordFields(records, tidy)
  assert.deepEqual(steps, [
    { kind: 'contact', id: 3, fields: { name: ' ' } },
    { kind: 'module', id: 12, fields: { content: '<p></p>' } }
  ])
  assert.deepEqual(held, [{ kind: 'contact', id: 3, keys: ['misc'] }])
  // A step left with nothing to write is not written at all.
  const only = withoutStaleRecordFields([{ kind: 'contact', id: 3, fields: { misc: '' } }], tidy)
  assert.deepEqual(only.steps, [])
})

/** A page of a fictional site: a body, and a footer every page shares with the given links. */
const page = (path, body, footer) => ({
  path,
  status: 200,
  html: `<html><body><main>${body}</main><footer>${footer}</footer></body></html>`
})

const teacherPlan = {
  pages: [
    { role: 'home', path: '/', decision: 'keep' },
    { role: 'contact', path: '/visit/contact', decision: 'keep' }
  ],
  contact: { booking: { value: 'By appointment.', source: 'brief.inferred' } },
  channels: [
    { kind: 'phone', value: '+1 555 0180', href: 'tel:+15550180', label: 'Call +1 555 0180' },
    { kind: 'whatsapp', value: '+1 555 0180', href: 'https://wa.me/15550180', label: 'WhatsApp us' }
  ]
}
const footer =
  '<a href="tel:+15550180">Call +1 555 0180</a> <a href="https://wa.me/15550180">WhatsApp us</a> Book an appointment'

test('calligraphy teacher: channels only in the shared footer are missing from the Contact page body', () => {
  const pages = [
    page('/', '<h1>Brush lettering</h1>', footer),
    page('/visit/contact', '<h3>Contact</h3><div class="contact-misc"><p>&nbsp;</p></div>', footer)
  ]
  const kinds = checkContactPage({ pages, sitePlan: teacherPlan }).map((f) => f.kind)
  assert.equal(kinds.filter((k) => k === 'contact-channel-missing').length, 2)
  assert.ok(
    kinds.includes('contact-booking-missing'),
    'the footer saying appointment is not the page saying so'
  )
})

test('calligraphy teacher: the channels listed in the Contact page body pass, the footer beside them or not', () => {
  const body =
    '<ul class="contact-channels"><li>By appointment</li><li><a href="tel:+15550180">Call +1 555 0180</a></li><li><a href="https://wa.me/15550180">WhatsApp us</a></li></ul>'
  for (const shared of [footer, ''])
    assert.deepEqual(
      checkContactPage({
        pages: [page('/', '<h1>Brush lettering</h1>', shared), page('/visit/contact', body, shared)],
        sitePlan: teacherPlan
      }),
      []
    )
  // A site read with its Contact page alone still judges that page as a whole.
  assert.deepEqual(
    checkContactPage({ pages: [page('/visit/contact', body, footer)], sitePlan: teacherPlan }),
    []
  )
})
