import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateCode, hashCode } from '../src/identity/otp.js'
import { signInCodeMail } from '../src/mail/emails.js'

test('a code is six digits and keeps leading zeros', () => {
  const zeros = generateCode((arr) => arr.fill(0))
  assert.equal(zeros, '000000')
  assert.match(generateCode(), /^\d{6}$/)
})

test('the hash binds code, email and pepper', async () => {
  const a = await hashCode('123456', 'a@b.c', 'p')
  assert.notEqual(a, await hashCode('123456', 'x@b.c', 'p'))
  assert.notEqual(a, await hashCode('123456', 'a@b.c', 'q'))
  assert.equal(a, await hashCode('123456', 'A@B.C', 'p'))
})

// ── the mail that carries the code ─────────────────────────────────────────────────────────────

test('signInCodeMail: the code is IN THE SUBJECT — the Worker shape, and the reason it is that shape', () => {
  const mail = signInCodeMail('482913')
  // `workers/mail/src/emails.js`'s `magicLinkCode`: `{{code}} is your Tracy sign-in code`. The
  // subject is what a phone shows on the lock screen, so a code only in the body costs every
  // person an extra step on the one screen where they are least willing to take one.
  assert.equal(mail.subject, '482913 is your Tracy sign-in code')
  assert.match(mail.text, /^482913$/m)
  assert.match(mail.text, /valid for 10 minutes/)
})

test('signInCodeMail: a code that fails its shape check never reaches the subject line', () => {
  // `asCode` drops anything outside `[A-Za-z0-9-]{1,16}`. The Worker has a plain subject for
  // exactly this case (`signin_subject_plain`) rather than mailing an empty-looking one.
  const mail = signInCodeMail('4829 13\nBcc: someone@example.com')
  // "code", the word every other line of this mail uses (#807): the subject said "OTP".
  assert.equal(mail.subject, 'Your sign-in code')
  assert.ok(!mail.text.includes('someone@example.com'))
  for (const bad of ['', '   ', '12 34', '<b>1</b>', 'x'.repeat(17), '1\r\nBcc: someone@example.com']) {
    const plain = signInCodeMail(bad)
    assert.equal(plain.subject, 'Your sign-in code', JSON.stringify(bad))
    assert.doesNotMatch(plain.subject, /[\r\n<>]/)
    assert.doesNotMatch(`${plain.text}${plain.html ?? ''}`, /someone@example\.com|<b>1<\/b>/)
  }
})
