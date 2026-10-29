// The component heading over the Contact page's channel list (#189, round 10). Joomla prints "Miscellaneous Information" (in
// the site language) over the record's extra information; a brief build writes its channel list there. The site refuses an
// en-GB language override by design, so the heading is taken off by the leftover head block, on the pages that carry the
// channel list only, in core markup and in a template override alike. Made-up businesses of two trades.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'
import { leftoverHeadBlock } from 'website-opportunities/domain/outside-map.mjs'
import { CONTACT_LIST_HEADINGS } from '../src/sites/brief-engines/joomla-contact-page.js'

const channels = (name) =>
  `<ul class="contact-channels"><li class="contact-line contact-line--phone"><a href="tel:+15550100">Call ${name}</a></li></ul>`

/** Joomla 5 core layout: the heading is the sibling before the block. */
const core = (misc) =>
  `<div class="com-contact"><h3>Contact</h3><h3>Miscellaneous Information</h3><div class="com-contact__miscinfo contact-miscinfo"><dl><dd><div class="contact-misc">${misc}</div></dd></dl></div></div>`
/** A template override: the heading inside the block. */
const override = (misc) =>
  `<div class="item-inner"><h3>Contact</h3><div class="contact-miscinfo"><h3>Miscellaneous Information</h3><span class="jicons-icons"></span><div class="contact-misc">${misc}</div></div></div>`

/** The selectors of the head block rule that hides the headings. */
function hidden(html) {
  const block = leftoverHeadBlock({ replacedHeadings: CONTACT_LIST_HEADINGS })
  const rule = /\/\* component headings[^*]*\*\/\n([^{]+)\{display:none !important\}/.exec(block)
  assert.ok(rule, block)
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`)
  return [...document.querySelectorAll(rule[1].replace(/\n/g, ' '))].map((node) => node.textContent)
}

for (const [trade, name] of [
  ['tailor', 'Fernhill Tailoring'],
  ['bike repair', 'Spokewise Cycles']
]) {
  test(`${trade}: the component heading over the channel list is hidden, in core markup and in an override`, () => {
    assert.deepEqual(hidden(core(channels(name))), ['Miscellaneous Information'])
    assert.deepEqual(hidden(override(channels(name))), ['Miscellaneous Information'])
    // An override that keeps the core class and moves the heading inside: the record's "Contact" before it stays.
    assert.deepEqual(
      hidden(
        override(channels(name)).replace(
          'class="contact-miscinfo"',
          'class="com-contact__miscinfo contact-miscinfo"'
        )
      ),
      ['Miscellaneous Information']
    )
  })

  test(`${trade}: a contact record without the channel list keeps its heading`, () => {
    assert.deepEqual(hidden(core(`<p>${name} answers within a day.</p>`)), [])
    assert.deepEqual(hidden(override(`<p>${name} answers within a day.</p>`)), [])
  })
}
