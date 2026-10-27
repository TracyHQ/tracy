// One rule names a person in every letter (Akemi 04/10/2026): the display name, else the local part
// of the address. A raw address may appear only as the "(email)" after that name, never where the
// name belongs (measured on dev: the C1 mention title read "myp@example.com mentioned you").
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joinRequestMail, teamInviteMail } from '../src/mail/emails.js'
import { LETTER_KINDS, letterFor } from '../src/mail/letters/index.js'

const ADDRESS = 'myp@example.com'
const LOCAL = 'myp'
const actor = { id: 'a-1', email: ADDRESS, name: null }
const links = {
  team: (siteKey) => `https://tracy.test/${siteKey}?open=my-sites&team=${siteKey}`,
  site: (siteKey) => `https://tracy.test/${siteKey}/`,
  comment: (siteKey, id) => `https://tracy.test/${siteKey}/?comment=${id}`,
  manage: () => 'https://tracy.test/?settings=notifications'
}
const DATA = {
  'team.join_answered': { decision: 'approved', requesterEmail: ADDRESS, role: 'editor' },
  'team.joined': { role: 'editor', inviterEmail: ADDRESS },
  'team.role_changed': { from: 'viewer', to: 'editor' },
  'team.edit_access_answered': { decision: 'approved', requesterEmail: ADDRESS, role: 'editor' },
  'team.site_restored': { backup: 'B', version: 1 },
  'team.site_renamed': { oldSite: 'old.vn' },
  'comment.mention': { quote: 'hi', page: '/', commentId: 'c' },
  'comment.reply': { quote: 'hi', page: '/', commentId: 'c', yours: true },
  'comment.resolved': { quote: 'hi', page: '/', commentId: 'c' },
  'comment.reopened': { quote: 'hi', page: '/', commentId: 'c' }
}

/** Visible text of a letter's HTML: tags, the autolink joiners and the <head> taken out. */
const textOf = (html) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&zwnj;', '')
    .replace(/&#?\w+;/g, ' ')

/** Every address in the text sits inside "(…)" right after the local-part name. */
function assertNamed(where, text) {
  let from = 0
  for (;;) {
    const at = text.indexOf(ADDRESS, from)
    if (at < 0) return
    assert.ok(
      text.slice(Math.max(0, at - LOCAL.length - 2), at).endsWith(`${LOCAL} (`),
      `${where}: a raw address where a name belongs: …${text.slice(Math.max(0, at - 40), at + 30)}…`
    )
    from = at + ADDRESS.length
  }
}

test('no letter names a person by a raw address', () => {
  const letters = LETTER_KINDS.map((kind) => [
    kind,
    letterFor({
      kind,
      lang: 'en',
      rows: [
        {
          id: 'n',
          kind,
          siteKey: 'kinetic.vn',
          actor,
          data: DATA[kind] ?? {},
          ref: null,
          createdAt: '2026-10-04T08:00:00Z'
        }
      ],
      recipient: { id: 'r', email: 'akemi@lab3.example', name: 'Akemi' },
      links
    })
  ])
  letters.push([
    'T1',
    teamInviteMail({
      inviterEmail: ADDRESS,
      role: 'editor',
      siteKeys: ['kinetic.vn'],
      acceptUrl: 'https://tracy.test/invite/t'
    })
  ])
  letters.push([
    'T2',
    joinRequestMail({
      requesterEmail: ADDRESS,
      siteKey: 'kinetic.vn',
      reviewUrl: 'https://tracy.test/kinetic.vn/team'
    })
  ])
  for (const [kind, letter] of letters) {
    if (!letter) continue
    assert.doesNotMatch(letter.subject, /@/, `${kind}: subject`)
    const heading = letter.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''
    assert.doesNotMatch(textOf(heading), /@/, `${kind}: title`)
    assertNamed(`${kind} html`, textOf(letter.html))
    assertNamed(`${kind} text`, letter.text.replace(/https?:\/\/\S+/g, ''))
  }
})
