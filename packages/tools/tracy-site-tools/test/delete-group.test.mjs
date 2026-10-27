/**
 * A record in N languages is deleted with one question and one call (`delete-group.mjs`, `site-call.mjs`),
 * on WordPress (Polylang groups) and Joomla (associations): a fake relay serves the site's Content API
 * listing and the plugin's per-item `content.delete`, and every case asserts what was sent and answered.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCallMemory } from '../src/host/call-memory.mjs'
import { groupOf, memberByLocale, WALK_FIELDS } from '../src/host/delete-group.mjs'
import { WRITE_RECEIPT_NEXT, runSiteCall } from '../src/host/site-call.mjs'
import { planCall } from '../src/host/site.mjs'

const TITLE = 'Four common mistakes in heavy machine foundation design'

/**
 * One listing row as the plugin projects it.
 * @param {string} id @param {Array<[string, number]>} natives @param {string | null} locale
 * @param {string | null} group @param {string} title
 */
const row = (id, natives, locale, group, title = TITLE) => ({
  id,
  title,
  locale,
  translationGroupId: group,
  native: natives.map(([kind, n]) => ({ kind, id: n }))
})

/** benchwp02 in small: one news post in three languages, another in two, a page with no translation. */
const WP_ROWS = [
  row('c26', [['post', 26]], 'en-US', 'g-four'),
  row('c28', [['post', 28]], 'en-US', 'g-kaluga', '500,000 work hours'),
  row('c5', [['post', 5]], 'en-US', null, 'About'),
  row('c31', [['post', 31]], 'ru-RU', 'g-four', 'Четыре типичные ошибки'),
  row('c33', [['post', 33]], 'ru-RU', 'g-kaluga', '500 000 часов'),
  row('c557', [['post', 557]], 'de-DE', 'g-four', 'Vier häufige Fehler')
]
/** benchjoomla02 in small: an article in two languages, and the page that shows it (menu item first). */
const JOOMLA_ROWS = [
  row(
    'content_page',
    [
      ['menuItem', 101],
      ['article', 551]
    ],
    'en-GB',
    'translation_menu'
  ),
  row('content_551', [['article', 551]], 'en-GB', 'translation_four'),
  row('content_600', [['article', 600]], 'ru-RU', 'translation_four', 'Четыре ошибки'),
  row('content_page_ru', [['menuItem', 102]], 'ru-RU', 'translation_menu')
]

/**
 * A site: its listing (three rows a page, so the walk follows the cursor) and the plugin's delete.
 * @param {{ rows: any[], locales: string[], kind: string, fail?: Record<number, unknown>, listing?: (n: number) => unknown }} site
 */
function site({ rows, locales, kind, fail = {}, listing }) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    if (action === 'content.read') {
      if (listing) return listing(sent.filter(([a]) => a === 'content.read').length)
      const from = params.cursor === undefined ? 0 : Number(params.cursor)
      const next = from + 3 < rows.length ? String(from + 3) : null
      return {
        schemaVersion: 'tracy-content/v1',
        site: { locales },
        pagination: { limit: params.limit, nextCursor: next },
        contents: rows.slice(from, from + 3)
      }
    }
    // The read that names the record on the question (council 20/10/2026).
    if (action === 'content.get') return { ok: true, item: { id: params.id, title: `Record ${params.id}` } }
    if (action === 'content.delete')
      return (
        fail[params.id] ?? {
          ok: true,
          kind,
          id: params.id,
          ...(kind === 'post' ? { key: null } : { trashed: true })
        }
      )
    return { ok: false, error: 'not_scripted' }
  }
  return { sent, send }
}

/** @param {any} send @param {string} platform */
const conversation = (send, platform) => {
  const memory = createCallMemory({ now: () => 1_000 })
  const sessionId = `session-${platform}`
  memory.newTurn(sessionId)
  return {
    memory,
    sessionId,
    label: `${platform}-bench02`,
    actorKey: 'ana@example.com',
    facts: { platform, sealed: false, verifyBodyWrites: false },
    sleep: async () => {},
    send
  }
}

/** @param {Record<string, any>} ctx @param {Record<string, unknown>} params */
const del = async (ctx, params) => {
  const plan = planCall({ action: 'content.delete', params })
  assert.ok(plan.ok, JSON.stringify(plan))
  return /** @type {any} */ (await runSiteCall({ ...ctx, plan }))
}

/** The customer presses the first option of a refusal's own question. @param {Record<string, any>} ctx @param {any} refused */
const yes = (ctx, refused) => {
  const [q] = refused.ask.questions
  ctx.memory.customerAnswered(ctx.sessionId, refused.ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })
}

/** @param {Array<[string, Record<string, any>]>} sent */
const deletes = (sent) => sent.filter(([a]) => a === 'content.delete').map(([, p]) => p)
/** @param {Array<[string, Record<string, any>]>} sent */
const walks = (sent) => sent.filter(([a, p]) => a === 'content.read' && p.fields === WALK_FIELDS)

const PLATFORMS = [
  {
    platform: 'wordpress',
    kind: 'post',
    rows: WP_ROWS,
    locales: ['en-US', 'ru-RU', 'de-DE'],
    id: 26,
    group: [
      [26, 'en-US'],
      [557, 'de-DE'],
      [31, 'ru-RU']
    ],
    other: 31,
    otherLocale: 'ru-RU',
    unrelated: 28
  },
  {
    platform: 'joomla',
    kind: 'article',
    rows: JOOMLA_ROWS,
    locales: ['en-GB', 'ru-RU'],
    id: 551,
    group: [
      [551, 'en-GB'],
      [600, 'ru-RU']
    ],
    other: 600,
    otherLocale: 'ru-RU',
    unrelated: 101
  }
]

for (const t of PLATFORMS) {
  const n = t.group.length

  test(`group delete (${t.platform}): the door's question names the record and its ${n} languages; nothing is deleted before the answer`, async () => {
    const { sent, send } = site(t)
    const ctx = conversation(send, t.platform)

    const refused = await del(ctx, { kind: t.kind, id: t.id })

    assert.equal(refused.code, 'CONFIRM_FIRST')
    assert.equal(refused.languages, n)
    assert.equal(
      refused.ask.questions[0].question,
      `This deletes "${TITLE}" from your site in all ${n} languages. Go ahead?`
    )
    assert.match(refused.error, /One language only: add locale\./)
    assert.ok(refused.next, 'a refusal names its way out')
    assert.equal(deletes(sent).length, 0)
    assert.ok(walks(sent).length >= 2, 'the listing is walked by its cursor')
  })

  test(`group delete (${t.platform}): after one yes, one call deletes every language under one apply_id, and the answer lists each with its undo`, async () => {
    const { sent, send } = site(t)
    const ctx = conversation(send, t.platform)
    yes(ctx, await del(ctx, { kind: t.kind, id: t.id }))
    const walked = walks(sent).length

    const out = await del(ctx, { kind: t.kind, id: t.id, confirm: true })

    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
    assert.deepEqual(
      deletes(sent).map((p) => p.id),
      t.group.map(([id]) => id)
    )
    assert.deepEqual(
      out.deleted,
      t.group.map(([id, locale]) => ({ id, locale }))
    )
    const ids = new Set(deletes(sent).map((p) => p.apply_id))
    assert.equal(ids.size, 1, 'one receipt for the whole record')
    assert.equal(out.undo, `apply.revert {apply_id:"${[...ids][0]}"} puts back all ${n}`)
    assert.equal(out.failed, undefined)
    assert.equal(out.next, WRITE_RECEIPT_NEXT)
    assert.ok(out.normalized.includes(`the customer confirmed it for all ${n} languages`))
    assert.equal(walks(sent).length, walked, 'the confirmed call reuses the walk the question was asked on')
    assert.equal(
      'locale' in deletes(sent)[0] || 'confirm' in deletes(sent)[0],
      false,
      'Tracy’s own parameters are never relayed'
    )
  })

  test(`group delete (${t.platform}): a language that fails is reported with its code, and the others still go`, async () => {
    const { sent, send } = site({
      ...t,
      fail: { [t.other]: { ok: false, error: 'not_found', message: 'gone' } }
    })
    const ctx = conversation(send, t.platform)
    yes(ctx, await del(ctx, { kind: t.kind, id: t.id }))

    const out = await del(ctx, { kind: t.kind, id: t.id, confirm: true })

    assert.equal(deletes(sent).length, n)
    assert.deepEqual(out.failed, [{ id: t.other, locale: t.otherLocale, code: 'not_found' }])
    assert.equal(out.deleted.length, n - 1)
    assert.match(out.next, new RegExp(`^${n - 1} of ${n} languages were deleted`))
  })

  test(`group delete (${t.platform}): the record named first refused — its answer is the answer, and no other language is touched`, async () => {
    const lock = { ok: false, error: 'locked', message: 'being edited' }
    const { sent, send } = site({ ...t, fail: { [t.id]: lock } })
    const ctx = conversation(send, t.platform)
    yes(ctx, await del(ctx, { kind: t.kind, id: t.id }))

    const out = await del(ctx, { kind: t.kind, id: t.id, confirm: true })

    assert.equal(out.ok, false)
    assert.equal(out.error, 'locked')
    assert.equal(deletes(sent).length, 1)
  })

  test(`group delete (${t.platform}): with locale, one language only — asked as such, deleted alone, and the answer names what stays online`, async () => {
    const { sent, send } = site(t)
    const ctx = conversation(send, t.platform)

    const refused = await del(ctx, { kind: t.kind, id: t.other, locale: t.otherLocale })
    yes(ctx, refused)
    const out = await del(ctx, { kind: t.kind, id: t.other, locale: t.otherLocale, confirm: true })

    assert.equal(refused.code, 'CONFIRM_FIRST')
    assert.equal(refused.otherLanguages, n - 1)
    assert.match(
      refused.ask.questions[0].question,
      new RegExp(`^This deletes the ${t.otherLocale} version of ".+" only; its other`)
    )
    assert.equal(out.ok, true)
    assert.deepEqual(
      deletes(sent).map((p) => p.id),
      [t.other]
    )
    assert.equal(out.otherLanguages, n - 1)
    const named = Number(
      /content\.delete \{kind:"\w+", id:(\d+)\} with no locale asks once/.exec(out.next)?.[1]
    )
    assert.ok(
      t.group.some(([id]) => id === named && id !== t.other),
      out.next
    )
  })

  test(`group delete (${t.platform}): a locale that is not the named record's is refused with the call that names the right one`, async () => {
    const { sent, send } = site(t)
    const ctx = conversation(send, t.platform)

    const out = await del(ctx, { kind: t.kind, id: t.id, locale: 'ru' })

    assert.equal(out.code, 'LOCALE_NOT_THIS_RECORD')
    assert.match(out.next, new RegExp(`id:${t.other}, locale:"ru-RU"`))
    assert.equal(deletes(sent).length, 0)
  })

  test(`group delete (${t.platform}): the yes opens that group once — never another record, never the same call twice`, async () => {
    const { sent, send } = site(t)
    const ctx = conversation(send, t.platform)
    yes(ctx, await del(ctx, { kind: t.kind, id: t.id }))

    const other = await del(ctx, {
      kind: t.platform === 'joomla' ? 'menuItem' : t.kind,
      id: t.unrelated,
      confirm: true
    })
    const first = await del(ctx, { kind: t.kind, id: t.id, confirm: true })
    const again = await del(ctx, { kind: t.kind, id: t.id, confirm: true })

    assert.equal(other.code, 'CONFIRM_FIRST', 'another record is asked about on its own')
    assert.equal(first.ok, true)
    assert.equal(again.code, 'CONFIRM_FIRST', 'the agreement is spent by the call it opened')
    assert.equal(deletes(sent).length, n)
  })
}

test('group delete: a site in one language, a record the listing does not hold, or a listing that cannot be read leaves the plain question', async () => {
  const cases = [
    { label: 'one language', over: { locales: ['en-US'] }, id: 26 },
    { label: 'a draft (not listed)', over: {}, id: 999 },
    { label: 'a page with no translation', over: {}, id: 5 },
    {
      label: 'the listing refused',
      over: { listing: () => ({ ok: false, code: 'CONTENT_UNSUPPORTED' }) },
      id: 26
    }
  ]
  for (const { label, over, id } of cases) {
    const { sent, send } = site({
      rows: WP_ROWS,
      locales: ['en-US', 'ru-RU', 'de-DE'],
      kind: 'post',
      ...over
    })
    const ctx = conversation(send, 'wordpress')
    const refused = await del(ctx, { kind: 'post', id })
    yes(ctx, refused)
    const out = await del(ctx, { kind: 'post', id, confirm: true })

    assert.equal(
      refused.ask.questions[0].question,
      `This deletes "Record ${id}" from your site. Go ahead?`,
      label
    )
    assert.equal(refused.languages, undefined, label)
    assert.equal(out.ok, true, label)
    assert.deepEqual(
      deletes(sent).map((p) => p.id),
      [id],
      label
    )
  }
})

test('group delete: a group read is trusted only as the plugin builds it — two members in one language is no group', () => {
  const rows = [
    {
      natives: new Map([['post', 1]]),
      locale: 'en-US',
      group: 'g',
      title: 'A'
    },
    { natives: new Map([['post', 2]]), locale: 'en-US', group: 'g', title: 'B' }
  ]
  assert.equal(groupOf(rows, 'post', 1), null)
})

test('group delete: a language is matched by its tag or, when that names one member, by its primary language', () => {
  const members = [
    { id: 1, locale: 'en-US' },
    { id: 2, locale: 'pt-BR' },
    { id: 3, locale: 'pt-PT' },
    { id: 4, locale: 'ru-RU' }
  ]
  const cases = /** @type {Array<[string, number | null]>} */ ([
    ['ru', 4],
    ['RU-ru', 4],
    ['pt_BR', 2],
    ['pt', null],
    ['de', null]
  ])
  for (const [asked, id] of cases) assert.equal(memberByLocale(asked, members)?.id ?? null, id, asked)
})

test('group delete: a language whose answer is lost stops the walk — the rest are reported unsent, with the receipt that tells', async () => {
  const lost = { ok: false, code: 'COWORK_WEB_UNREACHABLE', error: 'the site did not answer' }
  const { sent, send } = site({
    rows: WP_ROWS,
    locales: ['en-US', 'ru-RU', 'de-DE'],
    kind: 'post',
    fail: { 557: lost }
  })
  const ctx = conversation(send, 'wordpress')
  yes(ctx, await del(ctx, { kind: 'post', id: 26 }))

  const out = await del(ctx, { kind: 'post', id: 26, confirm: true })

  assert.deepEqual(
    deletes(sent).map((p) => p.id),
    [26, 557],
    'nothing is sent after a lost answer'
  )
  assert.deepEqual(out.failed, [
    { id: 557, locale: 'de-DE', code: 'OUTCOME_UNKNOWN' },
    { id: 31, locale: 'ru-RU', code: 'NOT_SENT' }
  ])
  assert.match(out.next, /apply\.list \{apply_id:"wp-[^"]+"\} shows what went/)
})

// 🔒 09/10/2026 (bench hb): a customer who TYPES an answer to the door's question instead of choosing opens
// nothing; the refusal that follows now says so (`typed`), so the agent asks once more instead of going round.
for (const t of PLATFORMS)
  test(`group delete (${t.platform}): a typed answer opens nothing, and the next refusal says the customer must choose`, async () => {
    const { sent, send } = site(t)
    const ctx = conversation(send, t.platform)
    const refused = await del(ctx, { kind: t.kind, id: t.id })
    assert.equal(refused.typed, undefined)
    const [q] = refused.ask.questions
    ctx.memory.customerAnswered(ctx.sessionId, refused.ask, {
      answers: [{ id: q.id, selected: [], custom: 'Just do what I asked.' }]
    })
    const again = await del(ctx, { kind: t.kind, id: t.id, confirm: true })
    assert.equal(again.code, 'CONFIRM_FIRST')
    assert.equal(again.typed, true)
    assert.match(again.next, /^The customer typed words instead of choosing, which opens nothing/)
    assert.deepEqual(deletes(sent), [], 'nothing deleted')
    yes(ctx, again)
    const done = await del(ctx, { kind: t.kind, id: t.id, confirm: true })
    assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  })
