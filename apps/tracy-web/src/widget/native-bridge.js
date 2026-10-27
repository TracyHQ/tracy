/** The visitor credential stays server-side; native dsh still enforces its ordinary seat grant. */
import { SEAT_TOKEN_PREFIX } from '../lib/cookies.js'
export const NATIVE_MOUNT = '/widget/native'
const TARGET_MOUNT = '/new'
const fail = (code) => {
  throw Error(code)
}

function bound(visitor) {
  const mapping = visitor?.nativeHandoff
  if (
    !visitor ||
    visitor.locked ||
    !Number.isFinite(visitor.expires) ||
    visitor.expires <= Date.now() ||
    !mapping ||
    mapping.state !== 'ready' ||
    mapping.visitorId !== visitor.id ||
    mapping.ownerAccountId !== visitor.ownerId ||
    mapping.scope !== 'onboarding' ||
    !/^session-widget-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      mapping.sessionId ?? ''
    )
  )
    fail('WIDGET_NATIVE_NOT_READY')
  return mapping
}

/** Only the explicit widget mount is translated. Neither Referer nor a site pointer selects it. */
export function nativeTarget(pathname, search = '') {
  if (
    !(pathname === NATIVE_MOUNT || pathname.startsWith(NATIVE_MOUNT + '/')) ||
    /%(?:2e|2f|5c)|\\/i.test(pathname)
  )
    fail('WIDGET_NATIVE_PATH_INVALID')
  return TARGET_MOUNT + (pathname.slice(NATIVE_MOUNT.length) || '/') + search
}

export function nativeBridge({ origin, request }) {
  // Native seat credentials are transient, never conversation payload or browser-readable JSON.
  const seats = new WeakMap()
  const cookiesFor = (visitor, cookie) => {
    bound(visitor)
    if (!cookie) fail('WIDGET_NATIVE_SIGN_IN_REQUIRED')
    return [cookie, ...(seats.get(visitor)?.values() ?? [])].filter(Boolean).join('; ')
  }
  return {
    reset(visitor) {
      seats.delete(visitor)
    },
    async revoke(visitor, cookie) {
      const response = await request('/new/gateway/logout', {
        method: 'POST',
        headers: { cookie: cookiesFor(visitor, cookie), origin, 'content-type': 'application/json' },
        body: '{}'
      })
      await response.body?.cancel()
    },
    async forward(raw, visitor, cookie) {
      const url = new URL(raw.url)
      const canonical = new URL(origin)
      // The trusted web listener receives HTTP after TLS termination; keep the exact public host.
      const transportMatches =
        url.origin === origin ||
        (canonical.protocol === 'https:' && url.protocol === 'http:' && url.host === canonical.host)
      if (!transportMatches) fail('WIDGET_NATIVE_ORIGIN_REFUSED')
      if (!['GET', 'HEAD'].includes(raw.method) && raw.headers.get('origin') !== origin)
        fail('WIDGET_NATIVE_ORIGIN_REFUSED')
      const target = nativeTarget(url.pathname, url.search)
      const mapping = bound(visitor)
      const authenticatedCookies = cookiesFor(visitor, cookie)
      if (target === TARGET_MOUNT + '/' || target.startsWith(TARGET_MOUNT + '/?'))
        return Response.redirect(origin + NATIVE_MOUNT + '/s/' + mapping.sessionId, 302)
      const shown = /^\/new\/s\/([^/?]+)/.exec(target)?.[1]
      if (shown && shown !== mapping.sessionId) fail('WIDGET_NATIVE_SESSION_MISMATCH')
      const headers = new Headers(raw.headers)
      headers.delete('host')
      headers.delete('x-tracy-session')
      headers.delete('x-tracy-actor')
      headers.set('cookie', authenticatedCookies)
      const response = await request(target, {
        method: raw.method,
        headers,
        signal: raw.signal,
        ...(['GET', 'HEAD'].includes(raw.method) ? {} : { body: await raw.arrayBuffer() })
      })
      const outgoing = new Headers(response.headers)
      const jar = seats.get(visitor) ?? new Map()
      for (const value of response.headers.getSetCookie()) {
        const pair = value.split(';')[0]
        const at = pair.indexOf('=')
        if (at > 0 && pair.startsWith(SEAT_TOKEN_PREFIX)) jar.set(pair.slice(0, at), pair)
      }
      seats.set(visitor, jar)
      outgoing.delete('set-cookie')
      outgoing.set('cache-control', 'no-store')
      const location = outgoing.get('location')
      if (location) {
        const next = new URL(location, origin)
        if (
          next.origin === origin &&
          (next.pathname === TARGET_MOUNT || next.pathname.startsWith(TARGET_MOUNT + '/'))
        )
          outgoing.set(
            'location',
            NATIVE_MOUNT + next.pathname.slice(TARGET_MOUNT.length) + next.search + next.hash
          )
        else fail('WIDGET_NATIVE_SIGN_IN_REQUIRED')
      }
      if (raw.method !== 'HEAD' && outgoing.get('content-type')?.startsWith('text/html')) {
        const html = (await response.text())
          .replaceAll('"/new/', '"/widget/native/')
          .replaceAll('"/new"', '"/widget/native"')
          .replace(
            '<head>',
            '<head><meta name="tracy-widget-native" content="/widget/native">' +
              '<meta name="tracy-widget-session" content="' +
              bound(visitor).sessionId +
              '">'
          )
        // This explicit widget surface is embeddable. Preserve every other upstream CSP directive.
        const policy = outgoing.get('content-security-policy')
        if (policy)
          outgoing.set(
            'content-security-policy',
            policy
              .split(';')
              .filter((value) => !value.trim().startsWith('frame-ancestors'))
              .join(';')
          )
        outgoing.delete('x-frame-options')
        outgoing.delete('content-length')
        outgoing.delete('content-encoding')
        return new Response(html, { status: response.status, headers: outgoing })
      }
      return new Response(response.body, { status: response.status, headers: outgoing })
    },
    /** Caller has verified visitor identity and the same-origin WS handshake before reaching here. */
    upgrade(req, visitor, cookie) {
      if (req.headers.origin !== origin) fail('WIDGET_NATIVE_ORIGIN_REFUSED')
      const url = new URL(req.url, origin)
      return { url: nativeTarget(url.pathname, url.search), cookie: cookiesFor(visitor, cookie) }
    }
  }
}
