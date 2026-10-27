/**
 * Joomla's email cloaking in the design system preview (16/10/2026): the preview frame runs no script, so
 * the `joomla-hidden-mail` web component never defines and the visitor read "This email address is being
 * protected from spambots. You need JavaScript enabled to view it." where the demo shows its address
 * (JA Directory's Contact "Mail Us" card). Markup read on Joomla 6.1 stands (`HTMLHelper::_('email.cloak')`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decodeJoomlaEmails } from '../src/sites/joomla-email.js'

const NOTICE = 'This email address is being protected from spambots. You need JavaScript enabled to view it.'
// Joomla 6.1, a contact page of a JA quickstart, byte for byte
const CLOAK = `<joomla-hidden-mail  is-link="1" is-email="1" first="bm8tcmVwbHk=" last="Z21haWwuY29t" text="bm8tcmVwbHlAZ21haWwuY29t" base="" >${NOTICE}</joomla-hidden-mail>`
const b64 = (/** @type {string} */ s) => Buffer.from(s, 'utf8').toString('base64')

test('a cloaked address becomes the mailto link the web component would make', () => {
  const out = decodeJoomlaEmails(`<p>Mail Us ${CLOAK}</p>`)
  assert.equal(out, '<p>Mail Us <a href="mailto:no-reply@gmail.com">no-reply@gmail.com</a></p>')
  assert.ok(!out.includes(NOTICE))
})

test('a cloak with its own words, attributes and no link keeps them, made safe', () => {
  const linked = `<joomla-hidden-mail class="mail" is-link="1" is-email="0" first="${b64('a')}" last="${b64('b.co')}" text="${b64('Write <b>us</b> & co')}" base="/sub" >${NOTICE}</joomla-hidden-mail>`
  assert.equal(decodeJoomlaEmails(linked), '<a class="mail" href="mailto:a@b.co">Write us &amp; co</a>')
  const plain = `<joomla-hidden-mail is-link="0" is-email="1" first="${b64('ü')}" last="${b64('x.de')}" text="" base="">${NOTICE}</joomla-hidden-mail>`
  assert.equal(decodeJoomlaEmails(plain), '<span>ü@x.de</span>')
})

test('a cloak that does not decode, and a page without one, stay as they are', () => {
  const bad = `<joomla-hidden-mail is-link="1" first="%%%" last="x" text="" base="">${NOTICE}</joomla-hidden-mail>`
  assert.equal(decodeJoomlaEmails(bad), bad)
  const page = '<p>hello</p>'
  assert.equal(decodeJoomlaEmails(page), page)
  // an address that would break out of the attribute is not put in one
  const evil = `<joomla-hidden-mail is-link="1" first="${b64('a"onmouseover="x')}" last="${b64('b.co')}" text="" base="">${NOTICE}</joomla-hidden-mail>`
  assert.equal(decodeJoomlaEmails(evil), evil)
})

test('the preview page of a Joomla demo carries the address, not the notice', async () => {
  const { wornPageOf } = await import('../src/sites/design-system-preview-page.js')
  const html = `<!doctype html><html><head></head><body><div class="contact">${CLOAK}</div></body></html>`
  const fetchImpl = /** @type {any} */ (
    async () => new Response(html, { headers: { 'content-type': 'text/html' } })
  )
  const out = await wornPageOf({
    platform: 'joomla',
    bytes: '',
    inner: new URL('http://ja-demo-web/'),
    pub: new URL('https://ja-demo.tracy.site/'),
    fetchImpl,
    path: '/index.php/contact-us'
  })
  assert.ok('html' in out)
  assert.ok(!out.html.includes(NOTICE), 'no notice left')
  assert.match(out.html, /<a href="mailto:no-reply@gmail\.com">no-reply@gmail\.com<\/a>/)
})
