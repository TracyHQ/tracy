import { randomUUID } from 'node:crypto'
import { parseCookies, WIDGET_COOKIE, widgetCookie } from '../lib/cookies.js'
import { sessionFromCookieHeader } from '../lib/session.js'
import { CONVERSATION_TTL, conversationPayload } from './store.js'

/** How many visitors one process keeps in memory at once. */
export const VISITOR_CAPACITY = 512
const VISITOR_ID = /^[a-f0-9-]{36}$/

/**
 * Authenticated hydration. A different account gets a new visitor; locked context stays private.
 *
 * A VISITOR IS MADE BY ITS FIRST WRITE, NEVER BY A READ (council 19/10/2026). Every page of a site
 * that embeds the widget reads its state and catalogue on load; until 19/10 each cookie-less read made
 * a visitor, wrote its row and set its cookie, so 512 page loads (crawlers, prefetches, one script)
 * filled this process and every new visitor after them was refused with a 500. A read that finds no
 * visitor now answers a fresh, unsaved one (`transient`: no map entry, no row, no cookie). A visitor
 * is made when it starts something that needs an identity — a turn, a choice, speech, a sign-in —
 * and only as often as `admit` lets its address. When the map is full, the least recently used idle
 * visitor (`isIdle`) is let go (a saved one hydrates back on its next request); when none is idle, a
 * write is refused (`WIDGET_AT_CAPACITY`, 503) and a read is still answered.
 */
export function widgetContext({
  pool,
  config,
  store,
  visitors,
  secure,
  capacity = VISITOR_CAPACITY,
  admit = async () => true,
  isIdle = () => false
}) {
  const loading = new Map()
  async function owner(cookie) {
    const email = await sessionFromCookieHeader(cookie || '', config.sessionSecret)
    if (!email || !store) return null
    const { rows } = await pool.query('select id from account where email=$1', [email])
    if (!rows[0]?.id) throw Error('WIDGET_ACCOUNT_UNKNOWN')
    return rows[0].id
  }
  function fresh(id = randomUUID()) {
    return {
      id,
      ...conversationPayload(),
      expires: Date.now() + CONVERSATION_TTL,
      revision: 0,
      ownerId: null
    }
  }
  async function save(v) {
    if (v.locked || v.transient) return
    v.history = v.history.slice(-30)
    if (store) {
      try {
        const saved = await store.write(v.id, v.ownerId, v, v.revision, v.storedOwnerId ?? null)
        Object.assign(v, saved, { storedOwnerId: v.ownerId })
      } catch (error) {
        visitors.delete(v.id)
        throw error
      }
    } else v.expires = Date.now() + CONVERSATION_TTL
  }
  /** Room for one more visitor: the expired go first, then the least recently used idle one. */
  function room() {
    const now = Date.now()
    for (const [key, row] of visitors) if (row.expires <= now) visitors.delete(key)
    if (visitors.size < capacity) return true
    // A Map keeps insertion order and every use re-inserts (`resolve`): the first idle one is the
    // least recently used.
    for (const [key, row] of visitors)
      if (isIdle(row)) {
        visitors.delete(key)
        return true
      }
    return false
  }
  async function resolve(c, create) {
    let id = parseCookies(c.req.header('cookie') || '').get(WIDGET_COOKIE)
    let v = visitors.get(id)
    // A visitor this process does not hold may have signed in before a restart: its binding
    // (`store.readSignIn`) is found by its own visitor cookie alone, and is verified here as any
    // sign-in is — one ended by sign-out restores nothing and is forgotten.
    const restored = !v && id && VISITOR_ID.test(id) ? ((await store?.readSignIn?.(id)) ?? null) : null
    const transientAuth = v?.authCookie ?? restored ?? undefined
    const transientOwner = await owner(transientAuth)
    if (restored && !transientOwner) await store.unbindSignIn?.(id).catch(() => {})
    const accountId = (await owner(c.req.header('cookie'))) || transientOwner
    if (v && v.expires <= Date.now()) {
      visitors.delete(id)
      v = null
      id = null
    }
    if (v && ((v.ownerId && v.ownerId !== accountId) || (v.locked && accountId))) v = null
    if (!v && id && store) {
      const loaded = await store.read(id, accountId)
      if (loaded?.expired) id = null
      else if (loaded?.locked) {
        if (accountId) id = null
        else v = { ...fresh(id), locked: true, ownerId: loaded.ownerAccountId, expires: loaded.expires }
      } else if (loaded)
        v = {
          ...fresh(id),
          ...loaded.data,
          ...loaded,
          ownerId: accountId,
          storedOwnerId: loaded.ownerAccountId
        }
    }
    if (!v || (v.locked && accountId)) {
      // A read with no visitor: a fresh one for this answer only, never kept, saved or given a cookie.
      if (!create) return { ...fresh(), ownerId: accountId, transient: true }
      if (!(await admit(c))) throw Error('WIDGET_VISITOR_LIMIT')
      const next = id && VISITOR_ID.test(id) ? id : randomUUID()
      if (visitors.has(next)) visitors.delete(next)
      else if (!room()) throw Error('WIDGET_AT_CAPACITY')
      v = fresh(next)
      v.ownerId = accountId
      visitors.set(v.id, v)
      c.header('set-cookie', widgetCookie(v.id, { secure }))
    } else {
      if (!v.ownerId && accountId) v.ownerId = accountId
      // Deleted then set: the most recently used goes last, so `room` lets go of the oldest first.
      if (visitors.has(v.id)) visitors.delete(v.id)
      else if (!room()) {
        if (create) throw Error('WIDGET_AT_CAPACITY')
        return v
      }
      visitors.set(v.id, v)
    }
    if (accountId && transientOwner === accountId && transientAuth) v.authCookie = transientAuth
    return v
  }
  return {
    save,
    owner,
    /**
     * The request's visitor. `create` (by default: any method but GET and HEAD) makes one when there
     * is none; without it a read gets a `transient` visitor instead.
     */
    async visitor(c, { create = !['GET', 'HEAD'].includes(c.req.method) } = {}) {
      const id = parseCookies(c.req.header('cookie') || '').get(WIDGET_COOKIE)
      // Serialize hydration, not model work. Database CAS remains the cross-process fence.
      if (id && loading.has(id)) await loading.get(id)
      const promise = resolve(c, create)
      if (id) loading.set(id, promise)
      try {
        return await promise
      } finally {
        if (id && loading.get(id) === promise) loading.delete(id)
      }
    }
  }
}
