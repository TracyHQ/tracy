/**
 * The design record's two doors (ADR 0023, "Addendum 29/09"). Mounted with its dependencies handed
 * in, like `settings.js`, so the rules below are tested without a database.
 *
 * - GET  /api/sites/:key/design — any live grant on the site (a browser session or the lane's
 *   actor); always 200 `{design: … | null}`, the shape `/v1` answers too.
 * - PUT  /api/sites/:key/design — ONLY a verified actor assertion: the build's `check` stage, signed
 *   by the lane in the name of the person who pressed. A seat is not the build: a browser session or
 *   an api key could otherwise write a record that lies, and that record is both the ruler of
 *   `tracy_design_check` and a public answer. `wrote_by` is the server's word (`build`).
 *   The actor's seat must also hold the toolset the Apply door asks of `theme.style` (the record says
 *   what `theme.style` would say): an editor whose policy forbids a theme change cannot write it by
 *   this door either. The rule is the Apply door's own (`toolsetRefusal`), never a copy of it.
 *   The tokens are stored as sent, never regenerated: for `source: 'quickstart'` they are the only
 *   copy tracy-web will ever have (`lib/site-design.js`, top).
 */
import { designRecordProblem } from '../lib/site-design.js'

/**
 * @param {import('hono').Hono} app
 * @param {{
 *   requireGrant: (c: import('hono').Context, siteKey: string, allowActor?: boolean) => Promise<any>,
 *   toolsetRefusal: (auth: any, siteKey: string) => Promise<{ toolset: string, role: string } | null>,
 *   read: (siteKey: string) => Promise<{ design: unknown }>,
 *   write: (siteKey: string, record: any, wroteBy: string) => Promise<void>,
 *   normalize?: (key: string) => string
 * }} deps
 */
export function mountSiteDesign(app, { requireGrant, toolsetRefusal, read, write, normalize = (k) => k }) {
  app.get('/api/sites/:key/design', async (c) => {
    c.header('cache-control', 'private, no-store')
    const siteKey = normalize(c.req.param('key'))
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    return c.json(await read(siteKey), 200)
  })

  app.put('/api/sites/:key/design', async (c) => {
    c.header('cache-control', 'private, no-store')
    const siteKey = normalize(c.req.param('key'))
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    if (auth.kind !== 'actor')
      return c.json(
        { code: 'DESIGN_RECORD_BUILD_ONLY', error: 'Only the build records what a site wears.' },
        403
      )
    const refused = await toolsetRefusal(auth, siteKey)
    if (refused) return c.json({ code: 'TOOLSET_NOT_GRANTED', ...refused }, 403)
    const body = await c.req.json().catch(() => null)
    const problem = designRecordProblem(body)
    if (problem) return c.json({ code: 'DESIGN_RECORD_INVALID', error: problem }, 400)
    const b = /** @type {Record<string, any>} */ (body)
    await write(
      siteKey,
      {
        id: b.id,
        source: b.source,
        name: b.name ?? null,
        platform: b.platform,
        tokens: b.tokens ?? null,
        tokensFrom: b.tokensFrom ?? null,
        ...(b.manifestDesign !== undefined ? { manifestDesign: b.manifestDesign } : {})
      },
      'build'
    )
    return c.json(await read(siteKey), 200)
  })
}
