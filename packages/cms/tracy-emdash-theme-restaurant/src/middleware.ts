import { defineMiddleware } from 'astro:middleware'
import { keepPickPrivate } from './lib/stamps'

/**
 * Who may show this site inside a frame. Empty (the default, every customer site): nobody but the
 * site itself — EmDash then sets `X-Frame-Options: SAMEORIGIN` on its own. Set on a DEMO site to the
 * origins of Tracy's Design inspiration preview (`TRACY_FRAME_ANCESTORS="https://cowork.tracy.ai
 * https://*.tracy.ai"`), which frames the live demo so a customer sees the site they will get.
 *
 * A header set here is honoured by EmDash's middleware, which sets its own security headers only
 * when absent (`packages/core/src/astro/middleware.ts`, "set-if-absent"). `frame-ancestors` is the
 * CSP directive browsers read for framing; `X-Frame-Options` cannot list origins, which is why the
 * CSP form is the one that works.
 */
const FRAME_ANCESTORS = (process.env.TRACY_FRAME_ANCESTORS ?? '').trim()

/**
 * Canonical URL form: no trailing slash. `/about/` redirects (301) to `/about`, query string kept.
 * EmDash's own routes are left alone; the admin owns its URL shapes.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url
  if (pathname !== '/' && pathname.endsWith('/') && !pathname.startsWith('/_emdash/')) {
    return context.redirect(`${pathname.slice(0, -1)}${search}`, 301)
  }
  const res = await next()
  // The admin is never framed, whatever the demo setting says: a framed admin is a clickjacking
  // surface, and nothing in the preview needs it.
  if (FRAME_ANCESTORS !== '' && !pathname.startsWith('/_emdash/')) {
    res.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${FRAME_ANCESTORS}`)
  }
  // A page rendered with provenance stamps is Tracy's preview of it (`src/lib/stamps.ts`).
  keepPickPrivate(context.request, pathname, res.headers)
  return res
})
