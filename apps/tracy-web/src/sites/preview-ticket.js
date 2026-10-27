/**
 * `POST /api/sites/:key/preview-ticket` — the one door that hands the Browser tab a ticket to turn
 * the comment picker on inside a framed customer site (plan `tasks/todo-comment-to-edit.md` §S).
 * The site proxy (`bar/preview.js`) is the only reader of what this mints.
 *
 * Mounted from `sites/route.js` with one line, reusing that file's `requireGrant`, so the seat
 * rule is the same one every other site door keeps.
 *
 * ANY LIVE SEAT, VIEWER INCLUDED (ADR 0028, PO 08/10/2026): a viewer comments, and pinning a comment
 * to an element is commenting. The ticket edits nothing: the picker only points at an element and
 * reports its words (`lib/preview-ticket.js` `pickAllowed` says what it enables), and every write
 * an answered comment leads to is judged by the Apply door on the seat's role.
 *
 * Refusals, in the order they are checked:
 *   404 `NOT_FOUND`                  — `TRACY_COMMENT_PICKER` is not `1` (the feature does not exist here)
 *   403 `AGENT_NOT_ALLOWED`          — an `x-tracy-actor` header: only a person picks, never an agent
 *   401 `NOT_SIGNED_IN`              — no session (`requireGrant`)
 *   403 `SEAT_NOT_AUTHORIZED`        — no live seat on this site (`requireGrant`)
 *   403 `ROLE_CANNOT_EDIT`           — the seat's role is not a role of the seat book (`pickAllowed`;
 *                                      never a live viewer, editor or owner)
 *   400 `PARENT_ORIGIN_NOT_ALLOWED`  — `parentOrigin` is missing, differs from the request's
 *                                      `Origin`, or is not on the allowlist (`config.origin`)
 * Success: 200 `{ticket, exp}` (`exp` in epoch seconds), `cache-control: no-store`.
 */
import { json, normalizeSiteKey } from '../lib/http.js'
import { mintPreviewTicket, previewParentOrigins } from '../lib/preview-ticket.js'

/**
 * @param {import('hono').Hono} app
 * @param {object} deps
 * @param {object} deps.config - `commentPicker`, `origin`, `sessionSecret`.
 * @param {(c: any, siteKey: string) => Promise<any>} deps.requireGrant - `sites/route.js`'s own.
 * @param {(siteKey: string, role: string) => Promise<boolean>} deps.mayPick - `pickAllowed`, bound.
 * @param {() => number} [deps.now]
 */
export function mountPreviewTicket(app, { config, requireGrant, mayPick, now = Date.now }) {
  app.post('/api/sites/:key/preview-ticket', async (c) => {
    if (!config.commentPicker) return json(c, { code: 'NOT_FOUND' }, 404)
    c.header('cache-control', 'no-store')
    if (c.req.header('x-tracy-actor')) return json(c, { code: 'AGENT_NOT_ALLOWED' }, 403)
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    if (!(await mayPick(siteKey, auth.grant.role))) {
      return json(c, { code: 'ROLE_CANNOT_EDIT', role: auth.grant.role }, 403)
    }
    const body = await c.req.json().catch(() => null)
    const parentOrigin = typeof body?.parentOrigin === 'string' ? body.parentOrigin : ''
    const requestOrigin = c.req.header('origin') ?? ''
    if (
      !parentOrigin ||
      parentOrigin !== requestOrigin ||
      !previewParentOrigins(config).includes(parentOrigin)
    ) {
      return json(c, { code: 'PARENT_ORIGIN_NOT_ALLOWED' }, 400)
    }
    const { ticket, exp } = await mintPreviewTicket({
      site: siteKey,
      email: auth.email,
      aud: parentOrigin,
      secret: config.sessionSecret,
      now: now()
    })
    return json(c, { ticket, exp })
  })
}
