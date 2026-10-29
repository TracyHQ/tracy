// The Contact page lists every channel as a link, says "By appointment" when the brief does, and no page of an
// appointment-only business invites a walk-in (spec TracyHQ/tracy#189 item 19). Fictional: a dog groomer, a dental clinic.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BY_APPOINTMENT,
  byAppointmentOf,
  contactPageFindings,
  contactPageHtml,
  contactPageLines
} from '../domain/contact-page.mjs'
import { planSite } from '../domain/site-plan.mjs'

const groomerPlan = {
  contact: {
    booking: { value: BY_APPOINTMENT, source: 'brief.inferred' },
    serviceArea: { value: 'Home visits across Northvale', source: 'business.serviceAreas' }
  },
  channels: [
    { kind: 'phone', value: '+1 555 0100', href: 'tel:+15550100', label: 'Call +1 555 0100' },
    { kind: 'phone', value: '+1 555 0101', href: 'tel:+15550101', label: 'Call +1 555 0101' },
    { kind: 'whatsapp', value: '+1 555 0100', href: 'https://wa.me/15550100', label: 'WhatsApp us' },
    {
      kind: 'message',
      network: 'instagram',
      value: 'instagram',
      href: 'https://ig.me/m/fluffy.paws.test',
      label: 'Message us on Instagram'
    }
  ]
}

test('a dog groomer by appointment: the Contact page lines start with it, then every channel as a link, then the area', () => {
  const lines = contactPageLines(groomerPlan)
  assert.deepEqual(
    lines.map((l) => [l.kind, l.href ?? null]),
    [
      ['booking', null],
      ['phone', 'tel:+15550100'],
      ['phone', 'tel:+15550101'],
      ['whatsapp', 'https://wa.me/15550100'],
      ['message', 'https://ig.me/m/fluffy.paws.test'],
      ['area', null]
    ]
  )
  assert.equal(lines[0].text, 'By appointment')
  const html = contactPageHtml(lines)
  assert.match(html, /<a href="tel:\+15550101">Call \+1 555 0101<\/a>/)
  assert.match(
    html,
    /<a href="https:\/\/ig\.me\/m\/fluffy\.paws\.test" target="_blank" rel="noopener noreferrer">/
  )
})

test('a dental clinic with a mailbox: the email is a mailto link; a channel with no followable link is left out', () => {
  const lines = contactPageLines({
    contact: { email: { value: 'desk@northgate.test', href: 'mailto:desk@northgate.test' } },
    channels: [
      { kind: 'phone', value: '+1 555 0142', href: 'tel:+15550142', label: 'Call +1 555 0142' },
      { kind: 'message', value: 'x', href: 'javascript:alert(1)', label: 'Bad' }
    ]
  })
  assert.deepEqual(
    lines.map((l) => l.href),
    ['tel:+15550142', 'mailto:desk@northgate.test']
  )
})

test('the brief says by appointment only through its inferred line, and the site plan carries it as a contact fact', () => {
  const brief = {
    sitemap: [
      { slug: 'contact', sections: [{ copy: 'x', inferred: [{ text: BY_APPOINTMENT, reason: 'r' }] }] }
    ]
  }
  assert.equal(byAppointmentOf(brief), true)
  assert.equal(
    byAppointmentOf({ sitemap: [{ slug: 'contact', sections: [{ copy: 'Open daily.' }] }] }),
    false
  )
})

const page = (path, body) => ({ path, status: 200, html: `<html><body>${body}</body></html>` })

test('by appointment: walk-in copy on any page and a missing channel link or booking line on the Contact page are findings', () => {
  const findings = contactPageFindings({
    plan: groomerPlan,
    contactPath: '/contact',
    pages: [
      page('/', '<h2>Come say hello at the salon</h2><p>Gentle grooming.</p>'),
      page(
        '/contact',
        '<h3>Visit</h3><button>Get directions</button><span>+1 555 0100</span><a href="https://wa.me/15550100">WhatsApp</a>'
      )
    ]
  })
  const kinds = findings.map((f) => `${f.kind} ${f.path}`)
  assert.ok(kinds.includes('walk-in-copy /'))
  assert.ok(kinds.includes('walk-in-copy /contact'), 'a lone "Get directions" button counts')
  assert.ok(kinds.includes('contact-booking-missing /contact'))
  assert.ok(findings.some((f) => f.kind === 'contact-channel-missing' && /tel:\+15550100/.test(f.why)))
  assert.ok(!findings.some((f) => f.kind === 'contact-channel-missing' && /wa\.me/.test(f.why)))
  assert.ok(kinds.includes('contact-phone-unlinked /contact'), 'a number printed as plain text is a finding')
})

test('a Contact page built from the lines passes, and a business open to walk-ins may say come visit', () => {
  const html = contactPageHtml(contactPageLines(groomerPlan))
  assert.deepEqual(
    contactPageFindings({ plan: groomerPlan, contactPath: '/contact', pages: [page('/contact', html)] }),
    []
  )
  const open = { contact: {}, channels: [] }
  assert.deepEqual(
    contactPageFindings({ plan: open, contactPath: '/contact', pages: [page('/', '<p>Come visit us.</p>')] }),
    []
  )
})

test('the site plan of an appointment-only brief holds the booking fact', () => {
  const brief = {
    business: { name: 'Fluffy Paws', phone: '+1 555 0100' },
    sitemap: [
      { slug: 'contact', sections: [{ copy: 'x', inferred: [{ text: BY_APPOINTMENT, reason: 'r' }] }] }
    ]
  }
  let plan
  try {
    plan = planSite(brief, { questions: [] }, { now: '2026-10-30T00:00:00Z' })
  } catch (error) {
    assert.fail(`planSite failed on a minimal brief: ${error.message}`)
  }
  assert.deepEqual(plan.contact.booking, { value: BY_APPOINTMENT, source: 'brief.inferred' })
})
