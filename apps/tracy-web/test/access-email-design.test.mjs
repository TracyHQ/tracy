import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODE_TTL_MS } from '../src/lib/policy.js'
import { addedToWorkspace, inviteMail, signInCodeMail, betaMail } from '../src/mail/emails.js'
import { resendTransport } from '../src/mail/transport.js'

test('OTP renders the reviewed HTML while retaining code in subject and text fallback', () => {
  const mail = signInCodeMail('123456')
  assert.equal(mail.subject, '123456 is your Tracy sign-in code')
  assert.match(mail.text, /^123456$/m)
  assert.match(mail.html, /lang="en"/)
  assert.match(mail.html, /class="mail-code"[^>]*>123456</)
  // #794: the number is the policy's, in the HTML, the hidden preheader and the text fallback.
  const minutes = CODE_TTL_MS / 60_000
  assert.ok(mail.html.includes(`The code is valid for ${minutes} minutes.`))
  assert.ok(mail.html.includes(`Use 123456 to finish signing in. It is valid for ${minutes} minutes.`))
  assert.ok(mail.text.includes(`The code is valid for ${minutes} minutes.`))
  assert.doesNotMatch(mail.html + mail.text, /\{minutes\}/)
  assert.doesNotMatch(mail.html, /\{\{code\}\}/)
  const invalid = signInCodeMail('<img src=x onerror=alert(1)>')
  assert.equal(invalid.html, undefined)
  assert.equal(invalid.subject, 'Your sign-in code')
  assert.doesNotMatch(invalid.subject + invalid.text, /onerror/)
})

test('whitelist CTA preserves an encoded email or signed-token URL and escapes attribute separators', () => {
  for (const url of [
    'https://landing.example.com/whitelist/?email=visitor%2Bdemo%40example.com&source=login',
    'https://landing.example.com/beta/waitlist?t=signed-fixture&source=login'
  ]) {
    const mail = betaMail({ url })
    assert.match(mail.html, /Join the Tracy whitelist/)
    assert.ok(mail.html.includes(`href="${url.replaceAll('&', '&amp;')}"`))
    assert.ok(mail.text.includes(`\n${url}\n`), 'the link has a line of its own')
    assert.doesNotMatch(mail.html, /\{\{email\}\}/)
    assert.doesNotMatch(mail.html, /href="https:\/\/tracy\.ai\/whitelist/)
  }
  assert.throws(() => betaMail({ url: 'javascript:alert(1)' }), /invalid waitlist URL/)
  assert.throws(() => betaMail({ url: 'https://example.com/" onclick="alert(1)' }), /invalid waitlist URL/)
})

test('unavailable membership keeps retry guidance in HTML and text', () => {
  const mail = betaMail({ url: 'https://landing.example.com/whitelist/', unavailable: true })
  assert.equal(mail.subject, 'We could not check your Tracy access yet')
  for (const body of [mail.text, mail.html]) {
    assert.match(body, /We could not check your JoomlArt subscription right now/)
    assert.match(body, /please try signing in again/)
    assert.doesNotMatch(body, /Active JoomlArt subscribers can sign in/)
  }
})

test('Resend sends both parts without requiring an idempotency key and leaves plain-only mail plain', async () => {
  const calls = []
  const transport = resendTransport({
    key: 'fixture-key',
    from: 'Tracy <noreply@example.com>',
    fetchImpl: async (_url, options) => {
      calls.push({ payload: JSON.parse(options.body), headers: options.headers })
      return Response.json({ id: 'fixture-provider-id' })
    }
  })
  const mail = signInCodeMail('123456')
  await transport.send({ to: 'visitor@example.com', ...mail })
  assert.equal(calls[0].payload.html, mail.html)
  assert.equal(calls[0].payload.text, mail.text)
  assert.equal(calls[0].payload.from, 'Tracy <noreply@example.com>')
  assert.equal(calls[0].headers['Idempotency-Key'], undefined)
  await transport.send({ to: 'visitor@example.com', subject: 'Plain', text: 'Plain body' })
  assert.equal(calls[1].payload.html, undefined)
})

test('#794: a workspace invitation prints its action link escaped, and refuses one that is not http(s)', () => {
  const acceptUrl = 'https://tracy.test/ops/invite/7b0c1a52?from=mail&x=1'
  for (const build of [inviteMail, addedToWorkspace]) {
    const letter = build({
      inviterName: '<b>Boss</b> & "Co"',
      inviterEmail: 'boss@tracy.test',
      workspaceName: 'Tracy <script>alert(1)</script>',
      siteKeys: ['a.test'],
      acceptUrl
    })
    // On the notification template (#809) the link is the letter's button.
    assert.match(
      letter.html,
      /<a href="https:\/\/tracy\.test\/ops\/invite\/7b0c1a52\?from=mail&amp;x=1"[^>]*>Accept invitation<\/a>/
    )
    assert.ok(letter.text.includes(`Accept invitation: ${acceptUrl}\n`))
    assert.doesNotMatch(letter.html, /<script>|<b>Boss/)
    assert.match(letter.html, /&lt;b&gt;Boss&lt;\/b&gt; &amp; &quot;Co&quot;/)
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//tracy.test/x',
      'https://x.test/"><img>',
      ''
    ])
      assert.throws(
        () => build({ workspaceName: 'Tracy', acceptUrl: bad }),
        /acceptUrl must be an http\(s\) URL/
      )
    // No link given: no button and no address, rather than inventing one (the template's footer
    // still links Settings and tracy.ai).
    assert.doesNotMatch(build({ workspaceName: 'Tracy' }).html, /Accept invitation|\/ops\/invite/)
  }
})
