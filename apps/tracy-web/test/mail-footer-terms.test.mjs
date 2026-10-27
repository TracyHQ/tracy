/**
 * The transactional mail round of 06/10/2026 (spec `tracy-marketing/content/email/transactional/
 * tracy-access/spec-2026-10-06`, decided by Sarah):
 *   1. every mail ends "Terms · Privacy · tracy.ai" (notification letters keep "Manage notifications"
 *      first), in the reader's language, and the text part ends with the same two addresses;
 *   2. the whitelist invitation reads as a sign-in result: subject "About your Tracy sign-in" and the
 *      sign-in mail's "Did not request this?" box, in both of its variants;
 *   3. the whitelist confirmation ends with that same box instead of a plain "Didn't ask to join?";
 *   (4, the site invitation without "Manage notifications", is held in `invite-expiry.test.mjs`;)
 *   5. a signed-out visit to `/?settings=notifications` keeps its destination through `/login?next=`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confirmationMail } from '../src/mail/confirmation-mail.js'
import { betaMail, signInCodeMail } from '../src/mail/emails.js'
import { loginPage } from '../src/identity/pages.js'
import { notificationMail } from '../src/mail/notification-mail.js'
import { workspaceRoutes } from '../src/workspace/route.js'

const TERMS = 'https://tracy.ai/terms'
const PRIVACY = 'https://tracy.ai/privacy'
const TEXT_FOOTER = `Terms: ${TERMS} · Privacy: ${PRIVACY}`
const BOX =
  /<p style="margin:[^"]*padding:14px 16px;background:#f8f0ec;border-radius:10px;[^"]*color:#5c534e;"><strong style="color:#1a1715;">Did not request this\?<\/strong> You can safely ignore this email\.<\/p>/

/** The footer's text, tags and zero-width joiners dropped: what the reader sees on the line. */
function footerLine(html) {
  const row = html.slice(html.lastIndexOf('<tr><td class="mail-pad"'))
  return row
    .replace(/<[^>]+>/g, '')
    .replace(/&zwnj;/g, '')
    .replace(/&middot;/g, '·')
    .replace(/\s+/g, ' ')
    .trim()
}

const letter = (manageUrl, lang = 'en') =>
  notificationMail({ lang, subject: 'Hello', paragraphs: [{ text: 'Body' }], manageUrl })

test('1: the sign-in mail ends Terms · Privacy · tracy.ai, two links on tracy.ai and the name as text', () => {
  const mail = signInCodeMail('123456')
  assert.equal(footerLine(mail.html), 'Terms · Privacy · tracy.ai')
  assert.match(mail.html, new RegExp(`<a href="${TERMS}" style="color:#8a817c;">Terms</a>`))
  assert.match(mail.html, new RegExp(`<a href="${PRIVACY}" style="color:#8a817c;">Privacy</a>`))
  assert.doesNotMatch(mail.html, /href="https:\/\/tracy\.ai\/?"/, 'tracy.ai itself stays plain text (C3-B)')
  assert.doesNotMatch(mail.html, /\{\{/, 'no marker left unfilled')
  assert.equal(mail.text.split('\n').at(-1), TEXT_FOOTER)
})

test('1: a notification letter keeps Manage notifications first, and the words follow the reader', () => {
  const en = letter('https://cowork.tracy.ai/?settings=notifications')
  assert.equal(footerLine(en.html), 'Manage notifications · Terms · Privacy · tracy.ai')
  assert.equal(en.text.split('\n').at(-1), TEXT_FOOTER)
  assert.match(en.text, /Manage notifications: https:\/\/cowork\.tracy\.ai\/\?settings=notifications\n/)

  const vi = letter('https://cowork.tracy.ai/?settings=notifications', 'vi')
  assert.match(footerLine(vi.html), / · Điều khoản · Quyền riêng tư · tracy\.ai$/)
  assert.doesNotMatch(vi.html, /\{\{/)
  assert.equal(vi.text.split('\n').at(-1), `Điều khoản: ${TERMS} · Quyền riêng tư: ${PRIVACY}`)

  assert.equal(footerLine(letter(null).html), 'Terms · Privacy · tracy.ai')
})

test('1: the sign-in mail in Vietnamese reads Điều khoản · Quyền riêng tư · tracy.ai', () => {
  assert.equal(footerLine(signInCodeMail('123456', 'vi').html), 'Điều khoản · Quyền riêng tư · tracy.ai')
})

test('2: the whitelist invitation is about the sign-in and carries the Did not request this? box', () => {
  for (const unavailable of [false, true]) {
    const mail = betaMail({ url: 'https://tracy.ai/whitelist/', unavailable })
    assert.match(mail.html, BOX, `unavailable=${unavailable}: the box`)
    assert.ok(
      mail.html.indexOf('Did not request this?') > mail.html.indexOf('joomlart.&zwnj;com'),
      'the box comes after the JoomlArt member note'
    )
    assert.match(mail.text, /\nDid not request this\? You can safely ignore this email\.\n/)
    assert.equal(mail.text.split('\n').at(-1), TEXT_FOOTER)
    assert.equal(footerLine(mail.html), 'Terms · Privacy · tracy.ai')
  }
  assert.equal(betaMail({ url: 'https://tracy.ai/whitelist/' }).subject, 'About your Tracy sign-in')
  assert.equal(
    betaMail({ url: 'https://tracy.ai/whitelist/', unavailable: true }).subject,
    'We could not check your Tracy access yet'
  )
  assert.equal(
    betaMail({ url: 'https://tracy.ai/whitelist/', lang: 'vi' }).subject,
    'Về yêu cầu đăng nhập Tracy của bạn'
  )
})

test('3: the whitelist confirmation ends with the same box, and the old sentence is gone', () => {
  const mail = confirmationMail(
    'ann@example.com',
    { name: 'Ann', platforms: ['wordpress'], site_count: '1', website: 'https://example.com/' },
    'https://tracy.example'
  )
  assert.match(mail.html, BOX)
  assert.doesNotMatch(mail.html + mail.text, /Didn.t ask to join/)
  assert.match(mail.text, /\nDid not request this\? You can safely ignore this email\.\n/)
  assert.equal(mail.text.split('\n').at(-1), TEXT_FOOTER)
  assert.equal(footerLine(mail.html), 'Terms · Privacy · tracy.ai')
})

test('3: a note paragraph is a box in HTML and one line in the text part', () => {
  const mail = notificationMail({
    subject: 'Hello',
    paragraphs: [{ text: 'Body' }, { note: { strong: 'Heads <up>', rest: 'a@b.co is fine.' } }]
  })
  assert.match(
    mail.html,
    /<strong style="color:#1a1715;">Heads &lt;up&gt;<\/strong> a@&zwnj;b.&zwnj;co is fine\.<\/p>/
  )
  assert.match(mail.text, /\nHeads <up> a@b\.co is fine\.\n/)
})

/** The root door alone, as `sign-in-source.test.mjs` mounts it. */
function rootDoor(guestSiteKey = null) {
  return workspaceRoutes({
    config: { sessionSecret: 's'.repeat(32), secure: false, defaultHost: 'local', guestSiteKey },
    sites: {
      hostOf: async (key) => (key === 'guest.localhost' ? 'local' : null),
      dshOf: () => ({ origin: 'http://127.0.0.1:1', seatSecret: 'k' }),
      labelOf: async (key) => key,
      siteScope: async () => 'guest'
    }
  })
}
const go = async (app, path) =>
  (await app.fetch(new Request(`http://tracy.test${path}`))).headers.get('location')

test('5: a signed-out /?settings=notifications keeps where it was going in next', async () => {
  const app = rootDoor()
  assert.equal(await go(app, '/?settings=notifications'), '/login?next=%2F%3Fsettings%3Dnotifications')
  assert.equal(await go(app, '/'), '/login', 'the bare root is unchanged')
  assert.equal(
    await go(app, '/?utm_source=joomlart'),
    '/login?utm_source=joomlart',
    'a campaign link is unchanged'
  )
  assert.equal(
    await go(app, '/?settings=notifications&utm_source=joomlart'),
    '/login?next=%2F%3Fsettings%3Dnotifications%26utm_source%3Djoomlart&utm_source=joomlart',
    'both ride along'
  )
  // A deployment with a guest landing: the stranger with a destination still signs in first.
  assert.equal(
    await go(rootDoor('guest.localhost'), '/?settings=notifications'),
    '/login?next=%2F%3Fsettings%3Dnotifications'
  )
  assert.equal(await go(rootDoor('guest.localhost'), '/?utm_source=joomlart'), '/guest.localhost/')
})

test('5: every way through /login keeps that next: the address form, the code form, resend and Google', () => {
  const html = loginPage({
    next: '/?settings=notifications',
    origin: 'http://tracy.test',
    oauth: { google: { clientId: 'x' } },
    step: 'email'
  })
  // `safePath` writes it out on this origin; one page holds both steps' forms.
  const fields = html.match(/<input type="hidden" name="next" value="[^"]*">/g)
  assert.equal(fields.length, 4)
  for (const field of fields) assert.match(field, /value="http:\/\/tracy\.test\/\?settings=notifications"/)
  assert.match(html, /<form method="get" action="\/signin\/google">\n<input type="hidden" name="next"/)
})

test('3: the confirmation links "See how Tracy works" whole, not cut at "tracy." by the autolink guard', () => {
  const mail = confirmationMail(
    'ann@example.com',
    { name: 'Ann', platforms: ['wordpress'], site_count: '1', website: 'https://example.com/' },
    'https://tracy.ai'
  )
  // Measured 06/10/2026 on Gmail (Sarah): only "https://tracy." was a link, the rest plain text.
  assert.match(
    mail.html,
    /See how Tracy works: <a href="https:\/\/tracy\.ai\/how-it-works\/" style="color:#a3462a;">https:\/\/tracy\.ai\/how-it-works\/<\/a><\/p>/
  )
  assert.match(mail.text, /\nSee how Tracy works: https:\/\/tracy\.ai\/how-it-works\/\n/)
  // What the visitor typed stays unlinkable.
  assert.match(mail.html, /Main website: https:\/\/example\.&zwnj;com\//)
})
