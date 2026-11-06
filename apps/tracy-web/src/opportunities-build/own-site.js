/**
 * BUILD FROM MY BUSINESS — Add site's one-press start (23/10/2026: "just one prompt to build your website
 * that makes you wow"; plan `tasks/plan-own-site-one-prompt.md`).
 *
 * WHAT. A customer finds their own business by name and city (Google Places, any trade) or pastes its links (its
 * Google Maps link, website, social pages, listing pages: one business, `link-fields.js` of Website Opportunities). Tracy saves it as a private opportunity of their account marked `ownSite`, researches it with
 * the same shared research Website Opportunities runs. Once the research is done the page shows the template Tracy
 * suggests for the business's trade (`autoTemplate`) and the customer keeps it or picks another — the person
 * chooses the CMS and the template, Tracy only suggests (24/10/2026, "combined"). That press accepts one
 * ordinary `agent-demo/1` + `client-send/1` action with `ownSite: true`; the site and its chat are claimed for the
 * customer, and the browser sends the one brief the site's own agent builds the whole site from (`client-demo.js`,
 * `tracy_demo`).
 *
 * 🔒 IT IS THE CUSTOMER'S SITE, NOT A DEMO. No retention clock (`demo-retention.js` `startDemoClock`), not listed
 * among Website Opportunities (`store.js` `stagedSql`), no outreach, a brief that says "website", never "demo".
 *
 * 🔒 ITS OWN SWITCH. `site-from-business` (`ui-switches/catalogue.json`, default off) opens these doors and the
 * chat doors of an `ownSite` action, whatever the Website Opportunities switch says. Tracy pays the research and
 * the model: the research caps of `/ops/wo` and `ownSiteBuildsPerAccountPerDay` bound it.
 *
 *   GET  /api/sites/from-business/find?q=       → {candidates}: Google places by name and city, any trade
 *   POST /api/sites/from-business               → 202 {business, links?}: {requestId, place | links | url, name?, label?}
 *   GET  /api/sites/from-business/:id           → {business}: research, then `choose` with Tracy's pick, then build
 *   POST /api/sites/from-business/:id/build     → 202 {business}: {selection: {cms, design, quickstart} | {auto}}
 */
import { json, requireViewer } from '../lib/http.js'
import { overLimitOrClosed } from '../lib/rate.js'
import { tradeOfWords } from '../lib/wo-revision-choice.js'
import { uiSwitchOn } from '../lib/ui-setting.js'
import { AGENT_DEMO } from './agent-demo.js'
import { CLIENT_DEMO } from './client-demo.js'
import { demoActionOf, recommendTemplate } from './demo-actions.js'
import { freezeDemoResearchInput } from './revisions.js'
import { bestKnownName } from 'website-opportunities/src/business-name.js'
import { resumeJob, sourcesOf } from 'website-opportunities/src/store.js'

/**
 * How many times a business's research that paused (a source's time or page budget ran out, its cursor kept) is
 * resumed by itself. A customer has no Resume button here (Website Opportunities has one): measured 24/10/2026, a
 * shop's crawl paused on its budget and the page said "researching" for ever.
 */
const OWN_SITE_RESUMES = 3

export const OWN_SITE_SWITCH = 'site-from-business'
const BASE = '/api/sites/from-business'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/
/** Name searches a customer may run an hour: each is one billable Google Places Text Search. */
const FINDS_PER_HOUR = 30
const FIND_MAX = 8
const RESEARCH_RUNNING = new Set(['queued', 'running'])

/** An `ownSite` action of this account: what its chat doors serve when only this switch is on. */
export async function isOwnSiteAction(pool, accountId, actionId) {
  if (!accountId || !UUID.test(String(actionId ?? ''))) return false
  const { rows } = await pool.query(
    `select 1 from wo_demo_action where account_id = $1 and id = $2 and selection->>'ownSite' = 'true'`,
    [accountId, actionId]
  )
  return rows.length > 0
}

/** A suggested template as the Design templates picker reads it (`@tracy/core/template-picker`). */
const suggestionOf = (t) => ({
  cms: t.platform,
  design: t.design,
  quickstart: t.quickstart,
  label: t.label ?? null,
  reason: t.reason
})

/** The switch, read per request; unreadable is off. */
export const ownSiteOn = (pool) => uiSwitchOn(pool, OWN_SITE_SWITCH).catch(() => false)

/** The candidate a find answered, as `candidateFields` keeps it, plus the trade the server computed. */
function placeOf(raw, candidateFields) {
  const fields = raw && typeof raw === 'object' ? candidateFields(raw) : null
  if (!fields || fields.provider !== 'google-places') return null
  const trade = typeof raw.trade === 'string' && /^[a-z]{2,20}$/.test(raw.trade) ? raw.trade : 'other'
  return { ...fields, candidate: { ...fields.candidate, trade } }
}

/**
 * The doors, on the Website Opportunities app (they share its stores and its research).
 * @param {import('hono').Hono} app
 * @param {any} h - the Website Opportunities routes' own helpers
 */
export function ownSiteRoutes(app, h) {
  const { pool, config, now } = h
  const refuse = (c, status, code, next, extra = {}) => json(c, { code, next, ...extra }, status)
  const off = (c) => refuse(c, 404, 'FEATURE_OFF', 'Build from my business is turned off on this deployment.')
  async function who(c) {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    return { email, accountId: (await h.ensureAccount(pool, email)).id }
  }

  app.get(`${BASE}/find`, async (c) => {
    const me = await who(c)
    if (me instanceof Response) return me
    if (!(await ownSiteOn(pool))) return off(c)
    const q = String(c.req.query('q') ?? '').trim()
    if (q.length < 2 || q.length > 200)
      return refuse(c, 400, 'INVALID_SEARCH', 'Type the business name and its city, 2–200 characters.')
    const domain = await h.domainOr(c)
    if (domain instanceof Response) return domain
    const { keys } = await h.runtime()
    if (!keys.google)
      return refuse(
        c,
        503,
        'CREDENTIAL_MISSING',
        'Search is not set up here: paste the website or Maps link.'
      )
    if (await overLimitOrClosed(pool, `own:find:${me.accountId}`, FINDS_PER_HOUR, now()))
      return refuse(c, 429, 'RATE_LIMITED', 'Wait for the next hour before searching again.')
    try {
      const found = await domain.searchNamedPlaces(
        { query: q, limit: FIND_MAX, anyKind: true },
        { ...h.domainDeps(), googleKey: keys.google }
      )
      return json(c, { candidates: found.candidates.slice(0, FIND_MAX) })
    } catch (error) {
      return refuse(
        c,
        502,
        error?.code ?? 'SEARCH_FAILED',
        'Search did not answer: try again, or paste a link.'
      )
    }
  })

  app.post(BASE, async (c) => {
    const me = await who(c)
    if (me instanceof Response) return me
    if (!(await ownSiteOn(pool))) return off(c)
    const domain = await h.domainOr(c)
    if (domain instanceof Response) return domain
    const b = await h.body(c)
    if (!REQUEST_ID.test(String(b?.requestId ?? '')))
      return refuse(
        c,
        400,
        'INVALID_REQUEST_ID',
        'Send a requestId of 8–100 letters, digits, ".", "_", ":" or "-".'
      )
    if (b.label !== undefined && (typeof b.label !== 'string' || b.label.length > 63))
      return refuse(c, 400, 'INVALID_LABEL', 'Send the site name as "label", or leave it out.')
    let fields = null
    let made = null
    // Its links (`links`, or the old one `url`), with the place picked when its Google link matched several.
    const asked =
      typeof b.url === 'string' && !b.url.trim() && b.links === undefined ? null : h.linkRequestOf(b)
    if (asked?.error) return refuse(c, asked.error.status, asked.error.code, asked.error.next)
    if (asked) {
      made = await h.linkFields(domain, asked)
      if (made.refusal) {
        const { status, code, next, extra } = made.refusal
        return refuse(c, status, code, next, extra)
      }
      const trade = made.fields.candidate.trade ?? 'other'
      fields = { ...made.fields, candidate: { ...made.fields.candidate, trade } }
    } else if (b.place) {
      fields = placeOf(b.place, h.candidateFields)
      if (!fields)
        return refuse(c, 400, 'INVALID_PLACE', 'Pick a business exactly as the search answered it.')
    } else
      return refuse(
        c,
        400,
        'INVALID_BUSINESS',
        'Send {"place": …} from the search, or {"links": ["https://…", …]}.'
      )
    const own = {
      requestId: b.requestId,
      ...(b.label?.trim() ? { label: b.label.trim() } : {}),
      at: new Date(now()).toISOString()
    }
    const { row } = await h.insertOpportunity(pool, me.accountId, {
      ...fields,
      candidate: { ...fields.candidate, ownSite: own }
    })
    if (made) await h.saveListingSource(pool, row.id, made.listings)
    // The customer's own business, saved before (as theirs or as an opportunity): now theirs, this press.
    const opp =
      row.candidate?.ownSite?.requestId === b.requestId
        ? row
        : (
            await pool.query(
              `update wo_opportunity set candidate = candidate || jsonb_build_object('ownSite', $3::jsonb,
                 'trade', coalesce(candidate->>'trade', $4)) where id = $1 and account_id = $2 returning *`,
              [row.id, me.accountId, JSON.stringify(own), fields.candidate.trade]
            )
          ).rows[0]
    const started = await h.startResearch({
      accountId: me.accountId,
      opp,
      requestId: `${b.requestId}:research`
    })
    if (started.refusal) return refuse(c, started.refusal.status, started.refusal.code, started.refusal.next)
    return json(
      c,
      { business: await stateOf(me.accountId, opp), ...(made ? { links: made.links } : {}) },
      202
    )
  })

  app.get(`${BASE}/:id`, async (c) => {
    const me = await who(c)
    if (me instanceof Response) return me
    if (!(await ownSiteOn(pool))) return off(c)
    const id = c.req.param('id')
    const opp = UUID.test(id) ? await h.opportunityOf(pool, me.accountId, id) : null
    if (!opp?.candidate?.ownSite)
      return refuse(c, 404, 'NOT_FOUND', 'Reload: this business is gone or is not yours.')
    const domain = await h.domainOr(c)
    if (domain instanceof Response) return domain
    const business = await stateOf(me.accountId, opp, { advance: true, domain })
    // 🔒 The research is done: its photographs are labelled from now, while the person chooses a template, so pressing
    // build finds them labelled (#250). Never awaited: this is the page's poll.
    if (business.phase === 'choose')
      void h.warmPictureLabels?.({ accountId: me.accountId, opportunityId: opp.id })
    return json(c, { business })
  })

  /**
   * The trade of a business saved by its link, once its research says what it is: Google's types when the place
   * was matched, else the schema.org type its own website states. Written on the candidate, which `autoTemplate`
   * reads when the build is accepted.
   */
  async function researchedTrade(accountId, opp, domain) {
    let profile = null
    try {
      profile = (await freezeDemoResearchInput(pool, opp.id, accountId)).profile ?? null
    } catch {
      return 'other'
    }
    const google = profile?.googlePlace ?? null
    const byGoogle = google
      ? domain.tradeOfPlace({ primaryType: google.primaryType, types: google.types })
      : 'other'
    const typed = byGoogle !== 'other' ? byGoogle : domain.tradeOfSchemaType(profile?.businessType)
    // Neither said: its own words — the name first, then what it says about itself (`tradeOfWords`).
    const named = typed !== 'other' ? typed : tradeOfWords(profile?.name ?? opp.name)
    const trade =
      named !== 'other'
        ? named
        : tradeOfWords(profile?.bio, Array.isArray(profile?.cuisine) ? profile.cuisine.join(' ') : null)
    if (trade !== 'other')
      await pool.query(
        `update wo_opportunity set candidate = jsonb_set(candidate, '{trade}', to_jsonb($3::text))
         where id = $1 and account_id = $2`,
        [opp.id, accountId, trade]
      )
    return trade
  }

  app.post(`${BASE}/:id/build`, async (c) => {
    const me = await who(c)
    if (me instanceof Response) return me
    if (!(await ownSiteOn(pool))) return off(c)
    const id = c.req.param('id')
    const opp = UUID.test(id) ? await h.opportunityOf(pool, me.accountId, id) : null
    if (!opp?.candidate?.ownSite)
      return refuse(c, 404, 'NOT_FOUND', 'Reload: this business is gone or is not yours.')
    const b = await h.body(c)
    const selection = b?.selection
    if (
      !selection ||
      (selection.auto !== true &&
        !(
          ['wordpress', 'joomla', 'emdash'].includes(selection.cms) &&
          selection.design &&
          selection.quickstart
        ))
    )
      return refuse(c, 400, 'DEMO_TEMPLATE_REQUIRED', 'Choose a CMS and a template, or keep Tracy’s pick.')
    const state = await stateOf(me.accountId, opp)
    if (state.phase === 'build') return json(c, { business: state })
    if (state.phase !== 'choose')
      return refuse(c, 409, 'RESEARCH_NOT_DONE', 'Wait for Tracy to finish reading the business.', {
        business: state
      })
    const own = opp.candidate.ownSite
    const accepted = await h.acceptActions({
      accountId: me.accountId,
      entries: [
        {
          opportunityId: opp.id,
          requestId: `${own.requestId}:build`,
          selection:
            selection.auto === true
              ? { auto: true }
              : { cms: selection.cms, design: selection.design, quickstart: selection.quickstart },
          workflow: AGENT_DEMO,
          chatMode: CLIENT_DEMO,
          ownSite: true,
          ...(own.label ? { label: own.label } : {})
        }
      ],
      requireSelection: true,
      templates: await h.templateCards(),
      limit: (await h.runtime()).settings.ownSiteBuildsPerAccountPerDay,
      now
    })
    if (accepted.status >= 300) return json(c, accepted.body, accepted.status)
    return json(c, { business: { ...state, phase: 'build', action: accepted.body.actions[0] } }, 202)
  })

  /**
   * Where a business stands: its research, then the template to choose (Tracy's pick suggested, the person
   * confirms or changes it, `POST …/:id/build`), then its one build action. `advance` settles a linked business's
   * trade once its research is done, so the suggestion reads it.
   */
  async function stateOf(accountId, opp, { advance = false, domain = null } = {}) {
    const own = opp.candidate.ownSite
    // The best name known so far, never a pasted link's host while a source already shows the business's name.
    const view = {
      id: opp.id,
      name: bestKnownName(opp, await sourcesOf(pool, opp.id)),
      trade: opp.candidate.trade ?? 'other',
      requestId: own.requestId
    }
    // This press's build, or one still open from an earlier press: a business has one build at a time, and pressing
    // again opens it rather than offering a choice the build door then refuses (DEMO_BUILD_ACTIVE, 24/10/2026).
    const action = (
      await pool.query(
        `select id from wo_demo_action where account_id = $1 and opportunity_id = $2
           and (request_id = $3 or status in ('queued', 'quality-queued-v1'))
         order by (request_id = $3) desc, accepted_at desc limit 1`,
        [accountId, opp.id, `${own.requestId}:build`]
      )
    ).rows[0]
    if (action) return { ...view, phase: 'build', action: await demoActionOf(pool, accountId, action.id) }
    const job = (await h.jobsOfOpportunity(pool, opp.id))[0] ?? null
    if (job?.state === 'paused') {
      const resumes = Number(own.resumes ?? 0)
      if (resumes >= OWN_SITE_RESUMES)
        return {
          ...view,
          phase: 'failed',
          code: job.last_error?.code ?? 'SOURCE_PAUSED',
          job: h.jobShape(job)
        }
      if (advance) {
        await pool.query(
          `update wo_opportunity set candidate = jsonb_set(candidate, '{ownSite,resumes}', to_jsonb($2::int))
           where id = $1`,
          [opp.id, resumes + 1]
        )
        const resumed = await resumeJob(pool, accountId, job.id).catch(() => null)
        return { ...view, phase: 'research', job: h.jobShape(resumed ?? job) }
      }
    }
    if (!job || RESEARCH_RUNNING.has(job.state) || job.state === 'paused')
      return { ...view, phase: 'research', job: job ? h.jobShape(job) : null }
    if (job.state !== 'completed')
      return {
        ...view,
        phase: 'failed',
        code: job.last_error?.code ?? 'RESEARCH_FAILED',
        job: h.jobShape(job)
      }
    if (advance && view.trade === 'other' && domain)
      view.trade = await researchedTrade(accountId, opp, domain)
    const { template, ranking } = await recommendTemplate(pool, {
      accountId,
      opportunityId: opp.id,
      templates: await h.templateCards()
    })
    // `ranking` groups the picker's cards by the business's trade (`templateRanking`); null when the trade is unknown.
    return {
      ...view,
      phase: 'choose',
      recommended: template.status ? null : suggestionOf(template),
      ranking
    }
  }
}
