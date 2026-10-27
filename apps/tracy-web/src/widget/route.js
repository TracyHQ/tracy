/** Voice-first website discovery. Credentials stay inside this origin, never in model history. */

import { createHmac, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import sharp from 'sharp'
import { verifyActor } from '../lib/actor.js'
import { clearWidgetCookie, parseCookies, WIDGET_COOKIE } from '../lib/cookies.js'
import { clientIp } from '../lib/login-mail-rate.js'
import { SESSION_RENEW_AFTER_S, SESSION_TTL_S } from '../lib/policy.js'
import { overLimit } from '../lib/rate.js'
import { mintSession, sessionFromCookieHeader } from '../lib/session.js'
import { SPEECH_LIMITS } from '../lib/speech.js'
import { uiSwitchOn } from '../lib/ui-setting.js'
import { authLanguagePacks, languageCode } from './auth-language.js'
import { widgetContext } from './context.js'
import { WidgetModelError, widgetConversation } from './model.js'
import { nativeBackendPath } from './native-backend.js'
import { nativeBridge } from './native-bridge.js'
import { nativeSessions } from './native-session.js'
import { ConversationConflict, conversationStore } from './store.js'

const ASSETS = new URL('./assets/', import.meta.url)
const FILES = new Set([
  'index.html',
  'live.js',
  'auth-panel.js',
  'auth-voice.json',
  'speech-cursor.js',
  'email-voice.js',
  'voice.js',
  'speech-facts.js',
  'live.css',
  'embed.js'
])
const BACKEND_PATH =
  /^\/(?:api\/speech(?:\/say)?|api\/design-system\/(?:library|support|thumbnail\/[^/]+|library\/refero\/[a-f0-9-]+\/screenshot.jpg)|api\/sites\/[^/]+\/jobs\/[^/]+)$/
/** The internal guest the widget reads public doors as. Seatless; its token never reaches a browser. */
const GUEST = 'widget-guest@widget.invalid'
/** An internal session is minted again this close to its end, whatever its age. */
const RENEW_BEFORE_END_MS = 5 * 60 * 1000
/**
 * New visitors one address may make (`context.js`, council 19/10/2026): this many an hour, and at
 * most `VISITOR_BURST` in one minute. Starting values for a small pilot.
 */
const VISITORS_PER_HOUR = 20
const VISITOR_BURST = 5
/** A visitor that spoke or listened this recently is busy: one relay session runs at most this long. */
const VOICE_BUSY_MS = SPEECH_LIMITS.sessionSeconds * 1000
export function widgetRoutes({
  config,
  pool,
  request,
  nativeSessionOptions = {},
  nativeBuildStatus = async () => null,
  onDiagnostic = (entry) => console.warn('[widget:runtime]', JSON.stringify(entry)),
  contextStore = conversationStore(pool, config.sessionSecret)
}) {
  const thumbnails = new Map()
  const app = new Hono(),
    visitors = new Map(),
    flows = new Map()
  let guestAccount = false,
    cached = null,
    loaded = 0
  // Internal sessions this process holds and never hands to a browser: the shared guest's, and each
  // anonymous visitor's speech identity (kept with the visitor object, so it goes when the visitor does).
  const guestHeld = {},
    speechHeld = new WeakMap()
  const origin = new URL(config.origin).origin,
    secure = origin.startsWith('https:')
  const state = (v) => ({
    history: v.history,
    brief: v.brief,
    selectedTemplate: v.selectedTemplate,
    selectedSystem: v.selectedSystem,
    templateIds: v.templateIds,
    systemIds: v.systemIds,
    build: v.build || null,
    resumeRequiresSignIn: !!v.locked,
    recovery:
      v.inflight?.kind === 'turn' || v.clientPending?.pendingDraft || v.clientPending?.voiceDraft
        ? {
            message:
              v.inflight?.message ||
              [...new Set([v.clientPending?.pendingDraft, v.clientPending?.voiceDraft].filter(Boolean))].join(
                ' '
              ),
            manualOnly: true
          }
        : null
  })
  /**
   * A visitor whose memory may go when the map is full: anonymous, holding no sign-in, and doing
   * nothing that would be cut — no turn, no pending code or Google popup, no voice in the last
   * session's length, no native conversation (council 19/10/2026).
   */
  function idle(v) {
    const now = Date.now()
    return (
      (!v.ownerId || !!v.locked) &&
      !v.authCookie &&
      !v.busy &&
      !v.nativeHandoff &&
      !(v.authEmail && v.authExpires > now) &&
      !(v.authFlow && flows.has(v.authFlow)) &&
      !(v.voiceAt && now - v.voiceAt < VOICE_BUSY_MS)
    )
  }
  // An address makes at most VISITORS_PER_HOUR visitors, VISITOR_BURST of them in a minute: each read
  // is free now, but a script could still make a visitor per write (council 19/10/2026).
  async function admit(c) {
    const address = clientIp(c)
    const hour = await overLimit(pool, `widget:visitor:${address}`, VISITORS_PER_HOUR)
    const burst = await overLimit(pool, `widget:visitor-burst:${address}`, VISITOR_BURST, Date.now(), 60_000)
    return !hour && !burst
  }
  const { visitor, save } = widgetContext({
    pool,
    config,
    store: contextStore,
    visitors,
    secure,
    admit,
    isIdle: idle
  })
  const bridge = nativeBridge({ origin, request })
  const native = nativeSessions({ save, ...nativeSessionOptions })
  function find(cookie = '') {
    const id = parseCookies(cookie).get(WIDGET_COOKIE)
    const v = visitors.get(id)
    if (!v || v.locked || v.expires <= Date.now()) return null
    // A use, as in `context.js`: the most recently used goes last in the map's eviction order.
    visitors.delete(id)
    visitors.set(id, v)
    return v
  }
  async function signed(c, v) {
    const cookie = c.req.header('cookie') || ''
    if (await sessionFromCookieHeader(cookie, config.sessionSecret)) return cookie
    if (v.authCookie && (await sessionFromCookieHeader(v.authCookie, config.sessionSecret)))
      return v.authCookie
    // Ended (signed out elsewhere) or past its expiry: its stored binding goes too. A failure leaves
    // a binding that restores nothing (`readSignIn` is verified), never a refused read.
    if (v.authCookie && !v.transient) await contextStore?.unbindSignIn?.(v.id).catch(() => {})
    delete v.authCookie
    return ''
  }
  async function bindAuthentication(c, v, cookie) {
    v.authCookie = cookie
    const hydrated = await visitor(
      {
        req: {
          header: (name) => (name === 'cookie' ? `${WIDGET_COOKIE}=${v.id}; ${cookie}` : c.req.header(name))
        },
        header: (...args) => c.header(...args)
      },
      { create: true }
    )
    hydrated.authCookie = cookie
    await save(hydrated)
    // Kept beyond this process (`store.bindSignIn`): the visitor's row exists now that it is saved.
    // Not kept is today's loss on a restart, said in the log, never a failed sign-in.
    if (hydrated.ownerId && !hydrated.locked)
      await contextStore
        ?.bindSignIn?.(hydrated.id, hydrated.ownerId, cookie)
        .catch((error) =>
          console.warn('[widget] sign-in not kept across a restart:', error?.code ?? error?.message)
        )
    return hydrated
  }
  /**
   * The internal session `held` keeps for `email`. It lives SESSION_TTL_S (7 days) and nothing here
   * slides it (`forward` drops the backend's renewed cookie on purpose): minted again once it is
   * SESSION_RENEW_AFTER_S old, as `/auth/me` renews a person's, or within RENEW_BEFORE_END_MS of its
   * end. Kept once, a process up three days answered every anonymous call 401 (council 19/10/2026).
   * One mint at a time per identity: the calls that arrive while it runs wait for it and share it.
   */
  async function internalSession(held, email) {
    const at = Date.now()
    if (
      !held.token ||
      at - held.mintedAt >= SESSION_RENEW_AFTER_S * 1000 ||
      held.endsAt - at <= RENEW_BEFORE_END_MS
    ) {
      held.minting ??= (async () => {
        try {
          if (email === GUEST && !guestAccount) {
            await pool.query('insert into account(email) values ($1) on conflict(email) do nothing', [GUEST])
            guestAccount = true
          }
          const now = Date.now()
          held.token = await mintSession(email, config.sessionSecret, now)
          held.mintedAt = now
          held.endsAt = now + SESSION_TTL_S * 1000
        } finally {
          held.minting = null
        }
      })()
      await held.minting
    }
    return `tracy_sess=${held.token}`
  }
  const guest = () => internalSession(guestHeld, GUEST)
  /**
   * An anonymous visitor's own speech identity (council 19/10/2026): derived here from the visitor id,
   * never sent by the browser, and the same for every renewal, so its day (`ANONYMOUS_SPEECH` in
   * `lib/speech.js`) and its one live voice session are its own. The shared guest gave every
   * visitor one quota, and each new microphone ended another visitor's (`elsewhere`). The speech
   * doors check the session's signature only, so this identity needs no account row.
   */
  function speechGuest(v) {
    const digest = createHmac('sha256', config.sessionSecret)
      .update('widget-speech:' + v.id)
      .digest('hex')
      .slice(0, 16)
    let held = speechHeld.get(v)
    if (!held) speechHeld.set(v, (held = {}))
    return internalSession(held, `widget-guest+${digest}@widget.invalid`)
  }
  async function forward(path, c, v, { method = 'GET', data, authenticated = false, speech = false } = {}) {
    const real = await signed(c, v)
    if (authenticated && !real)
      return new Response(JSON.stringify({ code: 'NOT_SIGNED_IN' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    const response = await request(path, {
      method,
      headers: {
        cookie: real || (speech ? await speechGuest(v) : await guest()),
        origin,
        'content-type': 'application/json'
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    })
    if (real) return response
    // The app may renew an internal guest session; it must never become a browser credential.
    const headers = new Headers(response.headers)
    headers.delete('set-cookie')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  async function get(path, c, v) {
    const r = await forward(path, c, v)
    const x = await r.json()
    if (!r.ok) throw Error(x.code || 'BACKEND_UNAVAILABLE')
    return x
  }
  async function catalog(c, v) {
    if (cached && Date.now() - loaded < 60000) return cached
    const [t, d] = await Promise.all([get('/api/templates', c, v), get('/api/design-system/library', c, v)])
    cached = {
      templates: t.templates,
      systems: d.systems.map((s) => ({
        ...s,
        image: s.image?.startsWith('/api/') ? '/widget/backend' + s.image : s.image
      })),
      readAt: t.readAt
    }
    loaded = Date.now()
    return cached
  }
  async function buildStatus(c, v) {
    if (!(await signed(c, v)) || v.locked) return { state: 'signed_out', links: null }
    if (!v.build?.siteKey || !v.build?.jobId) return { state: 'missing', links: null }
    const path =
      '/api/sites/' +
      encodeURIComponent(v.build.siteKey) +
      '/jobs/' +
      encodeURIComponent(v.build.jobId) +
      '?inspect=1'
    try {
      const r = await forward(path, c, v, { authenticated: true })
      if (!r.ok)
        return {
          state:
            r.status === 410
              ? 'expired'
              : r.status === 404
                ? 'missing'
                : r.status === 401
                  ? 'signed_out'
                  : 'unavailable',
          links: null
        }
      const x = await r.json()
      return x.schema === 'widget-build-status/v1' ? x : { state: 'unavailable', links: null }
    } catch {
      return { state: 'unavailable', links: null }
    }
  }
  const authLanguages = authLanguagePacks({
    pool,
    config,
    admit: async () => !(await overLimit(pool, 'widget:auth-language:all', 100))
  })
  const conversation = widgetConversation({
    pool,
    config,
    catalog,
    buildStatus,
    state,
    save,
    isSignedIn: async (c, v) => !!(await signed(c, v))
  })
  const reply = (c, data, status = 200) => c.json(data, status)
  function unavailable(error, c) {
    // Fixed categories only: driver messages may contain credentials or customer data.
    const code = error?.code || error?.cause?.code
    const transient = new Set([
      'EAI_AGAIN',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENETUNREACH',
      'UND_ERR_CONNECT_TIMEOUT',
      '57P01',
      '57P02',
      '57P03',
      '53300'
    ]).has(code)
    const operation =
      {
        '/widget/api/state': 'state',
        '/widget/api/catalogue': 'catalogue',
        '/widget/api/native/open': 'native_open',
        '/widget/api/turn': 'turn'
      }[c.req.path] || 'other'
    const category =
      code === 'EAI_AGAIN'
        ? 'dns_unavailable'
        : transient
          ? 'connection_unavailable'
          : error?.message === 'WIDGET_STATE_UNREADABLE'
            ? 'saved_context_unreadable'
            : 'unexpected'
    try {
      onDiagnostic({ operation, category, retryable: transient })
    } catch {}
    return reply(c, { code: 'WIDGET_UNAVAILABLE', retryable: transient }, transient ? 503 : 500)
  }
  const errorReply = (error, c) => {
    c.header('cache-control', 'no-store')
    // A new visitor refused (`context.js`): the address made too many, or every slot is busy.
    if (error?.message === 'WIDGET_VISITOR_LIMIT') return reply(c, { code: 'WIDGET_VISITOR_LIMIT' }, 429)
    if (error?.message === 'WIDGET_AT_CAPACITY') {
      c.header('retry-after', '30')
      return reply(c, { code: 'WIDGET_AT_CAPACITY', retryable: true }, 503)
    }
    if (error?.message?.startsWith('WIDGET_NATIVE_'))
      return reply(
        c,
        { code: error.message, manualOnly: true },
        /SIGN_IN|IDENTITY/.test(error.message) ? 401 : 409
      )
    return error instanceof WidgetModelError
      ? reply(c, { code: 'MODEL_UNAVAILABLE', reason: error.reason }, error.status)
      : error instanceof ConversationConflict
        ? reply(c, { code: 'WIDGET_STATE_CONFLICT', manualOnly: true }, 409)
        : unavailable(error, c)
  }
  app.onError(errorReply)
  app.use('*', async (c, next) => {
    c.header('cache-control', 'no-store')
    c.header('x-content-type-options', 'nosniff')
    c.header('referrer-policy', 'no-referrer')
    if (!(await uiSwitchOn(pool, 'website-voice-widget'))) return reply(c, { code: 'WIDGET_DISABLED' }, 404)
    if (new URL(c.req.url).hostname !== new URL(origin).hostname)
      return reply(c, { code: 'NOT_ON_THIS_HOST' }, 404)
    // The native tabs handshake has no body or JSON content type by design.
    const nativeHello =
      c.req.method === 'POST' &&
      c.req.path === '/widget/native/api/tracy-site-tabs/hello' &&
      !c.req.header('content-type') &&
      Number(c.req.header('content-length') || 0) === 0
    const nativeUpload =
      c.req.method === 'POST' &&
      c.req.path === '/widget/native/api/session/uploadFileBinary' &&
      c.req.header('content-type')?.split(';')[0] === 'application/octet-stream'
    if (
      !['GET', 'HEAD'].includes(c.req.method) &&
      (c.req.header('origin') !== origin ||
        (!nativeUpload && !nativeHello && !c.req.header('content-type')?.startsWith('application/json')))
    )
      return reply(c, { code: 'ORIGIN_REFUSED' }, 403)
    const maxBody = nativeUpload
      ? 16 * 1024 * 1024
      : c.req.path.startsWith('/widget/native/')
        ? 128000
        : 16000
    if (Number(c.req.header('content-length') || 0) > maxBody)
      return reply(c, { code: 'REQUEST_TOO_LARGE' }, 413)
    try {
      if (nativeHello && (await c.req.raw.clone().arrayBuffer()).byteLength !== 0)
        return reply(c, { code: 'REQUEST_INVALID' }, 400)
      if (nativeUpload) {
        const v = await visitor(c, { create: false })
        const ids = new URL(c.req.url).searchParams.getAll('sessionId')
        if (
          !(await signed(c, v)) ||
          v.nativeHandoff?.state !== 'ready' ||
          ids.length !== 1 ||
          ids[0] !== v.nativeHandoff.sessionId
        )
          return reply(c, { code: 'WIDGET_NATIVE_SESSION_MISMATCH' }, 403)
        const reader = c.req.raw.clone().body?.getReader()
        let bytes = 0
        if (reader) {
          try {
            for (;;) {
              const chunk = await reader.read()
              if (chunk.done) break
              bytes += chunk.value.byteLength
              if (bytes > maxBody) {
                void reader.cancel()
                return reply(c, { code: 'REQUEST_TOO_LARGE' }, 413)
              }
            }
          } finally {
            reader.releaseLock()
          }
        }
      }
      if (
        !['GET', 'HEAD'].includes(c.req.method) &&
        !nativeUpload &&
        (await (maxBody > 16000 ? c.req.raw.clone().text() : c.req.text())).length > maxBody
      )
        return reply(c, { code: 'REQUEST_TOO_LARGE' }, 413)
      await next()
    } catch (error) {
      return errorReply(error, c)
    }
  })
  app.post('/api/native/open', async (c) => {
    const body = await c.req.json()
    if (!body || Object.keys(body).length) return reply(c, { code: 'REQUEST_INVALID' }, 400)
    const v = await visitor(c)
    const cookie = await signed(c, v)
    const email = await sessionFromCookieHeader(cookie, config.sessionSecret)
    const mapping = await native.open(v, email)
    return reply(c, {
      sessionId: mapping.sessionId,
      contextHash: mapping.contextHash,
      url: '/widget/native/s/' + mapping.sessionId,
      expandedUrl: '/new/s/' + mapping.sessionId
    })
  })
  app.post('/api/native/logout', async (c) => {
    const v = await visitor(c, { create: false })
    const cookie = await signed(c, v)
    if (!cookie || v.nativeHandoff?.state !== 'ready') return reply(c, { code: 'NOT_SIGNED_IN' }, 401)
    await bridge.revoke(v, cookie).catch(() => {})
    const ended = await request('/auth/signout', {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{}'
    })
    const result = await ended.json().catch(() => null)
    if (!ended.ok || result?.ok !== true) return reply(c, { code: 'WIDGET_NATIVE_SIGN_OUT_UNAVAILABLE' }, 503)
    delete v.authCookie
    await contextStore?.unbindSignIn?.(v.id)
    bridge.reset(v)
    visitors.delete(v.id)
    for (const value of ended.headers.getSetCookie()) c.header('set-cookie', value, { append: true })
    c.header('set-cookie', clearWidgetCookie({ secure }), { append: true })
    return reply(c, { ok: true })
  })
  const nativeContext = async (c) => {
    c.header('cache-control', 'no-store')
    c.header('x-content-type-options', 'nosniff')
    c.header('referrer-policy', 'no-referrer')
    const sessionId = c.req.query('session')
    if (!/^session-widget-[a-f0-9-]{36}$/i.test(sessionId || ''))
      return reply(c, { code: 'REQUEST_INVALID' }, 400)
    const actor = await verifyActor(c.req.header('x-tracy-actor'), config.actorSecret)
    const firstParty = await sessionFromCookieHeader(c.req.header('cookie') || '', config.sessionSecret)
    let email = actor || firstParty
    let v = null
    if (c.req.path.startsWith('/widget/')) {
      v = await visitor(c)
      const cookie = await signed(c, v)
      email = await sessionFromCookieHeader(cookie, config.sessionSecret)
      if (v.nativeHandoff?.sessionId !== sessionId) return reply(c, { code: 'NOT_FOUND' }, 404)
    }
    if (!email) return reply(c, { code: 'NOT_SIGNED_IN' }, 401)
    const { rows } = await pool.query('select id from account where email=$1', [email])
    const saved = rows[0]?.id && (await contextStore?.readNativeForSession(sessionId, rows[0].id))
    if (!saved) return reply(c, { code: 'NOT_FOUND' }, 404)
    return reply(c, {
      context: saved.context,
      contextHash: saved.contextHash,
      currentBuild: await nativeBuildStatus({ accountId: rows[0].id, build: saved.build })
    })
  }
  app.get('/api/native/context', nativeContext)
  app.nativeContext = nativeContext
  app.all('/native/backend/*', async (c) => {
    const path = nativeBackendPath(
      c.req.method,
      c.req.path.slice('/widget/native/backend'.length) + new URL(c.req.url).search
    )
    if (!path) return reply(c, { code: 'NOT_FOUND' }, 404)
    const v = await visitor(c, { create: false })
    const cookie = await signed(c, v)
    if (!cookie || v.locked || v.nativeHandoff?.state !== 'ready')
      return reply(c, { code: 'NOT_SIGNED_IN' }, 401)
    const response = await request(path, {
      method: c.req.method,
      signal: c.req.raw.signal,
      headers: {
        cookie,
        origin,
        'content-type': c.req.header('content-type') || 'application/json',
        accept: 'application/json'
      },
      ...(['GET', 'HEAD'].includes(c.req.method) ? {} : { body: await c.req.text() })
    })
    const headers = new Headers(response.headers)
    headers.delete('set-cookie')
    headers.set('cache-control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  })
  app.all('/native/*', async (c) => {
    const v = await visitor(c, { create: false })
    return bridge.forward(c.req.raw, v, await signed(c, v))
  })
  app.get('/', async (c) => c.html(await readFile(new URL('index.html', ASSETS), 'utf8')))
  app.get('/assets/:file', async (c) => {
    const name = c.req.param('file')
    if (!FILES.has(name)) return c.notFound()
    c.header(
      'content-type',
      name.endsWith('.json')
        ? 'application/json'
        : name.endsWith('.css')
          ? 'text/css'
          : name.endsWith('.html')
            ? 'text/html'
            : 'text/javascript'
    )
    return c.body(await readFile(new URL(name, ASSETS)))
  })
  app.get('/embed.js', async (c) => {
    c.header('content-type', 'text/javascript')
    return c.body(await readFile(new URL('embed.js', ASSETS)))
  })
  app.get('/api/state', async (c) => {
    // No visitor yet: a fresh, unsaved state (council 19/10/2026, `context.js`); a page load of an
    // embedding site makes nothing until the person starts something.
    const v = await visitor(c)
    if (!v.revision && !v.locked && !v.transient) await save(v)
    return reply(c, {
      ...state(v),
      buildStatus: await buildStatus(c, v),
      speech: await get('/api/speech', c, v),
      authPending: v.authEmail && v.authExpires > Date.now() ? { email: v.authEmail, step: 'code' } : null,
      signedIn: !!(await signed(c, v))
    })
  })
  app.get('/api/build-status', async (c) => reply(c, await buildStatus(c, await visitor(c))))
  app.get('/api/catalogue', async (c) => reply(c, await catalog(c, await visitor(c))))
  app.get('/api/template-thumb/:id', async (c) => {
    const v = await visitor(c),
      t = (await catalog(c, v)).templates.find((t) => t.id === c.req.param('id'))
    if (!t?.card?.image) return c.notFound()
    const u = new URL(t.card.image, origin)
    if (u.origin !== origin) return c.notFound()
    let bytes = thumbnails.get(t.id)
    if (!bytes) {
      const response = await request(u.pathname + u.search, { headers: { origin } })
      if (!response.ok) return c.notFound()
      const raw = Buffer.from(await response.arrayBuffer())
      if (raw.length > 25000000) return c.notFound()
      const meta = await sharp(raw).metadata()
      bytes = await sharp(raw)
        .extract({
          left: 0,
          top: 0,
          width: meta.width,
          height: Math.min(meta.height, Math.round(meta.width * 0.7))
        })
        .resize({ width: 640 })
        .webp({ quality: 80 })
        .toBuffer()
      thumbnails.set(t.id, bytes)
    }
    c.header('content-type', 'image/webp')
    return c.body(bytes)
  })
  app.post('/api/visible', async (c) => {
    const v = await visitor(c),
      b = await c.req.json(),
      data = await catalog(c, v)
    if (v.nativeHandoff) return reply(c, { code: 'WIDGET_NATIVE_ACTIVE' }, 409)
    for (const [k, rows] of [
      ['Templates', data.templates],
      ['Systems', data.systems]
    ])
      v['visible' + k] = (Array.isArray(b[k.toLowerCase()]) ? b[k.toLowerCase()] : [])
        .filter((id) => rows.some((r) => r.id === id))
        .slice(0, 36)
    await save(v)
    return reply(c, { ok: true })
  })
  app.post('/api/select', async (c) => {
    const v = await visitor(c),
      b = await c.req.json(),
      data = await catalog(c, v)
    if (v.nativeHandoff) return reply(c, { code: 'WIDGET_NATIVE_ACTIVE' }, 409)
    if (b.kind === 'template' && data.templates.some((t) => t.id === b.id)) v.selectedTemplate = b.id
    else if (b.kind === 'system' && (b.id === null || data.systems.some((d) => d.id === b.id)))
      v.selectedSystem = b.id
    else if (b.kind === 'platform' && ['wordpress', 'joomla', 'emdash'].includes(b.id))
      v.brief.platform = b.id
    else if (b.kind === 'brief' && typeof b.name === 'string') v.brief.name = b.name.slice(0, 200)
    else return reply(c, { code: 'SELECTION_INVALID' }, 400)
    await save(v)
    return reply(c, state(v))
  })
  app.post('/api/turn', async (c) => {
    const v = await visitor(c)
    if (v.nativeHandoff) return reply(c, { code: 'WIDGET_NATIVE_ACTIVE' }, 409)
    if (v.authEmail && v.authExpires < Date.now()) delete v.authEmail
    if (v.authFlow && !flows.has(v.authFlow)) delete v.authFlow
    if (v.authEmail || v.authFlow) return reply(c, { code: 'SIGN_IN_IN_PROGRESS' }, 409)
    if (v.busy) return reply(c, { code: 'TURN_IN_PROGRESS' }, 409)
    const b = await c.req.json()
    if (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 4000)
      return reply(c, { code: 'MESSAGE_INVALID' }, 400)
    if (await overLimit(pool, 'widget:turn:all', 500)) return reply(c, { code: 'RATE_LIMITED' }, 429)
    if (v.locked) return reply(c, { code: 'NOT_SIGNED_IN' }, 401)
    v.busy = true
    try {
      v.inflight = { kind: 'turn', message: b.message.trim(), at: Date.now() }
      // A new turn replaces the words an earlier failed one left for review, as it replaces `inflight`.
      v.clientPending = { ...v.clientPending, pendingDraft: '' }
      await save(v)
      try {
        return reply(c, await conversation.turn(c, v, b.message.trim(), b.describeSelection === true))
      } catch (error) {
        await settleFailedTurn(v)
        throw error
      }
    } finally {
      v.busy = false
    }
  })
  /**
   * A turn that failed here was not answered: its words stay for review, as unsent words (the
   * recovery the state door offers, manual only), and the turn stops standing in the way of the
   * native hand-off (`native-session.js`). The error reply is the caller's, unchanged.
   */
  async function settleFailedTurn(v) {
    if (v.inflight?.kind !== 'turn') return
    v.clientPending = { ...v.clientPending, pendingDraft: v.inflight.message }
    v.inflight = null
    // Unsaved, the stored turn grows stale and no longer blocks (`native-session.js` `stillRunning`).
    await save(v).catch(() => {})
  }
  app.get('/api/support', async (c) => {
    const v = await visitor(c),
      t = (await catalog(c, v)).templates.find((t) => t.id === v.selectedTemplate),
      p = t?.platforms.find((p) => p.platform === v.brief.platform)
    return reply(
      c,
      p
        ? await get(
            '/api/design-system/support?' + new URLSearchParams({ quickstart: p.tag, platform: p.platform }),
            c,
            v
          )
        : { supported: false, reason: 'TEMPLATE_PLATFORM_UNAVAILABLE' }
    )
  })
  app.post('/api/create', async (c) => {
    const v = await visitor(c)
    if (v.nativeHandoff) return reply(c, { code: 'WIDGET_NATIVE_ACTIVE' }, 409)
    if (!(await signed(c, v))) return reply(c, { code: 'NOT_SIGNED_IN' }, 401)
    if (v.build) return reply(c, v.build)
    const t = (await catalog(c, v)).templates.find((t) => t.id === v.selectedTemplate),
      p = t?.platforms.find((p) => p.platform === v.brief.platform),
      b = await c.req.json()
    // This visitor's create is still waiting for its answer in this process (no await from here on
    // until `creating` is set, so two presses cannot both pass).
    if (v.creating) return reply(c, { code: 'BUILD_REQUEST_UNCERTAIN', manualOnly: true }, 409)
    // An earlier press whose answer never came (a dropped connection, a restart) is sent again exactly
    // as it was, under the same `buildId`. The create door is idempotent on it (`sites/route.js`): this
    // hands back the site and job that press made, or makes the one it never reached — never a second.
    const earlier = v.inflight?.kind === 'create' ? v.inflight.request : null
    if (!earlier && !p) return reply(c, { code: 'TEMPLATE_PLATFORM_UNAVAILABLE' }, 400)
    if (!earlier && !/^[a-z][a-z0-9-]{2,31}$/.test(b.label || ''))
      return reply(c, { code: 'INVALID_LABEL' }, 400)
    const asked = earlier ?? {
      platform: p.platform,
      design: t.id,
      quickstart: p.tag,
      label: b.label,
      ...(v.selectedSystem ? { designSystem: v.selectedSystem } : {})
    }
    v.buildId ??= randomUUID()
    v.inflight = { kind: 'create', at: Date.now(), request: asked }
    v.creating = true
    try {
      await save(v)
      const r = await forward('/api/sites', c, v, {
        method: 'POST',
        authenticated: true,
        data: {
          ...asked,
          buildId: v.buildId,
          brief: {
            ...v.brief,
            about: [v.brief.name, v.brief.about].filter(Boolean).join('. ').slice(0, 2000)
          }
        }
      })
      const x = await r.json().catch(() => null)
      // A site in the answer is this build. `CREATE_PENDING` is a first request still holding the claim:
      // still unknown, so the marker stays for the next press. Any other answer is the door refusing:
      // nothing to reconcile. A request that threw (no answer at all) leaves the marker too.
      if (r.ok && typeof x?.siteKey === 'string' && x.code !== 'CREATE_PENDING') {
        v.build = x
        v.inflight = null
      } else if (!r.ok) v.inflight = null
      await save(v)
      return x ? reply(c, x, r.status) : reply(c, { code: 'BACKEND_UNAVAILABLE' }, r.ok ? 502 : r.status)
    } finally {
      v.creating = false
    }
  })
  app.post('/api/auth/language', async (c) => {
    const body = await c.req.json()
    if (!body || Object.keys(body).some((key) => key !== 'language') || !languageCode(body.language))
      return reply(c, { code: 'AUTH_LANGUAGE_INVALID' }, 400)
    try {
      return reply(c, await authLanguages(body.language))
    } catch {
      return reply(c, { code: 'AUTH_LANGUAGE_UNAVAILABLE' }, 503)
    }
  })
  app.get('/api/auth/status', async (c) => reply(c, { signedIn: !!(await signed(c, await visitor(c))) }))
  app.post('/api/auth/cancel', async (c) => {
    const v = await visitor(c, { create: false })
    if (v.authFlow) flows.delete(v.authFlow)
    delete v.authEmail
    delete v.authFlow
    return reply(c, { ok: true })
  })
  app.post('/api/auth/email', async (c) => {
    const v = await visitor(c),
      b = await c.req.json()
    if (typeof b.email !== 'string' || b.email.length > 254) return reply(c, { code: 'EMAIL_INVALID' }, 400)
    if (v.authFlow) flows.delete(v.authFlow)
    delete v.authFlow
    // The caller's address as this request carried it, so `/login` counts it in the caller's own
    // bucket (`lib/login-mail-rate.js` `clientIp`), trusted exactly as a direct `/login` would trust it.
    const ip = c.req.header('cf-connecting-ip')
    const r = await request('/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', ...(ip ? { 'cf-connecting-ip': ip } : {}) },
        body: JSON.stringify({ email: b.email })
      }),
      x = await r.json()
    if (r.ok) {
      v.authEmail = b.email
      v.authExpires = Date.now() + 600000
    }
    return reply(c, x, r.status)
  })
  app.post('/api/auth/verify', async (c) => {
    const v = await visitor(c, { create: false }),
      b = await c.req.json()
    if (!v.authEmail || v.authExpires < Date.now() || !/^\d{6}$/.test(String(b.code)))
      return reply(c, { code: 'CODE_INVALID' }, 400)
    const r = await request('/verify', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: v.authEmail, code: b.code })
      }),
      x = await r.json()
    if (r.ok) {
      const cookie = r.headers.getSetCookie().find((s) => s.startsWith('tracy_sess='))
      if (!cookie) return reply(c, { code: 'SIGN_IN_UNCONFIRMED' }, 503)
      await bindAuthentication(c, v, cookie.split(';')[0])
      c.header('set-cookie', cookie, { append: true })
      delete v.authEmail
      if (v.authFlow) flows.delete(v.authFlow)
      delete v.authFlow
    }
    return reply(c, x, r.status)
  })
  app.post('/api/auth/google', async (c) => {
    const v = await visitor(c)
    if (!config.oauth?.google) return reply(c, { code: 'GOOGLE_NOT_CONFIGURED' }, 503)
    for (const [id, f] of flows) if (f.expires < Date.now()) flows.delete(id)
    if (v.authFlow) flows.delete(v.authFlow)
    const id = randomUUID()
    v.authFlow = id
    flows.set(id, { visitor: v, expires: Date.now() + 600000 })
    return reply(c, {
      flow: id,
      url: '/signin/google?next=' + encodeURIComponent('/widget/oauth/complete?flow=' + id)
    })
  })
  app.get('/oauth/complete', async (c) => {
    const id = c.req.query('flow'),
      flow = flows.get(id),
      cookie = c.req.header('cookie') || ''
    if (
      !flow ||
      !flow.sessionCookie ||
      flow.expires < Date.now() ||
      !cookie
        .split(';')
        .map((s) => s.trim())
        .includes(flow.sessionCookie) ||
      !(await sessionFromCookieHeader(cookie, config.sessionSecret))
    )
      return reply(c, { code: 'AUTH_FLOW_INVALID' }, 403)
    flows.delete(id)
    await bindAuthentication(c, flow.visitor, flow.sessionCookie)
    delete flow.visitor.authFlow
    delete flow.visitor.authEmail
    return c.html(
      '<!doctype html><title>Signed in to Tracy</title><p>Signed in. Return to Tracy.</p><script>window.opener?.postMessage({type:"tracy:auth:complete",flow:' +
        JSON.stringify(id) +
        '},' +
        JSON.stringify(origin) +
        ');window.close()</script>'
    )
  })
  app.get('/api/speech/stream', (c) => reply(c, { code: 'UPGRADE_REQUIRED' }, 426))
  app.on(['GET', 'POST'], '/backend/*', async (c) => {
    const path = c.req.path.slice('/widget/backend'.length)
    if (
      !BACKEND_PATH.test(path) ||
      !['GET', 'POST'].includes(c.req.method) ||
      (c.req.method === 'POST' && path !== '/api/speech/say')
    )
      return reply(c, { code: 'NOT_FOUND' }, 404)
    const v = await visitor(c)
    // A reading aloud is the visitor's own (`speechGuest`) and keeps it busy (`idle`).
    const speech = path === '/api/speech/say'
    if (speech) v.voiceAt = Date.now()
    return forward(path + new URL(c.req.url).search, c, v, {
      method: c.req.method,
      speech,
      ...(c.req.method === 'POST' ? { data: await c.req.json() } : {})
    })
  })
  app.oauthSession = ({ next, token }) => {
    const url = new URL(next, origin)
    if (url.origin !== origin || url.pathname !== '/widget/oauth/complete') return
    const flow = flows.get(url.searchParams.get('flow'))
    if (flow && flow.expires > Date.now()) flow.sessionCookie = 'tracy_sess=' + token
  }
  app.speechCookie = async (req) => {
    if (req.headers.origin !== origin || !(await uiSwitchOn(pool, 'website-voice-widget'))) return null
    const v = find(req.headers.cookie)
    if (!v) return null
    v.voiceAt = Date.now()
    const real = (await sessionFromCookieHeader(req.headers.cookie, config.sessionSecret))
      ? req.headers.cookie
      : v.authCookie
    if (real && (await sessionFromCookieHeader(real, config.sessionSecret))) {
      if (v.ownerId) {
        const email = await sessionFromCookieHeader(real, config.sessionSecret)
        const { rows } = await pool.query('select id from account where email=$1', [email])
        if (rows[0]?.id !== v.ownerId) return null
      }
      return real
    }
    return speechGuest(v)
  }
  app.nativeUpgrade = async (req) => {
    if (req.headers.origin !== origin || !(await uiSwitchOn(pool, 'website-voice-widget'))) return null
    const v = find(req.headers.cookie)
    if (!v) return null
    const cookie = (await sessionFromCookieHeader(req.headers.cookie, config.sessionSecret))
      ? req.headers.cookie
      : v.authCookie
    const email = cookie && (await sessionFromCookieHeader(cookie, config.sessionSecret))
    if (!email) return null
    const { rows } = await pool.query('select id from account where email=$1', [email])
    if (!rows[0]?.id || rows[0].id !== v.ownerId) {
      bridge.reset(v)
      return null
    }
    return bridge.upgrade(req, v, cookie)
  }
  return app
}
