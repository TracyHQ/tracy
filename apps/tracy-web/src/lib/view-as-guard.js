/**
 * `/ops` › View as user, at the door of every request. Two jobs, and NOT a lock — the people who open
 * a view are Tracy staff, trained to look and not to act (23/10/2026), so nothing here refuses a
 * write:
 *
 *   - `/ops` and `/api/ops` ignore the view cookie (`withViewAs(false)`): there the admin is the
 *     admin, so the screen that opened the view keeps working while it is open. Everywhere else the
 *     view cookie counts (`withViewAs(true)`), and doors read the viewed customer.
 *   - Every HTML answer in a view carries a bar that says whose page this is, with a form that ends
 *     the view — the reminder that this is somebody else's account.
 */
import { escapeHtml } from './html.js'
import { sessionWithExpiry, withViewAs } from './session.js'

const EXIT_PATH = '/auth/view-as/exit'

/** Whether the admin must stay the admin on this path. */
function adminOnly(path) {
  return path === '/ops' || path.startsWith('/ops/') || path === '/api/ops' || path.startsWith('/api/ops/')
}

function bar(email, exitAction) {
  return (
    `<div data-view-as-bar title="Viewing as ${escapeHtml(email)}" style="position:fixed;right:6px;bottom:6px;` +
    'z-index:2147483647;display:flex;gap:6px;align-items:center;max-width:60vw;padding:2px 3px 2px 7px;' +
    'border-radius:5px;background:#1f1f1f;color:#fff;font:10px/1.3 system-ui,sans-serif;opacity:.9">' +
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(email)}</span>` +
    `<form method="post" action="${escapeHtml(exitAction)}" style="margin:0">` +
    '<button type="submit" style="font:inherit;color:#1f1f1f;background:#fff;border:0;border-radius:3px;' +
    'padding:1px 5px;cursor:pointer">Exit</button></form></div>'
  )
}

/**
 * @param {{ config: { sessionSecret: string, origin?: string }, now?: () => number }} deps
 * @returns {import('hono').MiddlewareHandler}
 */
export function viewAsGuard({ config, now = () => Date.now() }) {
  const exitAction = `${config.origin ?? ''}${EXIT_PATH}`
  return async (c, next) => {
    if (adminOnly(c.req.path)) return withViewAs(false, next)
    return withViewAs(true, async () => {
      const header = c.req.header('cookie')
      if (!header?.includes('tracy_view=')) return next()
      const session = await sessionWithExpiry(header, config.sessionSecret, now())
      if (!session?.act) return next()
      await next()
      const res = c.res
      const type = res.headers.get('content-type') ?? ''
      if (!type.includes('text/html') || res.headers.has('content-encoding') || !res.body) return
      const html = await res.text()
      const tag = bar(session.email, exitAction)
      const at = html.search(/<\/body\s*>/i)
      const headers = new Headers(res.headers)
      headers.delete('content-length')
      headers.set('cache-control', 'no-store')
      c.res = new Response(at === -1 ? html + tag : html.slice(0, at) + tag + html.slice(at), {
        status: res.status,
        headers
      })
    })
  }
}
