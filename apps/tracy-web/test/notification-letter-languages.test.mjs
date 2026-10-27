// Every notification letter in every interface language (spec #809, Akemi 04/10/2026): each of
// the eight languages in Settings gets its own words, and any other language (a Japanese device,
// nothing stored, garbage) gets the English letter, never a mix and never a raw key.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inviteMail, addedToWorkspace, joinRequestMail, teamInviteMail } from '../src/mail/emails.js'
import { LETTER_KINDS, letterFor } from '../src/mail/letters/index.js'
import { WEB_LANGUAGES, htmlLang } from '../src/lib/i18n/index.js'

const UNSUPPORTED = ['ja', 'ko-KR', 'pt-BR', 'zh-TW', 'klingon', '', null, undefined]

const links = {
  team: (siteKey, member) =>
    `https://tracy.test/${siteKey}?open=my-sites&team=${siteKey}${member ? `&member=${member}` : ''}`,
  site: (siteKey) => `https://tracy.test/${siteKey}/`,
  comment: (siteKey, id) => `https://tracy.test/${siteKey}/?open=browser&page=/&mode=edit&comment=${id}`,
  manage: () => 'https://tracy.test/?settings=notifications'
}

const actor = { id: 'a-lee', email: 'lee@lab3.example', name: 'Lee' }

/** One plausible row per kind: the facts each letter reads. */
const DATA = {
  'team.join_request': {},
  'team.join_answered': {
    decision: 'approved',
    requesterName: 'Brian',
    requesterEmail: 'brian@lab3.example',
    role: 'editor'
  },
  'team.approved': { role: 'editor' },
  'team.declined': {},
  'team.invite_accepted': { role: 'editor' },
  'team.invite_declined': {},
  'team.joined': { role: 'viewer', inviterName: 'Akemi', inviterEmail: 'akemi@lab3.example' },
  'team.removed': {},
  'team.role_changed': { from: 'viewer', to: 'editor' },
  'team.left': { role: 'editor' },
  'team.invite_cancelled': { role: 'editor' },
  'team.site_restored': { backup: 'Before the menu change', version: 3 },
  'team.site_deleted': { siteName: 'kinetic.vn' },
  'team.site_renamed': { oldSite: 'kinetic-old.vn' },
  'team.edit_access_request': {},
  'team.edit_access_answered': {
    decision: 'approved',
    requesterName: 'Brian',
    requesterEmail: 'brian@lab3.example',
    role: 'editor'
  },
  'team.edit_access_approved': { role: 'editor' },
  'team.edit_access_declined': {},
  'comment.mention': { quote: '@akemi is this banner approved?', page: '/about', n: 9, commentId: 'c-9' },
  'comment.reply': { quote: 'Done, I swapped the image.', page: '/', n: 9, commentId: 'c-9', yours: true },
  'comment.resolved': { quote: 'Change the phone number', page: '/', n: 12, commentId: 'c-12' },
  'comment.reopened': { quote: 'The menu still overlaps', page: '/', n: 13, commentId: 'c-13' }
}

function render(kind, lang) {
  return letterFor({
    kind,
    lang,
    rows: [
      {
        id: 'n-1',
        kind,
        siteKey: 'kinetic.vn',
        actor,
        data: DATA[kind] ?? {},
        ref: null,
        createdAt: '2026-10-04T08:00:00Z'
      }
    ],
    recipient: { id: 'a-akemi', email: 'akemi@lab3.example', name: 'Akemi' },
    links
  })
}

/** The builders mailed straight from a door (T1, T2, the workspace invitations). */
const BUILDERS = {
  teamInviteMail: (lang) =>
    teamInviteMail({
      inviterName: 'Lee',
      inviterEmail: 'lee@lab3.example',
      role: 'editor',
      siteKeys: ['kinetic.vn'],
      acceptUrl: 'https://tracy.test/invite/tok',
      declineUrl: 'https://tracy.test/invite/tok/decline',
      lang
    }),
  joinRequestMail: (lang) =>
    joinRequestMail({
      requesterEmail: 'vincent@lab3.example',
      siteKey: 'kinetic.vn',
      reviewUrl: 'https://tracy.test/r',
      lang
    }),
  inviteMail: (lang) =>
    inviteMail({ inviterEmail: 'lee@lab3.example', workspaceName: 'Agency', siteKeys: ['kinetic.vn'], lang }),
  addedToWorkspace: (lang) =>
    addedToWorkspace({
      inviterEmail: 'lee@lab3.example',
      workspaceName: 'Agency',
      siteKeys: ['kinetic.vn'],
      lang
    })
}

const ALL = [...LETTER_KINDS.map((kind) => [kind, (lang) => render(kind, lang)]), ...Object.entries(BUILDERS)]

/** No leftover `{placeholder}`, no raw key, no "undefined"/"null" printed as words. */
function assertClean(letter, label) {
  for (const part of [letter.subject, letter.text]) {
    assert.doesNotMatch(part, /\{[a-zA-Z]+\}/, `${label}: a placeholder was left in`)
    assert.doesNotMatch(part, /\bmail\.[a-zA-Z.]+|\brole\.[a-z]+\b/, `${label}: a raw key was printed`)
    assert.doesNotMatch(part, /\bundefined\b|\bnull\b|NaN/, `${label}: a missing value was printed`)
  }
}

test('every kind has a letter fixture here (a new kind must be added to this matrix)', () => {
  assert.deepEqual([...LETTER_KINDS].sort(), Object.keys(DATA).sort())
})

for (const [name, build] of ALL) {
  test(`${name}: its own words in each of the eight languages`, () => {
    const english = build('en')
    assert.ok(english, `${name}: renders in English`)
    assertClean(english, `${name} en`)
    for (const lang of WEB_LANGUAGES) {
      const letter = build(lang)
      assert.ok(letter, `${name} ${lang}: renders`)
      assertClean(letter, `${name} ${lang}`)
      assert.ok(letter.html.includes(`<html lang="${htmlLang(lang)}">`), `${name} ${lang}: <html lang>`)
      if (lang !== 'en') {
        assert.notEqual(letter.subject, english.subject, `${name} ${lang}: the subject is translated`)
        assert.notEqual(letter.text, english.text, `${name} ${lang}: the body is translated`)
      }
    }
  })

  test(`${name}: any other language gets the English letter`, () => {
    const english = build('en')
    for (const lang of UNSUPPORTED) {
      assert.deepEqual(build(lang), english, `${name} ${String(lang)}: English`)
    }
  })
}
