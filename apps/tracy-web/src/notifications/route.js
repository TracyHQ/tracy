/**
 * The Inbox doors (spec #809). Every door reads the signed-in person from the session and touches
 * only that person's rows.
 *
 *   GET  /api/notifications[?filter=unread|all&before=<ISO>]  → {notifications, next, unread}
 *   GET  /api/notifications/unread                           → {unread}
 *   POST /api/notifications/:id/read                         → {notification}
 *   POST /api/notifications/read-all                         → {marked}
 *   GET  /api/notifications/preferences                      → {groups}
 *   PUT  /api/notifications/preferences  {groups: {<id>: {inbox?, email?}}} → {groups}
 *   GET  /api/notifications/unsubscribe?t=<token>            → page offering the one-click form
 *   POST /api/notifications/unsubscribe?t=<token>            → that group's email off, "You are unsubscribed"
 *
 * The two unsubscribe doors are the exception to "reads the person from the session": they never
 * read it. The signed token in the mail's List-Unsubscribe header (`unsubscribe.js`) names the
 * account and the group, and is the whole authority, so Gmail's cookie-less one-click POST works and
 * a browser signed in as someone else cannot change anyone's switches but the token's.
 *
 * No session → 401 `NOT_SIGNED_IN`. No account yet (a session for an email the book has never
 * seen) → an empty Inbox, not an error: there is simply nothing to tell that person.
 *
 * 🔒 THE POLL REMEMBERS THE LANGUAGE THE INTERFACE SPEAKS (04/10/2026: every language in
 * Settings, and English for any other). The Inbox asks `/unread` every 30 seconds while open, so
 * this is where that language reaches the account; mail that someone ELSE triggers then goes out
 * in the recipient's language, not the actor's (user story 15). The Inbox poll names the language
 * on screen (`?lang=`, `@tracy/dsh-inbox` `unreadPath`), which wins; without it the order is the
 * one the sign-in pages use (`requestLanguage`): the `tracy_lang` pick, else the device
 * (`Accept-Language`) when it is one of Tracy's eight, else English. So "Follow device" on a
 * Vietnamese computer mails in Vietnamese, and on a Japanese one in English, never in an old pick.
 *
 * Every refusal is `{code, next}`: `next` is one sentence saying what to do instead.
 */
import { Hono } from 'hono'
import { json, requireViewer } from '../lib/http.js'
import { sessionWithExpiry } from '../lib/session.js'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { readUnsubscribeToken } from '../lib/unsubscribe-token.js'
import {
  accountForEmail,
  listNotifications,
  markAllRead,
  markRead,
  recipientsById,
  rememberLanguage,
  unreadCount
} from './store.js'
import { NOTIFICATION_GROUPS, parseChanges, readPreferences, savePreferences } from './preferences.js'
import { UNSUBSCRIBE_PATH } from './unsubscribe.js'
import { unsubscribeConfirmPage, unsubscribeDonePage, unsubscribeInvalidPage } from './unsubscribe-page.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * @param {{config: {sessionSecret: string}, pool: import('pg').Pool, log?: Console}} deps
 */
export function notificationsRoutes({ config, pool, log = console }) {
  const app = new Hono()

  /** The caller's account, or a Response to return as is. `null` account = signed in, no rows. */
  async function caller(c) {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const account = await accountForEmail(pool, email)
    // An admin's view (`/ops` › View as user) is a look, not the customer choosing a language.
    const viewing = Boolean((await sessionWithExpiry(c.req.header('cookie'), config.sessionSecret))?.act)
    if (account && !viewing) {
      const language = requestLanguage(c)
      if (language !== account.language) {
        // Remembering the language must never cost the person their Inbox.
        await rememberLanguage(pool, account.id, language).catch((err) =>
          log.warn('[notifications] language not saved', err)
        )
      }
    }
    return { account }
  }

  app.get('/api/notifications', async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    if (!who.account) return json(c, { notifications: [], next: null, unread: 0 })
    const filter = c.req.query('filter') === 'unread' ? 'unread' : 'all'
    const beforeRaw = c.req.query('before') ?? null
    const before =
      beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : null
    if (beforeRaw && !before) {
      return json(
        c,
        {
          code: 'BAD_CURSOR',
          next: 'Send `before` as the createdAt of the last row shown, or leave it out.'
        },
        400
      )
    }
    const page = await listNotifications(pool, who.account.id, { filter, before })
    return json(c, { ...page, unread: await unreadCount(pool, who.account.id) })
  })

  app.get('/api/notifications/unread', async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    return json(c, { unread: who.account ? await unreadCount(pool, who.account.id) : 0 })
  })

  app.post('/api/notifications/read-all', async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    return json(c, { marked: who.account ? await markAllRead(pool, who.account.id) : 0 })
  })

  // Settings › Notifications (`preferences.js`): the five groups, each with its two switches.
  app.get('/api/notifications/preferences', async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    return json(c, { groups: await readPreferences(pool, who.account?.id ?? null) })
  })

  app.put('/api/notifications/preferences', async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    if (!who.account) {
      return json(
        c,
        { code: 'NO_ACCOUNT', next: 'Sign in again: there is no account for this session yet.' },
        404
      )
    }
    const body = await c.req.json().catch(() => null)
    const parsed = parseChanges(body)
    if (parsed.error) {
      return json(
        c,
        {
          code: parsed.error,
          next:
            parsed.error === 'UNKNOWN_GROUP'
              ? 'Use a group id from GET /api/notifications/preferences.'
              : 'Send {"groups": {"<group id>": {"inbox": true|false, "email": true|false}}}.'
        },
        400
      )
    }
    await savePreferences(pool, who.account.id, parsed.changes)
    return json(c, { groups: await readPreferences(pool, who.account.id) })
  })

  // One-click unsubscribe (`unsubscribe.js`). The token is the authority; the session is never read.
  const SWITCHABLE = new Set(NOTIFICATION_GROUPS.filter((g) => !g.locked).map((g) => g.id))
  const manageUrl = `${String(config.origin ?? '').replace(/\/+$/, '')}/?settings=notifications`

  /** The account and group a link names, with the reader's translator, or null for a bad link. */
  async function unsubscribeTarget(c) {
    const claims = await readUnsubscribeToken(c.req.query('t'), config.sessionSecret)
    if (!claims || !SWITCHABLE.has(claims.groupId) || !UUID.test(claims.accountId)) return null
    const account = (await recipientsById(pool, [claims.accountId])).get(claims.accountId)
    if (!account) return null
    return { ...claims, t: translator(account.language ?? requestLanguage(c)) }
  }

  /** An unsubscribe page: never cached, and the token in the address never leaves as a Referer. */
  function unsubscribePage(c, html, status = 200) {
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    return c.html(html, status)
  }

  app.get(UNSUBSCRIBE_PATH, async (c) => {
    const target = await unsubscribeTarget(c)
    if (!target)
      return unsubscribePage(c, unsubscribeInvalidPage({ t: translator(requestLanguage(c)), manageUrl }), 400)
    const action = `${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(c.req.query('t'))}`
    return unsubscribePage(c, unsubscribeConfirmPage({ t: target.t, groupId: target.groupId, action }))
  })

  app.post(UNSUBSCRIBE_PATH, async (c) => {
    const target = await unsubscribeTarget(c)
    if (!target)
      return unsubscribePage(c, unsubscribeInvalidPage({ t: translator(requestLanguage(c)), manageUrl }), 400)
    try {
      // Email off for this group only; the Inbox and every other group keep their values.
      await savePreferences(pool, target.accountId, new Map([[target.groupId, { email: false }]]))
    } catch (error) {
      log.error('[notifications] unsubscribe not saved', error?.message ?? error)
      return unsubscribePage(c, unsubscribeInvalidPage({ t: target.t, manageUrl }), 500)
    }
    return unsubscribePage(c, unsubscribeDonePage({ t: target.t, groupId: target.groupId, manageUrl }))
  })

  app.post('/api/notifications/:id/read', async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const row = who.account && UUID.test(id) ? await markRead(pool, who.account.id, id) : null
    if (!row) {
      return json(
        c,
        {
          code: 'NOTIFICATION_NOT_FOUND',
          next: 'Reload the Inbox: this notification is gone or is not yours.'
        },
        404
      )
    }
    return json(c, { notification: row })
  })

  return app
}
