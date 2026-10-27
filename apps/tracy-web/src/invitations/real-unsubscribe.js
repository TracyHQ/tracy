/** The public doors of real invitation mail. The one-time token in the message is the whole
 * authority; no session is read. Unsubscribing stops this campaign's mail to that address only:
 * Sendy and aMember are never written.
 *
 *   GET  /invitations/unsubscribe/:token   page with a form that POSTs the same token (a scanner
 *                                          that only GETs changes nothing, RFC 8058 §3.2)
 *   POST /invitations/unsubscribe/:token   suppress, "You are unsubscribed"
 *   POST /invitations/one-click/:token     RFC 8058 one-click from the List-Unsubscribe header
 *   GET  /o/:token.gif                     estimated opens: always the same 1x1 GIF, no cookie, no
 *                                          redirect, whatever the token; a known one is counted
 *   GET  /c/:token/:n                      estimated clicks: 302 to the letter's n-th link as written
 *                                          (read from the send, never from the request), no cookie;
 *                                          an unknown token gets a page, never a redirect */
import { Hono } from 'hono'
import { escapeHtml } from '../lib/html.js'
import { pageShell } from '../lib/page-shell.js'
import { recordClick, recordOpen, unsubscribeByToken } from './real-send.js'

const card = (heading, inner) => `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${escapeHtml(heading)}</h1>
${inner}
</div>
</div>`

// No script on this page (#1380): link scanners that run page scripts would otherwise press the
// button for the recipient. Only the recipient's own press, or the RFC 8058 one-click POST, writes.
const confirmPage = (action) =>
  pageShell(
    'Unsubscribe from these invitations',
    card(
      'Unsubscribe from these invitations',
      `<form id="unsubscribe-form" method="post" action="${escapeHtml(action)}">
<input type="hidden" name="List-Unsubscribe" value="One-Click">
<button type="submit">Unsubscribe</button>
</form>`
    ),
    ''
  )
const donePage = () =>
  pageShell(
    'You are unsubscribed',
    card(
      'You are unsubscribed',
      '<p class="card-description">You will not receive these invitations again. Other JoomlArt emails are not affected.</p>'
    ),
    ''
  )
const invalidPage = () =>
  pageShell(
    'This link does not work',
    card('This link does not work', '<p class="card-description">Nothing was changed.</p>'),
    ''
  )

// The smallest transparent GIF (1x1).
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
function gif(c) {
  c.header('content-type', 'image/gif')
  c.header('cache-control', 'no-store, no-cache, must-revalidate, max-age=0')
  c.header('referrer-policy', 'no-referrer')
  return c.body(GIF)
}

export function invitationsUnsubscribeRoutes({ pool, keys, log = console }) {
  const app = new Hono()
  const page = (c, html, status = 200) => {
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    return c.html(html, status)
  }
  async function run(token, reason) {
    if (!keys) return { done: false }
    try {
      return await unsubscribeByToken({ pool, keys, token, reason })
    } catch (error) {
      log.error('[invitations] unsubscribe not saved', error?.code ?? 'internal')
      return { done: false, failed: true }
    }
  }
  app.get('/invitations/unsubscribe/:token', (c) =>
    page(c, confirmPage(`/invitations/unsubscribe/${encodeURIComponent(c.req.param('token'))}`))
  )
  app.post('/invitations/unsubscribe/:token', async (c) => {
    const result = await run(c.req.param('token'), 'unsubscribe')
    return result.done ? page(c, donePage()) : page(c, invalidPage(), result.failed ? 500 : 400)
  })
  app.get('/o/:file', async (c) => {
    const token = /^([A-Za-z0-9_-]{43})\.gif$/.exec(c.req.param('file'))?.[1]
    if (token)
      await recordOpen({ pool, token }).catch((error) =>
        log.error('[invitations] open not recorded', error?.code ?? 'internal')
      )
    return gif(c)
  })
  app.get('/c/:token/:n', async (c) => {
    const n = /^\d{1,2}$/.test(c.req.param('n')) ? Number(c.req.param('n')) : -1
    let target = null
    if (keys)
      target = await recordClick({
        pool,
        keys,
        token: c.req.param('token'),
        n,
        userAgent: c.req.header('user-agent') ?? ''
      }).catch((error) => {
        log.error('[invitations] click not recorded', error?.code ?? 'internal')
        return null
      })
    if (!target) return page(c, invalidPage(), 404)
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    return c.redirect(target, 302)
  })
  app.post('/invitations/one-click/:token', async (c) => {
    const result = await run(c.req.param('token'), 'one_click')
    c.header('cache-control', 'no-store')
    return c.text(result.done ? 'Unsubscribed' : 'Not found', result.done ? 200 : result.failed ? 500 : 404)
  })
  return app
}
