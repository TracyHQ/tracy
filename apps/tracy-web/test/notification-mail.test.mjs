// The shared notification email (spec #809 step 2): approved footer and label, the reader's
// language, escaped data, and the two team mails on it (T1 invitation, T2 join request).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joinRequestMail, teamInviteMail } from '../src/mail/emails.js'
import { notificationMail, unlinkedHtml } from '../src/mail/notification-mail.js'

/** Letter HTML as the reader sees it: the invisible joiners that stop autolinks taken out. */
const visible = (html) => String(html).replaceAll('&zwnj;', '')

test('the footer is one line: Manage notifications · Terms · Privacy · tracy.ai, nothing else', () => {
  const mail = notificationMail({
    badge: 'mail.n.badge.mention',
    subject: 'Lee mentioned you in a comment on kinetic.vn',
    paragraphs: [{ text: 'is this banner colour approved?', quote: true }],
    button: { label: 'View comment', url: 'https://cowork.tracy.ai/kinetic.vn/' },
    manageUrl: 'https://cowork.tracy.ai/?settings=notifications'
  })
  // C3-B (05/10/2026): "tracy.ai" stays as plain text. 06/10/2026 (Sarah): Terms and Privacy, on
  // tracy.ai, are the only links besides Manage.
  assert.match(
    mail.html,
    /Manage notifications<\/a> &middot; <a href="https:\/\/tracy\.ai\/terms" style="color:#8a817c;">Terms<\/a> &middot; <a href="https:\/\/tracy\.ai\/privacy" style="color:#8a817c;">Privacy<\/a> &middot; <span style="color:#8a817c;">tracy\.&zwnj;ai<\/span><\/p>/
  )
  for (const gone of [
    /Claude Design, but for CMS/,
    /not affiliated with Anthropic/,
    /You received this/,
    />Tracy<\/p>/
  ])
    assert.doesNotMatch(mail.html, gone)
  assert.match(mail.html, /&#9679;&nbsp; Mention</)
  assert.match(mail.html, /“is this banner colour approved\?”/)
  assert.match(mail.text, /Manage notifications: https:\/\/cowork\.tracy\.ai\/\?settings=notifications/)
})

test('data is escaped and a button that goes nowhere is refused', () => {
  const mail = notificationMail({
    badge: 'mail.n.badge.reply',
    subject: '<b>x</b>',
    paragraphs: [{ text: '<script>alert(1)</script>' }]
  })
  assert.doesNotMatch(mail.html, /<script>alert/)
  assert.doesNotMatch(mail.html, /<b>x<\/b>/)
  assert.throws(
    () =>
      notificationMail({
        badge: 'mail.n.badge.reply',
        subject: 's',
        paragraphs: [],
        button: { label: 'x', url: 'javascript:1' }
      }),
    /http\(s\)/
  )
})

test('T1: the approved invitation, one site', () => {
  const mail = teamInviteMail({
    inviterName: 'Akemi',
    inviterEmail: 'akemi@lab3.example',
    role: 'editor',
    siteKeys: ['kinetic.vn'],
    acceptUrl: 'https://cowork.tracy.ai/invite/abc'
  })
  assert.equal(mail.subject, 'Akemi invited you to join kinetic.vn')
  assert.match(mail.text, /Akemi \(akemi@lab3\.example\) has invited you to work on kinetic\.vn in Tracy\./)
  assert.match(
    mail.html,
    /As an Editor, you can change the site with Tracy: its pages, design and settings\./
  )
  assert.match(mail.html, /&#9679;&nbsp; Invitation</)
  assert.match(mail.html, />Accept invitation<\/a>/)
})

test('T2: the approved join request, in the language asked for', () => {
  const en = joinRequestMail({
    requesterEmail: 'vincent@lab3.example',
    siteKey: 'kinetic.vn',
    reviewUrl: 'https://cowork.tracy.ai/kinetic.vn/team?member=vincent%40lab3.example'
  })
  // No display name: the local part names the person (Akemi, 04/10), and the body pairs it with
  // the address, "vincent (vincent@lab3.example)".
  assert.equal(en.subject, 'vincent asked to join kinetic.vn')
  assert.match(en.text, /vincent \(vincent@lab3\.example\) would like access to kinetic\.vn\./)
  assert.match(en.html, /Every Owner of this site received this request\. The first response applies\./)
  assert.match(en.html, />Review request<\/a>/)
  const vi = joinRequestMail({
    requesterName: 'Vincent',
    requesterEmail: 'vincent@lab3.example',
    siteKey: 'kinetic.vn',
    reviewUrl: 'https://cowork.tracy.ai/kinetic.vn/team',
    lang: 'vi'
  })
  assert.equal(vi.subject, 'Vincent xin tham gia kinetic.vn')
  assert.match(vi.html, /lang="vi"/)
  assert.match(visible(vi.html), /Vincent \(vincent@lab3\.example\) muốn được truy cập kinetic\.vn\./)
})

// ── Measured on a real invite 04/10: raw addresses, autolinks, a missing footer ──────────────

test('an inviter with no display name is named by the local part in the subject and the title', () => {
  const mail = teamInviteMail({
    inviterEmail: 'kimdesigner@example.com',
    role: 'editor',
    siteKeys: ['wptest0929.tracy.site'],
    acceptUrl: 'https://cowork.tracy.site/invite/TOKEN'
  })
  assert.equal(mail.subject, 'kimdesigner invited you to join wptest0929.tracy.site')
  const heading = mail.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''
  assert.ok(heading.startsWith('kimdesigner invited you'), heading)
  // The body keeps the approved shape "Name (email)", the name being the local part.
  assert.match(mail.text, /kimdesigner \(kimdesigner@example\.com\) has invited you to work on/)
})

test('no address or domain in the HTML can be autolinked by the mail client', () => {
  const mail = teamInviteMail({
    inviterName: 'Akemi',
    inviterEmail: 'akemi@lab3.example',
    role: 'editor',
    siteKeys: ['wptest0929.tracy.site'],
    acceptUrl: 'https://cowork.tracy.site/invite/TOKEN'
  })
  const shown = mail.html.replace(/<head>[\s\S]*<\/head>/, '').replace(/href="[^"]*"/g, '')
  assert.doesNotMatch(shown, /akemi@lab3\.example/)
  assert.doesNotMatch(shown, /wptest0929\.tracy\.site/)
  // The reader still sees the same characters: only invisible joiners were added.
  assert.match(shown, /akemi@&zwnj;lab3.&zwnj;example/)
  // The plain-text part keeps the plain address.
  assert.match(mail.text, /Akemi \(akemi@lab3\.example\)/)
})

test('unlinkedHtml escapes first and breaks only @ and . between letters or digits', () => {
  assert.equal(unlinkedHtml('<b>a.b</b> end. 1.5'), '&lt;b&gt;a.&zwnj;b&lt;/b&gt; end. 1.&zwnj;5')
  assert.equal(unlinkedHtml('Lee'), 'Lee')
})

// Spam hints C3-B and D3-A (Akemi 05/10/2026): a mail keeps only the links that do something
// (Accept/Review, Decline, Manage), and the notification letters say once that the same thing is in
// the Inbox, as plain text with no link.
const hrefsOf = (html) => [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1])

test('C3-B + 06/10: the invitation keeps Decline and Accept, the join request Review and Manage, plus Terms and Privacy; tracy.ai is never a link', async () => {
  const { signInCodeMail } = await import('../src/mail/emails.js')
  const invite = teamInviteMail({
    inviterName: 'Akemi',
    inviterEmail: 'akemi@lab3.example',
    role: 'editor',
    siteKeys: ['kinetic.vn'],
    acceptUrl: 'https://cowork.tracy.ai/invite/tok123',
    // As `seats/route.js` sends it since 06/10/2026 (Sarah): no Manage, the invitee may have no account.
    declineUrl: 'https://cowork.tracy.ai/invite/tok123/decline'
  })
  const legal = ['https://tracy.ai/terms', 'https://tracy.ai/privacy']
  assert.deepEqual(hrefsOf(invite.html), [
    'https://cowork.tracy.ai/invite/tok123/decline',
    'https://cowork.tracy.ai/invite/tok123',
    ...legal
  ])
  const join = joinRequestMail({
    requesterEmail: 'vincent@lab3.example',
    siteKey: 'kinetic.vn',
    reviewUrl: 'https://cowork.tracy.ai/kinetic.vn/team',
    manageUrl: 'https://cowork.tracy.ai/?settings=notifications'
  })
  assert.deepEqual(hrefsOf(join.html), [
    'https://cowork.tracy.ai/kinetic.vn/team',
    'https://cowork.tracy.ai/?settings=notifications',
    ...legal
  ])
  const signIn = signInCodeMail('123456')
  assert.deepEqual(hrefsOf(signIn.html), legal, 'the sign-in code mail links only Terms and Privacy')
  for (const mail of [invite, join, signIn]) {
    assert.ok(!/href="https:\/\/tracy\.ai\/?"/.test(mail.html), 'neither the logo nor tracy.ai is a link')
    assert.match(mail.html, /tracy\.&zwnj;ai<\/span>/, 'the brand name is still shown')
  }
})

test('D3-A: the invitation and the join request say it is also in the Inbox, under the button, unlinked', () => {
  const note = 'You can also find this in your Inbox in Tracy.'
  const invite = teamInviteMail({
    inviterName: 'Akemi',
    inviterEmail: 'akemi@lab3.example',
    role: 'editor',
    siteKeys: ['kinetic.vn'],
    acceptUrl: 'https://cowork.tracy.ai/invite/tok123'
  })
  const join = joinRequestMail({
    requesterEmail: 'vincent@lab3.example',
    siteKey: 'kinetic.vn',
    reviewUrl: 'https://cowork.tracy.ai/kinetic.vn/team'
  })
  for (const mail of [invite, join]) {
    const button = mail.html.indexOf('display:inline-block;background:#a3462a')
    const line = mail.html.indexOf(note)
    assert.ok(button > 0 && line > button, 'the line sits under the button')
    assert.match(
      mail.html,
      new RegExp(`<p style="[^"]*">${note.replaceAll('.', '\\.')}</p>`),
      'no link in it'
    )
    assert.ok(mail.text.includes(note))
  }
  // A mail that is not a notification letter does not claim an Inbox row.
  const plain = notificationMail({ subject: 'x', paragraphs: [{ text: 'y' }] })
  assert.ok(!plain.html.includes(note))
})
