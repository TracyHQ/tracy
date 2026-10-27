/**
 * The header rewrite: recipients from To/Cc/Bcc, Bcc gone, From on a domain Tracy signs for, the
 * site's own From kept as Reply-To, and the body — every byte of it — untouched.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decodeHeader,
  MAX_MESSAGE_BYTES,
  parseAddressList,
  rewriteMessage,
  splitMessage
} from '../src/mail/site-mail/message.js'

const base = { mode: 'tracy', label: 'lantern', siteMailDomain: 'sites.example.test' }
const msg = (lines, body = 'Hello\r\n', eol = '\r\n') =>
  Buffer.from(lines.join(eol) + eol + eol + body, 'latin1')
const headersOf = (raw) => splitMessage(raw).fields

test('address lists: display names, quoted commas, comments, groups, empty groups', () => {
  assert.deepEqual(parseAddressList('"Doe, John" <john@x.test>, plain@y.test'), [
    { address: 'john@x.test', display: '"Doe, John"' },
    { address: 'plain@y.test', display: null }
  ])
  assert.deepEqual(parseAddressList('Team: a@x.test, B <b@x.test>;, c@x.test (Carol)'), [
    { address: 'a@x.test', display: null },
    { address: 'b@x.test', display: 'B' },
    { address: 'c@x.test', display: null }
  ])
  assert.deepEqual(parseAddressList('undisclosed-recipients:;'), [])
  assert.deepEqual(parseAddressList('=?UTF-8?B?VMOqbg==?= <t@x.test>'), [
    { address: 't@x.test', display: '=?UTF-8?B?VMOqbg==?=' }
  ])
  assert.deepEqual(parseAddressList('<@relay.test:u@x.test>'), [{ address: 'u@x.test', display: null }])
  assert.equal(parseAddressList('not an address'), null)
  assert.equal(parseAddressList('Broken <a@x.test'), null)
})

test('mode tracy: From rewritten with the display name kept, Reply-To = original From, Bcc gone', () => {
  const raw = msg(
    [
      'To: "Doe, John" <john@x.test>, jane@x.test',
      'Cc: carol@x.test',
      'Bcc: secret@x.test,',
      ' hidden@x.test',
      'From: "Lantern Shop" <admin@gmail.test>',
      'Sender: someone@gmail.test',
      'Return-Path: <bounce@gmail.test>',
      'Subject: Order',
      'MIME-Version: 1.0'
    ],
    '--b\r\n.leading dot\r\nbinary\xff\r\n'
  )
  const out = rewriteMessage(raw, base)
  assert.equal(out.ok, true)
  assert.deepEqual(out.recipients, [
    'john@x.test',
    'jane@x.test',
    'carol@x.test',
    'secret@x.test',
    'hidden@x.test'
  ])
  assert.equal(out.envelopeFrom, 'lantern@sites.example.test')
  assert.equal(out.rewritten, true)
  const fields = headersOf(out.raw)
  const get = (n) => fields.filter((f) => f.lower === n).map((f) => f.value)
  assert.deepEqual(get('from'), ['"Lantern Shop" <lantern@sites.example.test>'])
  assert.deepEqual(get('reply-to'), ['"Lantern Shop" <admin@gmail.test>'])
  assert.deepEqual(get('bcc'), [])
  assert.deepEqual(get('sender'), [])
  assert.deepEqual(get('return-path'), [])
  assert.deepEqual(get('subject'), ['Order'])
  assert.equal(get('message-id').length, 1, 'a Message-ID is added when the site sent none')
  assert.equal(get('date').length, 1)
  // The body is byte-identical: same tail, dot and 0xff included.
  const body = splitMessage(out.raw).body
  assert.deepEqual(body, splitMessage(raw).body)
})

test('mode tracy: a site Reply-To is kept; no From at all gets the label as display name', () => {
  const kept = rewriteMessage(
    msg([
      'To: a@x.test',
      'From: shop@gmail.test',
      'Reply-To: help@gmail.test',
      'Message-ID: <m1@x>',
      'Date: x'
    ]),
    base
  )
  const fields = headersOf(kept.raw)
  assert.deepEqual(
    fields.filter((f) => f.lower === 'reply-to').map((f) => f.value),
    ['help@gmail.test']
  )
  assert.equal(kept.messageId, 'm1@x')
  const bare = rewriteMessage(msg(['To: a@x.test', 'Subject: hi']), base)
  const from = headersOf(bare.raw).find((f) => f.lower === 'from').value
  assert.equal(from, '"lantern" <lantern@sites.example.test>')
  assert.equal(
    headersOf(bare.raw).some((f) => f.lower === 'reply-to'),
    false
  )
})

test('mode tracy-domain: the customer From is kept only on the verified domain', () => {
  const o = { ...base, mode: 'tracy-domain', verifiedDomain: 'shop.test' }
  const same = rewriteMessage(msg(['To: a@x.test', 'From: Shop <orders@SHOP.test>']), o)
  assert.equal(same.rewritten, false)
  assert.equal(same.envelopeFrom, 'orders@SHOP.test')
  assert.equal(
    headersOf(same.raw).some((f) => f.lower === 'reply-to'),
    false
  )

  const other = rewriteMessage(msg(['To: a@x.test', 'From: Shop <wordpress@lantern.test>']), o)
  assert.equal(other.envelopeFrom, 'noreply@shop.test')
  assert.equal(headersOf(other.raw).find((f) => f.lower === 'from').value, 'Shop <noreply@shop.test>')

  const unverified = rewriteMessage(msg(['To: a@x.test', 'From: orders@shop.test']), {
    ...o,
    verifiedDomain: null
  })
  assert.equal(unverified.envelopeFrom, 'lantern@sites.example.test')
})

test('mode own-smtp: From is the site own; Bcc still removed', () => {
  const out = rewriteMessage(msg(['To: a@x.test', 'Bcc: b@x.test', 'From: me@own.test']), {
    ...base,
    mode: 'own-smtp'
  })
  assert.equal(out.envelopeFrom, 'me@own.test')
  assert.deepEqual(out.recipients, ['a@x.test', 'b@x.test'])
  assert.equal(
    headersOf(out.raw).some((f) => f.lower === 'bcc'),
    false
  )
  const none = rewriteMessage(msg(['To: a@x.test']), {
    ...base,
    mode: 'own-smtp',
    fallbackFrom: 'u@own.test'
  })
  assert.equal(none.envelopeFrom, 'u@own.test')
})

test('LF-only messages (PHP on Linux) keep LF; folded headers are unfolded for reading', () => {
  const raw = msg(
    ['To: a@x.test,', '\tb@x.test', 'Subject: long', ' subject', 'From: s@x.test'],
    'Body\n',
    '\n'
  )
  const out = rewriteMessage(raw, base)
  assert.deepEqual(out.recipients, ['a@x.test', 'b@x.test'])
  assert.equal(out.raw.includes(Buffer.from('\r\n')), false)
  assert.equal(headersOf(out.raw).find((f) => f.lower === 'subject').value, 'long subject')
})

test('refusals: no separator, not a header, no recipient, bad address, too large', () => {
  const code = (raw) => {
    const r = rewriteMessage(raw, base)
    return r.ok ? 'ok' : `${r.status} ${r.code}`
  }
  assert.equal(code(Buffer.from('To: a@x.test\r\nSubject: x')), '400 SITE_MAIL_MALFORMED')
  assert.equal(code(Buffer.from('this is not a header\r\n\r\nbody')), '400 SITE_MAIL_MALFORMED')
  assert.equal(code(msg(['Subject: nobody'])), '400 SITE_MAIL_MALFORMED')
  assert.equal(code(msg(['To: undisclosed-recipients:;'])), '400 SITE_MAIL_MALFORMED')
  assert.equal(code(msg(['To: not an address'])), '400 SITE_MAIL_MALFORMED')
  assert.equal(code(msg(['To: a@x.test', 'From: ???'])), '400 SITE_MAIL_MALFORMED')
  assert.equal(code(Buffer.alloc(MAX_MESSAGE_BYTES + 1, 0x61)), '413 SITE_MAIL_TOO_LARGE')
})

test('the subject for the log: encoded words decoded, raw UTF-8 read as UTF-8, cut to 200', () => {
  assert.equal(
    decodeHeader('=?UTF-8?B?xJDGoW4gaMOgbmc=?= =?UTF-8?Q?_m=E1=BB=9Bi?='),
    '\u0110\u01a1n h\u00e0ng m\u1edbi'
  )
  assert.equal(decodeHeader(Buffer.from('\u0110\u01a1n', 'utf8').toString('latin1')), '\u0110\u01a1n')
  assert.equal(decodeHeader('x'.repeat(300)).length, 200)
  const out = rewriteMessage(msg(['To: a@x.test', 'Subject: =?ISO-8859-1?Q?caf=E9?=']), base)
  assert.equal(out.subject, 'caf\u00e9')
  assert.equal(rewriteMessage(msg(['To: a@x.test']), base).subject, null)
})
