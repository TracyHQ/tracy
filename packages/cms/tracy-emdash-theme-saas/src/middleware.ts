import { defineMiddleware } from 'astro:middleware'
import { keepPickPrivate } from './lib/stamps'

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
  // A page rendered with provenance stamps is Tracy's preview of it (`src/lib/stamps.ts`).
  keepPickPrivate(context.request, pathname, res.headers)
  return res
})
