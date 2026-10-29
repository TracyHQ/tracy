// A direct-message link is a contact channel, not a social profile (spec TracyHQ/tracy#189 round 9, class C4). Measured on
// a real build: the footer line "Message us on Instagram", pointed by the contact step at the planned direct-message link,
// was turned back into the profile because its words name the network. An invented ceramics studio.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joomlaIdentityHtml } from '../src/sites/brief-engines/joomla-plan-identity.js'

const plan = {
  socials: { keep: { instagram: 'https://www.instagram.com/kiln.and.clay/' } },
  channels: [{ kind: 'message', href: 'https://ig.me/m/kiln.and.clay', label: 'Message us on Instagram' }]
}

test('a direct-message link keeps its target; a profile link still takes the profile', () => {
  const html =
    '<a href="https://ig.me/m/kiln.and.clay">Message us on Instagram</a>' +
    '<a href="#"><i class="fa fa-instagram"></i></a>'
  const out = joomlaIdentityHtml(html, plan)
  assert.match(out.html, /href="https:\/\/ig\.me\/m\/kiln\.and\.clay">Message us on Instagram/)
  assert.match(
    out.html,
    /href="https:\/\/www\.instagram\.com\/kiln\.and\.clay\/"[^>]*><i class="fa fa-instagram">/
  )
})

test("a line in the planned message channel's words is left to the contact step, whatever its target", () => {
  const out = joomlaIdentityHtml('<a href="#">Message us on Instagram</a>', plan)
  assert.equal(out.html, '<a href="#">Message us on Instagram</a>')
})
