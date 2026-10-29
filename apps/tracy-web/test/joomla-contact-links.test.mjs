// The Joomla brief engine writes the site plan's contact facts into the custom modules' contact lines, linked
// (spec TracyHQ/tracy#189, ticket #191). The bakery and the template's demo below are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moduleContactSteps } from '../src/sites/brief-engines/joomla-contact-links.js'

const contact = {
  phone: { value: '+44 20 7946 0321', href: 'tel:+442079460321' },
  email: { value: 'hello@copperleaf.example', href: 'mailto:hello@copperleaf.example' },
  whatsapp: { value: '+447700901111', href: 'https://wa.me/447700901111' }
}
const visible = new Set(['en-GB'])
const footer = {
  id: 7,
  published: 1,
  language: '*',
  content:
    '<ul><li><a href="#"><i class="fa fa-phone"></i> (555) 010-4477</a></li><li><a href="mailto:sales@demo.example">sales@demo.example</a></li></ul>'
}

test('a footer phone behind # and a demo mailbox lead to the business, with WhatsApp beside the phone', () => {
  const { steps } = moduleContactSteps({ modules: [footer], contact, visible })
  assert.equal(steps.length, 1)
  const html = steps[0].fields.content
  assert.match(html, /<a href="tel:\+442079460321"><i class="fa fa-phone"><\/i> \+44 20 7946 0321<\/a>/)
  assert.match(html, /<a href="mailto:hello@copperleaf\.example">hello@copperleaf\.example<\/a>/)
  assert.match(html, /<a href="https:\/\/wa\.me\/447700901111"[^>]*>WhatsApp us<\/a>/)
  assert.doesNotMatch(html, /demo\.example|555/)
})

test('with no mailbox in the brief, the demo mailbox is taken off, never left standing', () => {
  const { steps } = moduleContactSteps({ modules: [footer], contact: { phone: contact.phone }, visible })
  assert.doesNotMatch(steps[0].fields.content, /demo\.example/)
})

test('an unpublished module, a module of a hidden language, or a site plan without contact facts writes nothing', () => {
  const modules = [
    { ...footer, id: 8, published: 0 },
    { ...footer, id: 9, language: 'fr-FR' }
  ]
  assert.deepEqual(moduleContactSteps({ modules, contact, visible }).steps, [])
  assert.deepEqual(moduleContactSteps({ modules: [footer], contact: null, visible }).steps, [])
})
