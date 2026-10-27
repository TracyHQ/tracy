// Mail audit 04/10/2026 (tracy-notifications-plan/review/mail-audit.html): items 3 to 6.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addedToWorkspace,
  inviteMail,
  removalCodeMail,
  signInCodeMail,
  teamInviteMail
} from '../src/mail/emails.js'
import { WEB_LANGUAGES } from '../src/lib/i18n/index.js'

/** The visible text of a letter's HTML, one string per paragraph. */
const paragraphsOf = (html) =>
  [...html.replace(/<head>[\s\S]*?<\/head>/, '').matchAll(/<(?:p|h1|span)[^>]*>([\s\S]*?)<\/(?:p|h1|span)>/g)]
    .map((m) =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replaceAll('&zwnj;', '')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#9679;/g, '')
        .trim()
    )
    .filter(Boolean)

/** The text part's last line is the footer (06/10/2026): each "Label: address" pair is, in the
 * HTML, that label as the text of a link to that address. Returns the lines before it. */
function bodyLinesAfterFooter(mail, lang) {
  const lines = mail.text.split('\n').filter(Boolean)
  const footer = lines.pop()
  const pairs = footer.split(' · ').map((pair) => pair.match(/^(.+): (https:\/\/\S+)$/))
  assert.equal(pairs.length, 2, `${lang}: the text part ends with the footer line`)
  for (const [, label, url] of pairs)
    assert.ok(mail.html.includes(`<a href="${url}" style="color:#8a817c;">${label}</a>`), `${lang}: ${label}`)
  return lines
}

test('3: the workspace mails name the inviter "Name (email)", local part when nameless', () => {
  for (const build of [inviteMail, addedToWorkspace]) {
    const named = build({
      inviterName: 'Akemi',
      inviterEmail: 'akemi@lab3.example',
      workspaceName: 'Acme',
      siteKeys: ['a.test']
    })
    assert.match(named.text, /Akemi \(akemi@lab3\.example\)/)
    const nameless = build({
      inviterEmail: 'kimdesigner@example.com',
      workspaceName: 'Acme',
      siteKeys: ['a.test']
    })
    assert.match(nameless.text, /kimdesigner \(kimdesigner@example\.com\)/)
  }
})

test('4: the sign-in mail says the same sentences in its text part as in its HTML', () => {
  for (const lang of WEB_LANGUAGES) {
    const mail = signInCodeMail('482913', lang)
    const lines = bodyLinesAfterFooter(mail, lang)
    const shown = paragraphsOf(mail.html)
    for (const line of lines)
      assert.ok(
        shown.some((p) => p.includes(line) || line.includes(p)),
        `${lang}: "${line}" is not in the HTML`
      )
  }
})

test('5: the removal-code mail is on the shared layout, without a dash, with matching parts', () => {
  for (const lang of WEB_LANGUAGES) {
    const mail = removalCodeMail({ code: 'AB12-CD34', targetEmail: 'lee@lab3.example', lang })
    assert.match(mail.html, /<h1 class="mail-title"/, `${lang}: shared layout`)
    assert.match(
      mail.html,
      // C3-B (05/10/2026): the brand name is plain text, not a link; Terms and Privacy before it.
      /<span style="color:#8a817c;">tracy\.&zwnj;ai<\/span><\/p>/,
      `${lang}: shared footer`
    )
    assert.doesNotMatch(mail.text + mail.html, /[—–]/, `${lang}: no dash`)
    assert.doesNotMatch(
      mail.html.replace(/<head>[\s\S]*?<\/head>/, ''),
      /lee@lab3\.example/,
      `${lang}: address protected from autolinks`
    )
    const shown = paragraphsOf(mail.html)
    for (const line of bodyLinesAfterFooter(mail, lang))
      assert.ok(
        shown.some((p) => p.includes(line) || line.includes(p)),
        `${lang}: "${line}" is not in the HTML`
      )
  }
})

test('6: in Chinese no space follows the full-width bracket after a person', () => {
  const mail = teamInviteMail({
    inviterName: 'David',
    inviterEmail: 'danadev@example.com',
    role: 'editor',
    siteKeys: ['a.test'],
    acceptUrl: 'https://tracy.test/invite/t',
    lang: 'zh'
  })
  assert.doesNotMatch(mail.text, /） /)
  assert.doesNotMatch(mail.html, /） /)
})
