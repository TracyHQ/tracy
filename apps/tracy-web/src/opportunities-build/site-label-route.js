/**
 * Site name on Tracy (#519): the site label a person chooses for an opportunity's demo, first row of the Business brief
 * on Details. Read with the name a build would use today, checked while typed against the create door's own rule and
 * the names this deployment holds, and saved on the opportunity. A build sent without a label then uses it
 * (`suggestedLabel`); cleared, the build names the site from the business again.
 */
import { json } from '../lib/http.js'
import {
  SITE_LABEL_MAX,
  SITE_LABEL_MIN,
  freeLabelFor,
  savedSiteLabel,
  siteLabelCheck,
  suggestedLabel
} from './builds.js'

const BASE = '/api/website-opportunities'

/** The longest text read as a candidate label; anything longer is refused by shape without a query. */
const TYPED_MAX = 64

/**
 * @param {import('hono').Hono} app
 * @param {{ pool: any, config: any, loadDomain: () => Promise<any>, caller: Function, refuse: Function,
 *   notFound: Function, body: Function, UUID: RegExp, opportunityOf: Function }} h
 */
export function siteLabelRoutes(app, h) {
  const { pool, config, caller, refuse, notFound, body, UUID, opportunityOf } = h

  async function ownOpportunity(c) {
    const who = await caller(c)
    if (who instanceof Response) return { refusal: who }
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    return opp ? { opp, who } : { refusal: notFound(c, 'opportunity') }
  }

  /** The label a build of this opportunity would get now when nothing is saved: from its latest brief, else its name. */
  async function suggestionOf(opp) {
    const domain = await h.loadDomain().catch(() => null)
    if (!domain) return null
    const { rows } = await pool.query(
      'select id, opportunity_id, brief from wo_revision where opportunity_id = $1 order by n desc limit 1',
      [opp.id]
    )
    if (rows[0])
      return suggestedLabel({ pool, config, domain, revision: { ...rows[0], opportunity_id: null } })
    return freeLabelFor({ pool, config, domain, name: opp.name })
  }

  app.get(`${BASE}/:id/site-label`, async (c) => {
    const found = await ownOpportunity(c)
    if (found.refusal) return found.refusal
    return json(c, {
      label: (await savedSiteLabel(pool, found.opp.id)) ?? null,
      suggested: await suggestionOf(found.opp),
      prefix: config.siteAddressPrefix ?? '',
      domain: config.siteDomain,
      min: SITE_LABEL_MIN,
      max: SITE_LABEL_MAX
    })
  })

  app.get(`${BASE}/:id/site-label/check`, async (c) => {
    const found = await ownOpportunity(c)
    if (found.refusal) return found.refusal
    const label = String(c.req.query('label') ?? '').trim()
    if (label.length > TYPED_MAX) return json(c, { label, available: false, reason: 'shape' })
    return json(c, { label, ...(await siteLabelCheck({ pool, config, label })) })
  })

  app.put(`${BASE}/:id/site-label`, async (c) => {
    const found = await ownOpportunity(c)
    if (found.refusal) return found.refusal
    const b = await body(c)
    if (b?.label !== null && typeof b?.label !== 'string')
      return refuse(c, 400, 'INVALID_LABEL', 'Send the site name as "label", or null to clear it.')
    const label = b.label === null ? '' : b.label.trim()
    if (label !== '') {
      const checked =
        label.length > TYPED_MAX
          ? { available: false, reason: 'shape' }
          : await siteLabelCheck({ pool, config, label })
      if (!checked.available && checked.reason === 'taken')
        return refuse(c, 409, 'LABEL_TAKEN', 'Choose another name: a site already uses this one.')
      if (!checked.available)
        return refuse(
          c,
          400,
          'INVALID_LABEL',
          `Use ${SITE_LABEL_MIN} to ${SITE_LABEL_MAX} lowercase letters, digits and hyphens, starting and ending with a letter or digit.`,
          { reason: checked.reason }
        )
    }
    const { rows } = await pool.query(
      'update wo_opportunity set site_label = $3, updated_at = now() where id = $1 and account_id = $2 returning site_label',
      [found.opp.id, found.who.accountId, label || null]
    )
    if (!rows[0]) return notFound(c, 'opportunity')
    return json(c, { label: rows[0].site_label ?? null })
  })
}
