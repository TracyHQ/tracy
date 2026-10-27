/**
 * Cloudflare email obfuscation undone for the preview (`src/sites/cloudflare-email.js`): the
 * frame runs no script, so the server puts the addresses back.
 *
 *   node --test apps/tracy-web/test/cloudflare-email.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decodeCloudflareEmail, decodeCloudflareEmails } from '../src/sites/cloudflare-email.js'

/** Encodes the way Cloudflare does: a key byte, then every byte XOR the key. */
const encode = (address, key = 0x5a) =>
  [key, ...new TextEncoder().encode(address)]
    .map((b, i) => (i === 0 ? b : b ^ key).toString(16).padStart(2, '0'))
    .join('')

test('decodeCloudflareEmail: the address behind the hex, null for anything else', () => {
  assert.equal(decodeCloudflareEmail(encode('hello@northgate.example')), 'hello@northgate.example')
  assert.equal(decodeCloudflareEmail(encode('xin.chào@việt.vn', 0x13)), 'xin.chào@việt.vn')
  assert.equal(decodeCloudflareEmail('zz'), null)
  assert.equal(decodeCloudflareEmail('5a'), null, 'a key alone')
  assert.equal(decodeCloudflareEmail('5a1'), null, 'odd length')
  assert.equal(decodeCloudflareEmail(encode('no-at-sign')), null)
})

test('decodeCloudflareEmails: the link, the span and the script', () => {
  const hex = encode('hello@northgate.example')
  const page =
    '<p>Mail <a href="/cdn-cgi/l/email-protection#' +
    hex +
    '"><span class="__cf_email__" data-cfemail="' +
    hex +
    '">[email&#160;protected]</span></a></p>' +
    '<a href="https://demo.example/cdn-cgi/l/email-protection#' +
    hex +
    '" class="btn">Write to us</a>' +
    '<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>'
  assert.equal(
    decodeCloudflareEmails(page),
    '<p>Mail <a href="mailto:hello@northgate.example"><span class="__cf_email__">hello@northgate.example</span></a></p>' +
      '<a href="mailto:hello@northgate.example" class="btn">Write to us</a>'
  )
})

test('decodeCloudflareEmails: a page without obfuscation is returned as is; a bad value is left alone', () => {
  const plain = '<a href="mailto:a@b.c">a@b.c</a>'
  assert.equal(decodeCloudflareEmails(plain), plain)
  const bad = '<a href="/cdn-cgi/l/email-protection#zz">x</a>'
  assert.equal(decodeCloudflareEmails(bad), bad)
  const scripted = '<span class="__cf_email__" data-cfemail="' + encode('a<b@c.d') + '">x</span>'
  assert.equal(
    decodeCloudflareEmails(scripted),
    '<span class="__cf_email__">a&lt;b@c.d</span>',
    'escaped on the way back'
  )
})

test('decodeCloudflareEmails: the markup measured on the Business Joomla demo (13/10/2026), whatever the attribute order or the script host', () => {
  // The two addresses of the demo's home as the door served them: an anchor at the protection path around a
  // `__cf_email__` span, each with its own key, inside a list item; the script on the demo's own absolute address.
  const li =
    '<li><a href="/cdn-cgi/l/email-protection#2152404d4452614f4e535549464055440c484f450f5354">' +
    '<span class="__cf_email__" data-cfemail="a2d1c3cec7d1e2cccdd0d6cac5c3d6c78fcbccc68cd0d7">[email&#160;protected]</span></a></li>'
  const script =
    '<script data-cfasync="false" src="https://business-joomla.tracy.site/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>'
  const decoded =
    '<li><a href="mailto:sales@northgate-ind.ru"><span class="__cf_email__">sales@northgate-ind.ru</span></a></li>'
  assert.equal(decodeCloudflareEmails(`<ul>${li}${li}</ul>${script}`), `<ul>${decoded}${decoded}</ul>`)
  // `data-cfemail` before `class`, a title in between, single quotes, and the key on the anchor itself.
  const swapped =
    "<a data-cfemail='e390828f8690a38d8c91978b84829786ce8a8d87cd9196' title='Mail' class='__cf_email__ x'>[email&#160;protected]</a>" +
    '<script src="//business-joomla.tracy.site/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js" data-cfasync="false" async></script>'
  assert.equal(
    decodeCloudflareEmails(swapped),
    "<a title='Mail' class='__cf_email__ x'>sales@northgate-ind.ru</a>"
  )
})
