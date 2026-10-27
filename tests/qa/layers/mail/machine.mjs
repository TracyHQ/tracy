// The machine assertions of the mail layer. Each assertion is a function of a product root (the
// real tree, or a scratch copy with one recorded mutation) and returns one result per variant.
// Expected values come from tests/qa/oracles/mail/oracle.json and tests/qa/fixtures/mail/facts.json,
// never from the output of the code under test.
import assert from 'node:assert/strict'
import { loadProduct } from './common.mjs'
import {
  ACCOUNTS,
  HOST,
  LANGS,
  LINKS,
  NOW,
  SECRET,
  assertClean,
  check,
  decodeAttr,
  facts,
  hrefsOf,
  oracle,
  primaryTag,
  recordedFetch,
  recordingPool,
  renderLetter,
  rowFor,
  silentLog,
  withClock
} from './machine-support.mjs'

const KINDS = oracle.kinds.table
const HOSTILE = oracle.hostile.text
/** Returned by an assertion body when the input never reaches the output (fail-closed by shape). */
const NOT_REACHED = Symbol('not-reached')
const printed = (letter) => `${letter.subject}\n${letter.text}`
const allParts = (letter) => `${letter.subject}\n${letter.html ?? ''}\n${letter.text}`

async function letters(root) {
  const { LETTER_KINDS, letterFor } = await loadProduct(root, 'mail/letters/index.js')
  return { LETTER_KINDS, letterFor }
}

async function eachLetter(root, fn) {
  const { LETTER_KINDS, letterFor } = await letters(root)
  const out = []
  for (const kind of LETTER_KINDS)
    for (const lang of LANGS) out.push(await check(`${kind}:${lang}`, () => fn({ kind, lang, letterFor })))
  return out
}

const expectedButton = (kind, data) => {
  const type = KINDS[kind].button
  if (type === 'team') return LINKS.team(facts.siteKey)
  if (type === 'site') return LINKS.site(facts.siteKey)
  if (type === 'comment') return LINKS.comment(facts.siteKey, data.commentId)
  return null
}

/** Absolute, http(s), right host, no credentials. */
function assertDeploymentUrl(href, label) {
  const url = new URL(href)
  assert.ok(url.protocol === 'https:', `${label}: ${href} is not https`)
  assert.equal(url.host, HOST, `${label}: wrong host in ${href}`)
  assert.equal(url.username + url.password, '', `${label}: credentials in ${href}`)
}

/**
 * The footer's Terms and Privacy links (oracle.footer: the two exceptions to "a mail keeps only the links
 * that do something"). Returns the other links. Asserts, from the oracle and never from the letter itself:
 * the links to the legal host are exactly the Terms page then the Privacy page, each once, each under its
 * own label (the stated word where the oracle states one for the language, otherwise a word of its own,
 * no template slot); and the text part ends with the same two addresses, each after the same label.
 */
export function withoutLegalLinks(html, text, label, lang) {
  const hostOf = (href) => {
    try {
      return new URL(href).host
    } catch {
      return null
    }
  }
  const isLegal = (href) => hostOf(href) === oracle.footer.legalHost
  const anchors = [...html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: decodeAttr(m[1]),
    words: decodeAttr(m[2].replace(/<[^>]*>/g, '')).trim()
  }))
  const legal = anchors.filter((a) => isLegal(a.href))
  assert.deepEqual(
    legal.map((a) => a.href),
    oracle.footer.links.map((l) => l.href),
    `${label}: the links to ${oracle.footer.legalHost} are not exactly the Terms page then the Privacy page`
  )
  const urlsInText = text.match(/https?:\/\/[^\s"'<>]+/g) ?? []
  assert.deepEqual(
    urlsInText.slice(-legal.length),
    oracle.footer.links.map((l) => l.href),
    `${label}: the text part does not end with the Terms and Privacy addresses`
  )
  legal.forEach((anchor, i) => {
    const stated = oracle.footer.links[i]
    assert.ok(anchor.words !== '', `${label}: the ${stated.page} link has no label`)
    assert.doesNotMatch(anchor.words, /\{\{|\}\}/, `${label}: template slot left in the ${stated.page} label`)
    if (stated.labels[lang] !== undefined)
      assert.equal(anchor.words, stated.labels[lang], `${label}: the ${stated.page} link is mislabelled`)
    assert.equal(
      text.split(stated.href).length - 1,
      1,
      `${label}: ${stated.href} is not written exactly once in the text part`
    )
    assert.ok(
      text.includes(`${anchor.words}: ${stated.href}`),
      `${label}: the text part does not give ${stated.href} under the label "${anchor.words}"`
    )
  })
  assert.notEqual(legal[0].words, legal[1].words, `${label}: Terms and Privacy carry one label`)
  return hrefsOf(html).filter((href) => !isLegal(href))
}

// ---------------------------------------------------------------------------------------------
// Notification letters: 22 kinds x 8 languages.
// ---------------------------------------------------------------------------------------------

const letterAssertions = {
  'mail.letter.shape': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const letter = renderLetter(letterFor, kind, lang)
      assert.ok(letter, 'letter rendered')
      for (const part of ['subject', 'html', 'text'])
        assert.ok(typeof letter[part] === 'string' && letter[part].trim() !== '', `${part} is empty`)
      assert.match(letter.html, /<html lang="[^"]+"/)
      assert.ok(letter.html.trimEnd().endsWith('</html>'), 'html is complete')
      assert.doesNotMatch(
        letter.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' '),
        /\{\{|\}\}/,
        'template slot left in'
      )
      assert.doesNotMatch(letter.text, /<\/?[a-z][^>]*>/i, 'markup in the text part')
      assertClean(letter, `${kind} ${lang}`)
    }),

  'mail.letter.links': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const data = facts.data[kind]
      const letter = renderLetter(letterFor, kind, lang)
      const button = expectedButton(kind, data)
      const hrefs = withoutLegalLinks(letter.html, letter.text, `${kind} ${lang}`, lang)
      for (const href of hrefs) assertDeploymentUrl(href, `${kind} ${lang}`)
      assert.ok(hrefs.includes(LINKS.manage()), 'manage link missing from html')
      assert.ok(letter.text.includes(LINKS.manage()), 'manage link missing from text')
      if (button === null) {
        assert.deepEqual(
          [...new Set(hrefs)],
          [LINKS.manage()],
          'a letter with no button links only to manage (and the two footer pages)'
        )
      } else {
        const own = hrefs.filter((h) => h !== LINKS.manage())
        assert.equal(own.length, 1, `exactly one button link, got ${own.length}`)
        assert.ok(own[0].startsWith(button), `button goes to ${own[0]}, expected ${button}`)
        assert.ok(letter.text.includes(own[0]), 'button link missing from text')
      }
    }),

  'mail.letter.escape': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const data = structuredClone(facts.data[kind])
      for (const key of ['quote', 'backup', 'oldSite', 'requesterName', 'inviterName', 'siteName'])
        if (key in data) data[key] = HOSTILE
      const letter = renderLetter(letterFor, kind, lang, {
        data,
        actor: { ...facts.actor, name: HOSTILE },
        siteName: HOSTILE
      })
      assert.ok(letter, 'letter rendered')
      for (const bad of oracle.hostile.mustNotAppearInHtml)
        assert.ok(!letter.html.includes(bad), `unescaped markup in html: ${bad}`)
      if (!printed(letter).includes('onerror=alert(1)')) return NOT_REACHED
      assert.ok(
        oracle.hostile.mustAppearEscaped.some((ok) => letter.html.includes(ok)),
        'the hostile text is printed but not as escaped text'
      )
    }),

  'mail.letter.secret': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const data = { ...structuredClone(facts.data[kind]), token: SECRET, secret: SECRET, password: SECRET }
      const row = rowFor(kind, { data, actor: { ...facts.actor, token: SECRET, password: SECRET } })
      row.token = SECRET
      row.secret = SECRET
      const letter = renderLetter(letterFor, kind, lang, null, [row])
      assert.ok(letter)
      assert.ok(!allParts(letter).includes(SECRET), 'a secret reached the letter')
    }),

  'mail.letter.empty': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const spec = KINDS[kind]
      const clean = (letter) => {
        assert.ok(letter, 'letter expected')
        assertClean(letter, `${kind} ${lang}`)
      }
      if (kind.startsWith('comment.')) {
        assert.equal(renderLetter(letterFor, kind, lang, null, []), null, 'no rows sends nothing')
        const deleted = { ...facts.data[kind], deleted: true }
        assert.equal(
          renderLetter(letterFor, kind, lang, { data: deleted }),
          null,
          'a deleted comment is never mailed (R3)'
        )
      } else if (spec.needsRole === true || spec.needsRole === 'from-to' || spec.needsBackup) {
        assert.equal(renderLetter(letterFor, kind, lang, { data: {} }), null, 'missing facts send nothing')
      } else if (spec.needsRole === 'when-approved') {
        assert.equal(renderLetter(letterFor, kind, lang, { data: { decision: 'approved' } }), null)
        clean(renderLetter(letterFor, kind, lang, { data: {} }))
      } else {
        clean(renderLetter(letterFor, kind, lang, { data: {} }))
      }
    }),

  'mail.letter.invalid': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const spec = KINDS[kind]
      const base = structuredClone(facts.data[kind])
      for (const bad of ['superuser', 123, null, '']) {
        if (spec.needsRole === true)
          assert.equal(
            renderLetter(letterFor, kind, lang, { data: { ...base, role: bad } }),
            null,
            `role ${String(bad)}`
          )
        if (spec.needsRole === 'when-approved')
          assert.equal(
            renderLetter(letterFor, kind, lang, { data: { ...base, role: bad } }),
            null,
            `role ${String(bad)}`
          )
        if (spec.needsRole === 'from-to') {
          assert.equal(
            renderLetter(letterFor, kind, lang, { data: { ...base, from: bad } }),
            null,
            `from ${String(bad)}`
          )
          assert.equal(
            renderLetter(letterFor, kind, lang, { data: { ...base, to: bad } }),
            null,
            `to ${String(bad)}`
          )
        }
        if (spec.needsBackup && bad !== 'superuser')
          assert.equal(
            renderLetter(letterFor, kind, lang, { data: { ...base, backup: bad } }),
            null,
            `backup ${String(bad)}`
          )
      }
      // Wrong types and header injection must neither throw nor print a hole or a second header.
      for (const actor of [
        { id: null, email: {}, name: 123 },
        { ...facts.actor, name: 'Leo\r\nBcc: evil@x.test' },
        { ...facts.actor, name: null, email: null }
      ]) {
        const letter = renderLetter(letterFor, kind, lang, { actor, siteName: 42 })
        if (letter === null) continue
        assertClean(letter, `${kind} ${lang}`)
        assert.doesNotMatch(letter.subject, /[\r\n]/, 'header injection through the actor name')
      }
    }),

  'mail.letter.boundary': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const long = 'x'.repeat(10_000)
      const unicode = 'Zoë 😀 ‍‮ עברית 日本語'
      for (const text of ['a', long, unicode]) {
        const data = structuredClone(facts.data[kind])
        for (const key of ['quote', 'backup', 'oldSite']) if (key in data) data[key] = text
        const letter = renderLetter(letterFor, kind, lang, {
          data,
          actor: { ...facts.actor, name: text.length > 80 ? text.slice(0, 80) : text }
        })
        assert.ok(letter, `renders for ${text.slice(0, 10)}`)
        assert.ok(letter.html.trimEnd().endsWith('</html>'), 'html is complete')
        assert.equal(
          (letter.html.match(/<p\b/g) ?? []).length,
          (letter.html.match(/<\/p>/g) ?? []).length,
          'unbalanced <p>'
        )
        assert.doesNotMatch(letter.subject, /[\r\n]/)
      }
      if (kind === 'comment.reply') {
        const rows = [1, 2, 3].map((n) =>
          rowFor(kind, { data: { ...facts.data[kind], commentId: `c-${n}`, quote: `reply ${n}` } })
        )
        const grouped = renderLetter(letterFor, kind, lang, null, rows)
        assert.ok(grouped.subject.includes('3'), 'a group of three replies says three')
        for (const n of [1, 2, 3])
          assert.ok(grouped.text.includes(`reply ${n}`), `reply ${n} missing from the group`)
      }
    }),

  'mail.letter.repeat': (root) =>
    eachLetter(root, ({ kind, lang, letterFor }) => {
      const row = rowFor(kind)
      const before = structuredClone(row)
      const a = renderLetter(letterFor, kind, lang, null, [row])
      const b = renderLetter(letterFor, kind, lang, null, [row])
      assert.deepEqual(a, b, 'rendering twice differs')
      assert.deepEqual(row, before, 'the renderer changed its input')
    }),

  'mail.letter.locale': (root) =>
    eachLetter(root, async ({ kind, lang, letterFor }) => {
      const letter = renderLetter(letterFor, kind, lang)
      const english = renderLetter(letterFor, kind, 'en')
      assert.equal(primaryTag(letter.html), lang, `html lang is ${primaryTag(letter.html)}`)
      if (lang !== 'en') {
        assert.notEqual(letter.subject, english.subject, 'subject not translated')
        assert.notEqual(letter.text, english.text, 'body not translated')
      } else {
        for (const other of oracle.languages.unsupported)
          assert.deepEqual(
            renderLetter(letterFor, kind, other),
            english,
            `unsupported ${String(other)} must read as English`
          )
      }
    })
}

// ---------------------------------------------------------------------------------------------
// The notifier: recipient, language, retry state, dedupe, preferences, unsubscribe headers.
// ---------------------------------------------------------------------------------------------

async function notifierWorld(root, { lang, prefs = {}, send, unsub = false, recipientLanguage = lang }) {
  const { createNotifier } = await loadProduct(root, 'notifications/notify.js')
  const { preferenceFor } = await loadProduct(root, 'notifications/preferences.js')
  const { unsubscribeHeadersFor } = await loadProduct(root, 'notifications/unsubscribe.js')
  const { letterFor } = await letters(root)
  const pool = recordingPool({ accounts: ACCOUNTS(recipientLanguage), prefs })
  const sent = []
  const log = silentLog()
  const notifier = createNotifier({
    pool,
    send: async (mail) => {
      if (send) await send(mail)
      sent.push(mail)
    },
    letterFor: (input) => letterFor({ ...input, links: LINKS }),
    preferenceFor,
    ...(unsub
      ? {
          unsubscribeHeaders: unsubscribeHeadersFor(
            { origin: facts.origin, sessionSecret: SECRET },
            () => NOW
          )
        }
      : {}),
    log
  })
  const event = (kind, extra = {}) => ({
    recipients: [facts.recipient.id],
    kind,
    actor: facts.actor.id,
    siteKey: facts.siteKey,
    data: structuredClone(facts.data[kind]),
    ...extra
  })
  return { pool, sent, notifier, event, log }
}

async function eachNotifier(root, fn) {
  const { LETTER_KINDS } = await letters(root)
  const out = []
  for (const kind of LETTER_KINDS)
    for (const lang of LANGS) out.push(await check(`${kind}:${lang}`, () => fn({ kind, lang })))
  return out
}

const groupOf = (kind) =>
  Object.entries(oracle.groups.byId).find(([, kinds]) => kinds.includes(kind))?.[0] ?? null

const notifierAssertions = {
  'mail.notify.recipient': (root) =>
    eachNotifier(root, async ({ kind, lang }) => {
      const w = await notifierWorld(root, { lang })
      const ids = await w.notifier.notify(w.event(kind))
      assert.equal(ids.length, 1, 'one row written')
      assert.equal(w.sent.length, 1, 'exactly one letter sent')
      assert.equal(w.sent[0].to, facts.recipient.email, 'letter addressed to the wrong person')
      assert.notEqual(w.sent[0].to, facts.actor.email, 'letter sent to the actor')
      assert.equal(primaryTag(w.sent[0].html), lang, 'letter not in the recipient language')
      assert.equal(w.pool.state.unexpected.length, 0, `unexpected SQL: ${w.pool.state.unexpected[0]}`)
      if (lang === 'en') {
        const none = await notifierWorld(root, { lang: 'en', recipientLanguage: null })
        await none.notifier.notify(none.event(kind))
        assert.equal(primaryTag(none.sent[0].html), 'en', 'no stored language reads as English')
        const odd = await notifierWorld(root, { lang: 'en', recipientLanguage: 'ja' })
        await odd.notifier.notify(odd.event(kind))
        assert.equal(primaryTag(odd.sent[0].html), 'en', 'an unsupported language reads as English')
      } else {
        const en = await notifierWorld(root, { lang: 'en' })
        await en.notifier.notify(en.event(kind))
        assert.notEqual(w.sent[0].subject, en.sent[0].subject, 'subject follows the actor, not the recipient')
      }
    }),

  'mail.notify.no-self': (root) =>
    eachNotifier(root, async ({ kind, lang }) => {
      const w = await notifierWorld(root, { lang })
      const alone = await w.notifier.notify(w.event(kind, { recipients: [facts.actor.id] }))
      assert.deepEqual(alone, [], 'a row was written for the person who acted (R2)')
      assert.equal(w.sent.length, 0, 'a letter went to the person who acted')
      assert.equal(w.pool.state.inserts.length, 0)
      const both = await w.notifier.notify(
        w.event(kind, { recipients: [facts.actor.id, facts.recipient.id] })
      )
      assert.equal(both.length, 1)
      assert.deepEqual(
        w.sent.map((m) => m.to),
        [facts.recipient.email]
      )
    }),

  'mail.notify.failure': (root) =>
    eachNotifier(root, async ({ kind, lang }) => {
      for (const failure of [new Error('resend down'), 'plain string refusal']) {
        let failing = true
        const w = await notifierWorld(root, {
          lang,
          send: async () => {
            if (failing) throw failure
          }
        })
        const ids = await w.notifier.notify(w.event(kind))
        assert.equal(ids.length, 1, 'the door still gets its row after a failed send')
        assert.equal(w.pool.state.inserts.length, 1)
        assert.equal(w.sent.length, 0, 'a failed send was counted as sent')
        assert.equal(w.pool.state.sent.length, 0, 'a failed send was recorded as sent')
        assert.equal(w.pool.state.failed.length, 1, 'the failure was not recorded for retry')
        const [recorded] = w.pool.state.failed
        assert.equal(recorded.maxAttempts, oracle.retry.maxAttempts, 'give up after five attempts')
        assert.ok(
          recorded.error.includes(failure instanceof Error ? failure.message : failure),
          'the reason was lost'
        )
        failing = false
        const due = await w.notifier.deliverDue()
        assert.equal(due.sent, 1, 'the owed letter was not retried')
        assert.equal(w.sent.length, 1, 'retry sent a different number of letters than one')
        assert.equal(w.sent[0].to, facts.recipient.email)
        assert.equal(w.pool.state.sent.length, 1)
        const again = await w.notifier.deliverDue()
        assert.equal(again.sent, 0, 'a letter already sent was sent again')
      }
    }),

  'mail.notify.dedupe': (root) =>
    eachNotifier(root, async ({ kind, lang }) => {
      const w = await notifierWorld(root, { lang })
      const ids = await w.notifier.notify(w.event(kind, { recipients: Array(3).fill(facts.recipient.id) }))
      assert.equal(ids.length, 1, `${ids.length} rows for one recipient listed three times`)
      assert.equal(w.pool.state.inserts.length, 1)
      assert.equal(w.sent.length, 1, `${w.sent.length} letters for one recipient listed three times`)
    }),

  'mail.notify.preferences': (root) =>
    eachNotifier(root, async ({ kind, lang }) => {
      const group = groupOf(kind)
      assert.ok(group, `${kind} is in no group of the oracle`)
      const key = `${facts.recipient.id}:${group}`
      const locked = group === oracle.groups.lockedId
      const run = async (prefs) => {
        const w = await notifierWorld(root, { lang, prefs })
        await w.notifier.notify(w.event(kind))
        return w
      }
      const standard = await run({})
      assert.equal(standard.sent.length, 1, 'default is both channels on')
      assert.equal(standard.pool.state.inserts[0].in_inbox, true)

      const emailOff = await run({ [key]: { inbox: true, email: false } })
      const bothOff = await run({ [key]: { inbox: false, email: false } })
      const inboxOff = await run({ [key]: { inbox: false, email: true } })
      if (locked) {
        for (const w of [emailOff, bothOff, inboxOff]) {
          assert.equal(w.sent.length, 1, 'a locked group must still mail')
          assert.equal(w.pool.state.inserts[0].in_inbox, true, 'a locked group must still reach the Inbox')
        }
        return
      }
      assert.equal(emailOff.sent.length, 0, 'email off was ignored')
      assert.equal(emailOff.pool.state.inserts.length, 1, 'the Inbox row must remain')
      assert.equal(emailOff.pool.state.inserts[0].mail_state, 'none', 'a row owing no mail is marked none')
      assert.equal(bothOff.pool.state.inserts.length, 0, 'both channels off still wrote a row')
      assert.equal(bothOff.sent.length, 0)
      assert.equal(inboxOff.sent.length, 1, 'inbox off must not stop the email')
      assert.equal(inboxOff.pool.state.inserts[0].in_inbox, false, 'inbox off was ignored')
    }),

  'mail.notify.unsubscribe-header': (root) =>
    eachNotifier(root, async ({ kind, lang }) => {
      const group = groupOf(kind)
      const w = await notifierWorld(root, { lang, unsub: true })
      await w.notifier.notify(w.event(kind))
      assert.equal(w.sent.length, 1)
      const [mail] = w.sent
      assert.ok(!allParts(mail).includes(SECRET), 'the signing secret reached the letter')
      if (group === oracle.groups.lockedId) {
        assert.equal(mail.headers, undefined, 'a locked group must carry no unsubscribe header')
        return
      }
      assert.ok(mail.headers, 'no unsubscribe header')
      assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
      const url = new URL(/^<(.+)>$/.exec(mail.headers['List-Unsubscribe'])?.[1])
      assert.equal(url.origin, facts.origin)
      assert.equal(url.pathname, '/api/notifications/unsubscribe')
      const token = url.searchParams.get('t')
      assert.ok(token, 'token missing from the unsubscribe link')
      const { readUnsubscribeToken } = await loadProduct(root, 'lib/unsubscribe-token.js')
      assert.deepEqual(await readUnsubscribeToken(token, SECRET, NOW), {
        accountId: facts.recipient.id,
        groupId: group
      })
      assert.ok(
        !JSON.stringify(mail.headers).includes(facts.recipient.email),
        'the address travels in the header'
      )
    })
}

// ---------------------------------------------------------------------------------------------
// Unsubscribe token, invitation token, Resend transport, site mail token.
// ---------------------------------------------------------------------------------------------

const flip = (token) => `${token.slice(0, -2)}${token.slice(-2) === 'AA' ? 'BB' : 'AA'}`

const tokenAssertions = {
  'mail.unsubscribe.token': async (root) => {
    const { mintUnsubscribeToken, readUnsubscribeToken } = await loadProduct(root, 'lib/unsubscribe-token.js')
    const ttlMs = oracle.lifetimes.unsubscribeSeconds.value * 1000
    const mint = () =>
      mintUnsubscribeToken({ accountId: 'acc-1', groupId: 'teammates', secret: SECRET, now: NOW })
    const token = await mint()
    return [
      await check('valid-inside-lifetime', async () => {
        assert.deepEqual(await readUnsubscribeToken(token, SECRET, NOW + ttlMs - 1000), {
          accountId: 'acc-1',
          groupId: 'teammates'
        })
      }),
      await check('refused-after-lifetime', async () => {
        assert.equal(await readUnsubscribeToken(token, SECRET, NOW + ttlMs + 1000), null)
      }),
      await check('repeat-is-harmless', async () => {
        for (let i = 0; i < 3; i += 1)
          assert.deepEqual(await readUnsubscribeToken(token, SECRET, NOW + 1000), {
            accountId: 'acc-1',
            groupId: 'teammates'
          })
      }),
      await check('tampered-signature', async () =>
        assert.equal(await readUnsubscribeToken(flip(token), SECRET, NOW), null)
      ),
      await check('swapped-payload', async () => {
        const other = await mintUnsubscribeToken({
          accountId: 'acc-2',
          groupId: 'about-you',
          secret: SECRET,
          now: NOW
        })
        const [prefix, , sig] = token.split('.')
        assert.equal(await readUnsubscribeToken(`${prefix}.${other.split('.')[1]}.${sig}`, SECRET, NOW), null)
      }),
      await check('wrong-or-missing-secret', async () => {
        assert.equal(await readUnsubscribeToken(token, `${SECRET}-other`, NOW), null)
        assert.equal(await readUnsubscribeToken(token, undefined, NOW), null)
        assert.equal(await readUnsubscribeToken(token, '', NOW), null)
      }),
      await check('malformed', async () => {
        for (const bad of [
          undefined,
          null,
          42,
          {},
          '',
          'us1',
          'us1..',
          `${token}.extra`,
          'x'.repeat(2000),
          `zz${token.slice(2)}`
        ])
          assert.equal(await readUnsubscribeToken(bad, SECRET, NOW), null, String(bad).slice(0, 20))
      })
    ]
  },

  'mail.invite.token': async (root) => {
    const { signTeamInvite, verifyTeamInvite, teamInviteAge } = await loadProduct(root, 'lib/team-invite.js')
    const ttlS = oracle.lifetimes.inviteSeconds.value
    const input = { email: 'New.Person@Tracy.ai', role: 'editor', siteKeys: [facts.siteKey] }
    const token = await withClock(NOW, () => signTeamInvite(input, SECRET))
    const iat = Math.floor(NOW / 1000)
    const claims = await verifyTeamInvite(token, SECRET)
    return [
      await check('roundtrip', async () => {
        assert.deepEqual(claims, {
          email: 'new.person@tracy.ai',
          role: 'editor',
          siteKeys: [facts.siteKey],
          iat
        })
      }),
      await check('live-through-the-last-second', async () => {
        assert.equal(teamInviteAge(claims, (iat + ttlS) * 1000), 'live')
        assert.equal(teamInviteAge(claims, (iat + ttlS) * 1000 + 999), 'live')
        assert.equal(teamInviteAge(claims, iat * 1000), 'live')
      }),
      await check('expired-one-second-later', async () => {
        assert.equal(teamInviteAge(claims, (iat + ttlS + 1) * 1000), 'expired')
        assert.equal(teamInviteAge(claims, (iat + ttlS * 10) * 1000), 'expired')
      }),
      await check('future-token-invalid', async () => {
        assert.equal(teamInviteAge(claims, (iat - 1) * 1000), 'invalid')
      }),
      await check('tampered', async () => {
        const [payload, signature] = token.split('.')
        assert.equal(await verifyTeamInvite(`${payload}.${flip(signature)}`, SECRET), null, 'signature')
        const forged = Buffer.from(
          JSON.stringify({ v: 1, email: 'evil@x.test', role: 'admin', siteKeys: [facts.siteKey], iat })
        ).toString('base64url')
        assert.equal(
          await verifyTeamInvite(`${forged}.${signature}`, SECRET),
          null,
          'payload swapped under a real signature'
        )
        assert.equal(await verifyTeamInvite(token, `${SECRET}-other`), null, 'other secret')
        assert.equal(await verifyTeamInvite(token, undefined), null, 'no secret')
        for (const bad of [undefined, null, 5, '', 'a', `${token}.x`, '.', 'a.b'])
          assert.equal(await verifyTeamInvite(bad, SECRET), null, String(bad))
      }),
      await check('no-secret-no-token', async () => {
        await assert.rejects(() => signTeamInvite(input, ''), TypeError)
      })
    ]
  },

  'mail.invite.link': async (root) => {
    const { signTeamInvite, teamInviteUrl, teamInviteDeclineUrl } = await loadProduct(
      root,
      'lib/team-invite.js'
    )
    const { teamInviteMail } = await loadProduct(root, 'mail/emails.js')
    const token = await withClock(NOW, () =>
      signTeamInvite({ email: 'p@tracy.ai', role: 'editor', siteKeys: [facts.siteKey] }, SECRET)
    )
    const accept = teamInviteUrl(token, `${facts.origin}/`)
    const decline = teamInviteDeclineUrl(token, facts.origin)
    return [
      await check('urls-absolute-with-token', async () => {
        assert.equal(accept, `${facts.origin}/invite/${token}`)
        assert.equal(decline, `${accept}/decline`)
      }),
      ...(await Promise.all(
        LANGS.map((lang) =>
          check(`mail-carries-both-links:${lang}`, async () => {
            const mail = teamInviteMail({
              ...facts.direct.teamInvite,
              acceptUrl: accept,
              declineUrl: decline,
              lang
            })
            const hrefs = withoutLegalLinks(mail.html, mail.text, lang, lang)
            assert.ok(hrefs.includes(accept), 'accept link missing from html')
            assert.ok(hrefs.includes(decline), 'decline link missing from html')
            assert.ok(mail.text.includes(accept) && mail.text.includes(decline), 'links missing from text')
            for (const href of hrefs) assertDeploymentUrl(href, lang)
            const days = oracle.lifetimes.inviteSeconds.value / 86400
            assert.ok(new RegExp(`\\b${days}\\b`).test(mail.text), `the ${days}-day lifetime is not printed`)
          })
        )
      ))
    ]
  }
}

const transportAssertions = {
  'mail.transport.payload': async (root) => {
    const { resendTransport } = await loadProduct(root, 'mail/transport.js')
    const make = (answer) => {
      const rec = recordedFetch(answer)
      return {
        ...rec,
        transport: resendTransport({
          key: 'KEY',
          from: 'Tracy <noreply@tracy.test>',
          fetchImpl: rec.fetchImpl,
          log: () => {}
        })
      }
    }
    return [
      await check('fields-pass-through', async () => {
        const { transport, calls } = make()
        const id = await transport.send({
          to: 'ana@tracy.ai',
          subject: 'S',
          text: 'T',
          html: '<p>H</p>',
          headers: { 'List-Unsubscribe': '<https://tracy.test/u>' },
          idempotencyKey: 'k-1',
          replyTo: 'leo@tracy.ai'
        })
        assert.equal(id, 'provider-id')
        assert.equal(calls.length, 1)
        const [call] = calls
        assert.equal(call.url, 'https://api.resend.com/emails')
        assert.equal(call.init.method, 'POST')
        assert.equal(call.init.headers.authorization, 'Bearer KEY')
        assert.equal(call.init.headers['Idempotency-Key'], 'k-1')
        assert.ok(!JSON.stringify(call.body).includes('KEY'), 'the API key travels in the body')
        assert.deepEqual(call.body, {
          from: 'Tracy <noreply@tracy.test>',
          to: 'ana@tracy.ai',
          subject: 'S',
          text: 'T',
          reply_to: 'leo@tracy.ai',
          html: '<p>H</p>',
          headers: { 'List-Unsubscribe': '<https://tracy.test/u>' }
        })
      }),
      await check('no-key-no-ack', async () => {
        const { transport, calls } = make()
        assert.equal(await transport.send({ to: 'a@tracy.ai', subject: 'S', text: 'T' }), undefined)
        assert.equal(calls[0].init.headers['Idempotency-Key'], undefined)
        assert.equal('html' in calls[0].body, false)
        assert.equal('headers' in calls[0].body, false)
      }),
      await check('recipient-list-unchanged', async () => {
        const { transport, calls } = make()
        await transport.send({ to: ['a@tracy.ai', 'b@tracy.ai'], subject: 'S', text: 'T' })
        assert.deepEqual(calls[0].body.to, ['a@tracy.ai', 'b@tracy.ai'])
      })
    ]
  },

  'mail.transport.failure': async (root) => {
    const { resendTransport } = await loadProduct(root, 'mail/transport.js')
    const make = (answer) =>
      resendTransport({
        key: 'KEY',
        from: 'f@tracy.test',
        fetchImpl: recordedFetch(answer).fetchImpl,
        log: () => {}
      })
    const mail = { to: 'a@tracy.ai', subject: 'S', text: 'T' }
    return [
      ...(await Promise.all(
        [400, 401, 422, 429, 500, 503].map((status) =>
          check(`status-${status}-is-not-sent`, async () => {
            await assert.rejects(
              () => make(() => new Response('{}', { status })).send(mail),
              new RegExp(`resend answered ${status}`)
            )
          })
        )
      )),
      await check('malformed-acknowledgement', async () => {
        for (const body of [{}, { id: '' }, { id: 5 }])
          await assert.rejects(
            () => make(() => Response.json(body)).send({ ...mail, idempotencyKey: 'k' }),
            /acknowledgement missing/
          )
      }),
      await check('network-failure', async () => {
        await assert.rejects(
          () => make(() => Promise.reject(new Error('ECONNRESET'))).send(mail),
          /ECONNRESET/
        )
      }),
      await check('abort-signal-reaches-fetch', async () => {
        const rec = recordedFetch()
        const controller = new AbortController()
        await resendTransport({
          key: 'K',
          from: 'f@tracy.test',
          fetchImpl: rec.fetchImpl,
          log: () => {}
        }).send({ ...mail, signal: controller.signal })
        assert.equal(rec.calls[0].init.signal, controller.signal)
      })
    ]
  },

  'mail.transport.reserved': async (root) => {
    const { resendTransport, isUndeliverableAddress, consoleTransport, MailUnavailableError } =
      await loadProduct(root, 'mail/transport.js')
    return [
      ...(await Promise.all(
        oracle.reservedDomains.addresses.map((address) =>
          check(`reserved:${address}`, async () => {
            const rec = recordedFetch()
            const logs = []
            const transport = resendTransport({
              key: 'K',
              from: 'f@tracy.test',
              fetchImpl: rec.fetchImpl,
              skipReserved: true,
              log: (l) => logs.push(l)
            })
            await transport.send({ to: address, subject: 'S', text: 'T' })
            assert.equal(rec.calls.length, 0, 'a reserved address reached the provider')
            assert.ok(!logs.join('\n').includes(address.split('@')[0]), 'the local part was logged')
          })
        )
      )),
      ...(await Promise.all(
        oracle.reservedDomains.deliverable.map((address) =>
          check(`deliverable:${address}`, async () => {
            const rec = recordedFetch()
            await resendTransport({
              key: 'K',
              from: 'f@tracy.test',
              fetchImpl: rec.fetchImpl,
              skipReserved: true,
              log: () => {}
            }).send({ to: address, subject: 'S', text: 'T' })
            assert.equal(rec.calls.length, 1)
            assert.equal(isUndeliverableAddress(address), false)
          })
        )
      )),
      await check('unconfigured-transport-refuses', async () => {
        const logs = []
        const transport = consoleTransport((l) => logs.push(l), { localPreview: false })
        assert.equal(transport.available, false)
        await assert.rejects(
          () =>
            transport.send({ to: 'someone@tracy.ai', subject: 'CODE 123456', text: 'secret body 123456' }),
          MailUnavailableError
        )
        const written = logs.join('\n')
        for (const leaked of ['someone@tracy.ai', 'CODE 123456', 'secret body'])
          assert.ok(!written.includes(leaked), `the log line carries ${leaked}`)
      })
    ]
  },

  'mail.sitemail.token': async (root) => {
    const { siteMailToken, verifySiteMailToken } = await loadProduct(root, 'mail/site-mail/token.js')
    const token = siteMailToken('host-secret', 'site-a')
    return [
      await check('shape-and-determinism', async () => {
        assert.match(token, /^[0-9a-f]{64}$/)
        assert.equal(siteMailToken('host-secret', 'site-a'), token)
      }),
      await check('bound-to-label-and-secret', async () => {
        assert.equal(verifySiteMailToken('host-secret', 'site-a', token), true)
        assert.equal(verifySiteMailToken('host-secret', 'site-b', token), false)
        assert.equal(verifySiteMailToken('other-secret', 'site-a', token), false)
      }),
      await check('malformed-is-false-not-a-throw', async () => {
        for (const [secret, label, tok] of [
          ['', 'site-a', token],
          ['host-secret', '', token],
          ['host-secret', 'site-a', ''],
          ['host-secret', 'site-a', 'zz'],
          ['host-secret', 'site-a', undefined],
          [undefined, 'site-a', token],
          ['host-secret', 'site-a', `${token}0`],
          ['host-secret', 'site-a', flip(token)]
        ])
          assert.equal(verifySiteMailToken(secret, label, tok), false)
      }),
      await check('no-lifetime-and-not-single-use', async () => {
        await withClock(NOW + 10 * 365 * 86_400_000, async () => {
          assert.equal(verifySiteMailToken('host-secret', 'site-a', token), true)
          assert.equal(verifySiteMailToken('host-secret', 'site-a', token), true)
        })
      })
    ]
  }
}

// ---------------------------------------------------------------------------------------------
// Direct builders (invitation, workspace, removal, sign-in, whitelist) x 8 languages.
// ---------------------------------------------------------------------------------------------

const ACCEPT = `${facts.origin}/invite/${facts.direct.teamInvite.token}`
const DECLINE = `${ACCEPT}/decline`
const CODE = '482916'

/** name -> (emails, lang, over) => letter; `over` replaces input fields. */
const BUILDERS = {
  'team.invited': {
    mod: 'mail/emails.js',
    build: (m, lang, over = {}) =>
      m.teamInviteMail({ ...facts.direct.teamInvite, acceptUrl: ACCEPT, declineUrl: DECLINE, lang, ...over }),
    names: ['inviterName'],
    prints: [ACCEPT, DECLINE]
  },
  'workspace-invite': {
    mod: 'mail/emails.js',
    build: (m, lang, over = {}) => m.inviteMail({ ...facts.direct.workspace, lang, ...over }),
    names: ['workspaceName'],
    prints: []
  },
  'workspace-added': {
    mod: 'mail/emails.js',
    build: (m, lang, over = {}) => m.addedToWorkspace({ ...facts.direct.workspace, lang, ...over }),
    names: ['workspaceName'],
    prints: []
  },
  'removal-code': {
    mod: 'mail/emails.js',
    build: (m, lang, over = {}) => m.removalCodeMail({ ...facts.direct.removal, lang, ...over }),
    names: ['targetEmail'],
    prints: [facts.direct.removal.code]
  },
  'signin-code': {
    mod: 'mail/emails.js',
    build: (m, lang, over = {}) => m.signInCodeMail(over.code ?? CODE, lang),
    names: [],
    prints: [CODE]
  },
  'whitelist-beta': {
    mod: 'mail/emails.js',
    build: (m, lang, over = {}) => m.betaMail({ ...facts.direct.beta, lang, ...over }),
    names: [],
    prints: [facts.direct.beta.url]
  },
  'whitelist-confirmation': {
    mod: 'mail/confirmation-mail.js',
    build: (m, lang, over = {}) =>
      m.confirmationMail(
        facts.direct.confirmation.email,
        { ...facts.direct.confirmation.data, ...over },
        facts.direct.confirmation.marketingOrigin,
        lang
      ),
    names: ['name'],
    prints: ['Joomla', '3']
  }
}
export const BUILDER_NAMES = Object.keys(BUILDERS)

async function eachBuilder(root, name, fn) {
  const b = BUILDERS[name]
  const mod = await loadProduct(root, b.mod)
  const out = []
  for (const lang of LANGS)
    out.push(
      await check(`${name}:${lang}`, () =>
        fn({ b, mod, lang, build: (over, l = lang) => b.build(mod, l, over) })
      )
    )
  return out
}

const builderAssertion = (fn) => (name) => (root) => eachBuilder(root, name, fn)

const directAssertions = {
  'mail.direct.shape': builderAssertion(({ b, build, lang }) => {
    const letter = build()
    assert.ok(letter.subject && letter.text, 'subject and text present')
    assert.ok(letter.html, 'html part present')
    assertClean(letter, lang)
    assert.match(letter.html, /<html lang="[^"]+"/)
    assert.ok(letter.html.trimEnd().endsWith('</html>'))
    assert.doesNotMatch(
      letter.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' '),
      /\{\{|\}\}/,
      'template slot left in'
    )
    for (const needle of b.prints)
      assert.ok(letter.text.includes(needle) && letter.html.includes(needle), `${needle} missing from a part`)
    if (letter.subject && b.prints.includes(CODE))
      assert.ok(letter.subject.includes(CODE), 'the code leads the subject')
  }),
  'mail.direct.links': builderAssertion(({ b, build, lang }) => {
    const built = build()
    // Every mail wears the footer with Terms and Privacy (templates/README.md; REG-PR-973).
    const hrefs = withoutLegalLinks(built.html, built.text, lang, lang)
    for (const href of hrefs) {
      if (b.prints.includes(ACCEPT)) assertDeploymentUrl(href, lang)
      else assert.match(href, /^(https?:\/\/[^\s"'<>]+)$/, `bad link ${href}`)
    }
    if (b.prints.includes(ACCEPT)) {
      assert.ok(hrefs.includes(ACCEPT) && hrefs.includes(DECLINE), 'accept and decline links')
      assert.ok(
        hrefs.every((h) => [ACCEPT, DECLINE].includes(h)),
        'unexpected extra link'
      )
      assert.ok(ACCEPT.includes(facts.direct.teamInvite.token), 'token present')
    }
  }),
  'mail.direct.escape': builderAssertion(({ b, build }) => {
    const over = Object.fromEntries(b.names.map((n) => [n, HOSTILE]))
    const letter = build({
      ...over,
      ...(b.names.includes('inviterName') ? { inviterEmail: facts.direct.teamInvite.inviterEmail } : {})
    })
    for (const bad of oracle.hostile.mustNotAppearInHtml)
      assert.ok(!letter.html.includes(bad), `unescaped markup: ${bad}`)
    if (printed(letter).includes('onerror=alert(1)'))
      assert.ok(
        oracle.hostile.mustAppearEscaped.some((ok) => letter.html.includes(ok)),
        'printed but not escaped text'
      )
  }),
  'mail.direct.invalid': builderAssertion(({ b, build }) => {
    const bad = [
      'javascript:alert(1)',
      'https://user:pw@tracy.test/x',
      'ftp://tracy.test/x',
      '',
      'https:///x'
    ]
    if (b.prints.includes(ACCEPT)) {
      for (const url of bad) assert.throws(() => build({ acceptUrl: url }), TypeError, `acceptUrl ${url}`)
      for (const url of bad.slice(0, 2))
        assert.throws(() => build({ declineUrl: url }), TypeError, `declineUrl ${url}`)
      for (const role of ['owner', 'superuser', undefined])
        assert.throws(() => build({ role }), TypeError, `role ${String(role)}`)
    }
    if (b.prints.includes(facts.direct.beta.url))
      for (const url of bad) assert.throws(() => build({ url }), TypeError, `url ${url}`)
    if (b.prints.includes(CODE)) {
      const letter = build({ code: '<b>x</b>' })
      assert.ok(!letter.html, 'a code of the wrong shape must send no code html')
      assert.ok(!allParts(letter).includes('<b>x</b>'), 'the malformed code was printed')
    }
    if (b.prints.includes(facts.direct.removal.code)) {
      const letter = build({ code: '<img src=x onerror=alert(1)>' })
      assert.ok(!allParts(letter).includes('onerror=alert(1)'), 'a code of the wrong shape was printed')
    }
  }),
  'mail.direct.empty': builderAssertion(({ b, build, lang }) => {
    const sets = {
      'team.invited': { siteKeys: [], inviterName: undefined, inviterEmail: undefined },
      'workspace-invite': { inviterEmail: undefined, workspaceName: undefined, siteKeys: [] },
      'workspace-added': { inviterEmail: undefined, workspaceName: undefined, siteKeys: [] },
      'removal-code': { targetEmail: undefined },
      'whitelist-confirmation': { website: null }
    }
    for (const [, over] of Object.entries(sets).filter(([n]) => BUILDERS[n] === b)) {
      const letter = build(over)
      assert.ok(letter.subject && letter.text)
      assertClean(letter, lang)
    }
  }),
  'mail.direct.boundary': builderAssertion(({ b, build }) => {
    const long = 'x'.repeat(5000)
    const sets = {
      'team.invited': { inviterName: long, siteKeys: Array.from({ length: 20 }, (_, i) => `site-${i}.vn`) },
      'workspace-invite': {
        workspaceName: long,
        siteKeys: Array.from({ length: 9 }, (_, i) => `site-${i}.vn`)
      },
      'workspace-added': {
        workspaceName: long,
        siteKeys: Array.from({ length: 9 }, (_, i) => `site-${i}.vn`)
      },
      'removal-code': { targetEmail: `${long}@tracy.ai` },
      'whitelist-confirmation': { name: long, website: `https://${long}.example.org` },
      'signin-code': {},
      'whitelist-beta': {}
    }
    for (const [name, over] of Object.entries(sets).filter(([n]) => BUILDERS[n] === b)) {
      const letter = build(over)
      assert.ok(letter.html.trimEnd().endsWith('</html>'), `${name}: html complete`)
      assert.equal(
        (letter.html.match(/<p\b/g) ?? []).length,
        (letter.html.match(/<\/p>/g) ?? []).length,
        `${name}: unbalanced <p>`
      )
      assert.doesNotMatch(letter.subject, /[\r\n]/)
      if (name === 'team.invited') assert.ok(letter.subject.includes('20'), 'the subject counts the sites')
    }
  }),
  'mail.direct.repeat': builderAssertion(({ build }) => assert.deepEqual(build(), build())),
  'mail.direct.locale': builderAssertion(({ b, mod, lang, build }) => {
    const letter = build()
    assert.equal(primaryTag(letter.html), lang)
    const english = build({}, 'en')
    if (lang !== 'en') {
      assert.notEqual(letter.subject, english.subject, 'subject not translated')
      assert.notEqual(letter.text, english.text, 'text not translated')
    } else
      for (const other of oracle.languages.unsupported)
        assert.deepEqual(b.build(mod, other), english, String(other))
  }),
  'mail.direct.secret': builderAssertion(({ build }) => {
    const extra = { token: SECRET, secret: SECRET, password: SECRET, sessionSecret: SECRET, apiKey: SECRET }
    const letter = build(extra)
    assert.ok(!allParts(letter).includes(SECRET), 'a secret reached the letter')
  })
}

// ---------------------------------------------------------------------------------------------
// Sign-in code through the real identity door with a controllable clock.
// ---------------------------------------------------------------------------------------------

async function signInWorld(root, { sendFails = false } = {}) {
  const { readConfig } = await loadProduct(root, 'config.js')
  const { identityRoutes } = await loadProduct(root, 'identity/route.js')
  const { memoryIdentityStore } = await loadProduct(root, 'identity/store.js')
  const { signInCodeMail } = await loadProduct(root, 'mail/emails.js')
  const { loginMailLimiter } = await loadProduct(root, 'lib/login-mail-rate.js')
  const secret = `${SECRET}-session-key`
  const config = readConfig({
    TRACY_ORIGIN: facts.origin,
    SITE_DOMAIN: HOST,
    SESSION_SECRET: secret,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  const clock = { now: NOW }
  const sent = []
  const app = identityRoutes({
    store: memoryIdentityStore(),
    config,
    now: () => clock.now,
    mail: {
      send: async (m) => {
        if (sendFails) throw new Error('mail is not configured')
        sent.push(m)
      },
      signInCodeMail
    },
    mailRate: loginMailLimiter({ now: () => clock.now })
  })
  const post = (route, body, lang = 'en') =>
    app.fetch(
      new Request(new URL(`${route}?lang=${lang}`, facts.origin), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: facts.origin,
          'cf-connecting-ip': '203.0.113.7'
        },
        body: JSON.stringify(body)
      })
    )
  const codeOf = (mail) => /\b(\d{6})\b/.exec(mail.text)?.[1]
  return { clock, sent, post, codeOf, secret }
}

const EMAIL = facts.direct.signin.email

async function askCode(w, lang = 'en', email = EMAIL) {
  const res = await w.post('/login', { email }, lang)
  assert.equal(res.status, 200, `login answered ${res.status}`)
  const mail = w.sent[w.sent.length - 1]
  const code = w.codeOf(mail)
  assert.match(code ?? '', /^\d{6}$/, 'no six-digit code in the mail')
  return { mail, code }
}

const signInAssertions = {
  'mail.signin.recipient': (root) =>
    Promise.all(
      LANGS.map((lang) =>
        check(`signin:${lang}`, async () => {
          const w = await signInWorld(root)
          const { mail, code } = await askCode(w, lang, `  ${EMAIL.toUpperCase()} `)
          assert.equal(w.sent.length, 1, 'exactly one letter')
          assert.equal(mail.to, EMAIL, 'the code went to a different address than the one asked for')
          assert.equal(primaryTag(mail.html), lang, 'letter not in the request language')
          assert.ok(
            mail.subject.includes(code) && mail.text.includes(code) && mail.html.includes(code),
            'code missing from a part'
          )
          const minutes = oracle.lifetimes.otpMs.value / 60000
          assert.ok(
            new RegExp(`\\b${minutes}\\b`).test(mail.text),
            `the ${minutes}-minute lifetime is not printed`
          )
          assert.ok(!allParts(mail).includes(w.secret), 'the session secret reached the letter')
        })
      )
    ),

  'mail.signin.expiry': async (root) => {
    const ttl = oracle.lifetimes.otpMs.value
    const attempt = async (offset) => {
      const w = await signInWorld(root)
      const { code } = await askCode(w)
      w.clock.now = NOW + offset
      const res = await w.post('/verify', { email: EMAIL, code })
      return { res, body: await res.json().catch(() => ({})) }
    }
    return [
      await check('accepted-before-expiry', async () => {
        const { res, body } = await attempt(ttl - 1)
        assert.equal(res.status, 200)
        assert.equal(body.ok, true)
        assert.ok(res.headers.get('set-cookie'), 'no session after a valid code')
      }),
      await check('refused-after-expiry', async () => {
        for (const offset of [ttl + 1, ttl + 60_000, ttl * 100]) {
          const { res, body } = await attempt(offset)
          assert.equal(res.status, 401, `code accepted ${offset} ms after it was mailed`)
          assert.equal(body.code, 'CODE_INVALID')
          assert.equal(res.headers.get('set-cookie'), null, 'a session was issued for an expired code')
        }
      })
    ]
  },

  'mail.signin.replay': async (root) => [
    await check('used-code-refused', async () => {
      const w = await signInWorld(root)
      const { code } = await askCode(w)
      assert.equal((await w.post('/verify', { email: EMAIL, code })).status, 200)
      const again = await w.post('/verify', { email: EMAIL, code })
      assert.equal(again.status, 401, 'a spent code was accepted again')
      assert.equal(again.headers.get('set-cookie'), null)
    }),
    await check('replaced-code-refused', async () => {
      const w = await signInWorld(root)
      const first = await askCode(w)
      let second = await askCode(w)
      for (let i = 0; i < 4 && second.code === first.code; i += 1) second = await askCode(w)
      assert.notEqual(second.code, first.code, 'harness: two asks gave the same code')
      assert.equal(
        (await w.post('/verify', { email: EMAIL, code: first.code })).status,
        401,
        'the replaced code was accepted'
      )
      assert.equal((await w.post('/verify', { email: EMAIL, code: second.code })).status, 200)
    }),
    await check('too-many-wrong-guesses-spend-the-code', async () => {
      const w = await signInWorld(root)
      const { code } = await askCode(w)
      const wrong = code === '000000' ? '000001' : '000000'
      for (let i = 0; i < oracle.lifetimes.otpMaxAttempts.value; i += 1)
        assert.equal((await w.post('/verify', { email: EMAIL, code: wrong })).status, 401)
      assert.equal(
        (await w.post('/verify', { email: EMAIL, code })).status,
        401,
        'the right code worked after the attempts were spent'
      )
    }),
    await check('code-of-another-address-refused', async () => {
      const w = await signInWorld(root)
      const { code } = await askCode(w)
      assert.equal((await w.post('/verify', { email: 'other@tracy.ai', code })).status, 401)
    })
  ],

  'mail.signin.failure': async (root) => [
    await check('failed-send-is-not-reported-as-sent', async () => {
      const w = await signInWorld(root, { sendFails: true })
      const realError = console.error
      console.error = () => {}
      let res
      try {
        res = await w.post('/login', { email: EMAIL })
      } finally {
        console.error = realError
      }
      const body = await res.json().catch(() => ({}))
      assert.ok(!(res.status === 200 && body.ok === true), 'the door said it sent a code that was never sent')
      assert.ok(res.status >= 400, `status ${res.status}`)
    })
  ]
}

const preferenceAssertions = {
  'mail.preferences.groups': async (root) => {
    const prefs = await loadProduct(root, 'notifications/preferences.js')
    const throwing = { query: async () => assert.fail('the database must not be read for this kind') }
    const byId = oracle.groups.byId
    return [
      await check('six-groups', async () => {
        assert.deepEqual(prefs.NOTIFICATION_GROUPS.map((g) => g.id).sort(), Object.keys(byId).sort())
      }),
      ...(await Promise.all(
        Object.entries(byId).map(([id, kinds]) =>
          check(`group:${id}`, async () => {
            const group = prefs.NOTIFICATION_GROUPS.find((g) => g.id === id)
            assert.ok(group, 'group missing')
            assert.deepEqual(
              [...group.kinds].sort(),
              [...kinds].sort(),
              'the group lists other kinds than the ADR'
            )
            assert.equal(group.locked, id === oracle.groups.lockedId, 'only join-requests is locked')
            for (const kind of kinds)
              assert.equal(prefs.groupOfKind(kind)?.id, id, `${kind} maps to another group`)
          })
        )
      )),
      await check('unknown-kind-always-on', async () => {
        assert.deepEqual(await prefs.preferenceFor(throwing, 'acc', 'kind.nobody.listed'), {
          inbox: true,
          email: true
        })
      }),
      await check('locked-group-always-on', async () => {
        for (const kind of byId[oracle.groups.lockedId])
          assert.deepEqual(await prefs.preferenceFor(throwing, 'acc', kind), { inbox: true, email: true })
      }),
      await check('locked-group-cannot-be-switched-off', async () => {
        const queries = []
        const pool = { query: async (sql, params) => void queries.push([sql, params]) }
        await prefs.savePreferences(
          pool,
          'acc',
          new Map([[oracle.groups.lockedId, { inbox: false, email: false }]])
        )
        assert.equal(queries.length, 0, 'a locked group was written')
        await prefs.savePreferences(pool, 'acc', new Map([['teammates', { email: false }]]))
        assert.equal(queries.length, 1, 'an unlocked group must be written')
      }),
      await check('parse-changes-invalid', async () => {
        for (const body of [null, [], {}, { groups: [] }, { groups: 'x' }])
          assert.deepEqual(prefs.parseChanges(body), { error: 'BAD_BODY' }, JSON.stringify(body))
        assert.deepEqual(prefs.parseChanges({ groups: { nobody: { email: false } } }), {
          error: 'UNKNOWN_GROUP'
        })
        assert.deepEqual(prefs.parseChanges({ groups: { teammates: { email: 'no' } } }), {
          error: 'BAD_BODY'
        })
        assert.deepEqual(
          prefs.parseChanges({ groups: { teammates: { email: false } } }).changes.get('teammates'),
          { email: false }
        )
      })
    ]
  }
}

// ---------------------------------------------------------------------------------------------

export const REGISTRY = new Map()
for (const [id, fn] of Object.entries({
  ...letterAssertions,
  ...notifierAssertions,
  ...tokenAssertions,
  ...transportAssertions,
  ...signInAssertions,
  ...preferenceAssertions
}))
  REGISTRY.set(id, fn)
for (const name of BUILDER_NAMES)
  for (const [id, make] of Object.entries(directAssertions)) {
    // A builder with no free-text input has nothing to escape; the case is not-applicable, not vacuous.
    if (id === 'mail.direct.escape' && BUILDERS[name].names.length === 0) continue
    REGISTRY.set(`${id}:${name}`, make(name))
  }

/**
 * Run one assertion against a product root.
 * @returns {Promise<{id: string, status: 'green'|'red'|'error', variants: object[], failing: object[]}>}
 */
export async function runAssertion(id, root) {
  const fn = REGISTRY.get(id)
  if (!fn)
    return {
      id,
      status: 'error',
      variants: [],
      failing: [{ variant: '-', kind: 'error', message: `unknown assertion ${id}` }]
    }
  let variants
  try {
    variants = await fn(root)
  } catch (error) {
    return {
      id,
      status: 'error',
      variants: [],
      failing: [
        {
          variant: '-',
          kind: 'error',
          message: `setup failed: ${String(error?.message ?? error).split('\n')[0]}`
        }
      ]
    }
  }
  const failing = variants.filter((v) => !v.ok)
  const status =
    failing.length === 0 ? 'green' : failing.every((v) => v.kind === 'assertion') ? 'red' : 'error'
  return { id, status, variants, failing }
}
