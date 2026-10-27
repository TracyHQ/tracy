/**
 * The manual builder: "Build demo" writes the site brief to a file the person downloads and gives to whoever builds
 * the site; then they record that a demo was built elsewhere, with its link. Nothing is built here and no other
 * service is called. Files live in the host's object store under `wo-manual/<account>/<opportunity>/`.
 *
 * Doors (under /api/website-opportunities):
 *   POST   /:id/manual/brief     make the brief from the current research and keep it   → {brief, markdown, madeAt}
 *   GET    /:id/manual/brief.md  download the kept brief as Markdown
 *   PUT    /:id/manual/built     record the demo built elsewhere: {"url": "https://…", "note"?: "…"}
 *   DELETE /:id/manual/built     forget that record
 */
import { briefResearchOf, makeSiteBrief, opportunityOf as briefOpportunityOf } from '../../brief-research.js'
import { renderBriefWithReviews } from '../../review-sources.js'
import { opportunityOf } from '../../store.js'
import { defineBuilder } from '../builders.js'

const BASE = '/api/website-opportunities'
const NOTE_MAX = 500
const URL_MAX = 2000

const keyOf = (accountId, opportunityId, name) => `wo-manual/${accountId}/${opportunityId}/${name}`

/** A link the person typed: http(s) only, no credentials in it. */
function builtUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > URL_MAX) return null
  try {
    const u = new URL(value.trim())
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? u.href : null
  } catch {
    return null
  }
}

/**
 * @param {{ pool: { query: Function }, objects: { put: Function, get: Function, delete?: Function } | null,
 *   now?: () => number }} deps
 */
export default function createManualBuilder({ pool, objects, now = Date.now }) {
  const readText = async (key) => {
    const res = objects ? await objects.get(key).catch(() => null) : null
    return res?.ok ? res.text() : null
  }
  const putText = (key, text, type) =>
    objects ? objects.put(key, new TextEncoder().encode(text), type) : false
  const recordOf = async (accountId, id) => {
    const text = await readText(keyOf(accountId, id, 'built.json'))
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  /** Built-elsewhere records of the account's own opportunities among `ids`. */
  async function recordsOf(accountId, ids) {
    if (!accountId || !ids.length) return new Map()
    const { rows } = await pool.query(
      'select id from wo_opportunity where account_id = $1 and id = any($2::uuid[])',
      [accountId, ids]
    )
    const pairs = await Promise.all(rows.map(async (r) => [r.id, await recordOf(accountId, r.id)]))
    return new Map(pairs.filter(([, record]) => record))
  }
  const demoOf = (record) => ({
    builtElsewhere: true,
    url: record.url,
    note: record.note ?? null,
    recordedAt: record.recordedAt
  })

  function routes(app, ctx) {
    const { caller, refuse, notFound, featureOn, featureOff, domainOr, body, UUID } = ctx
    /** The caller's opportunity of `:id`, or a Response. */
    async function own(c, { create = false } = {}) {
      const who = await caller(c, { create })
      if (who instanceof Response) return who
      if (!(await featureOn())) return featureOff(c)
      const id = c.req.param('id')
      const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
      return opp ? { who, opp } : notFound(c, 'opportunity')
    }
    const noStore = (c) =>
      refuse(c, 503, 'STORE_UNAVAILABLE', 'This server has no file store: set one up to keep briefs.')

    app.post(`${BASE}/:id/manual/brief`, async (c) => {
      const mine = await own(c, { create: true })
      if (mine instanceof Response) return mine
      if (!objects) return noStore(c)
      const domain = await domainOr(c)
      if (domain instanceof Response) return domain
      const { read } = await briefResearchOf(pool, mine.opp)
      const madeAt = new Date(now()).toISOString()
      const brief = makeSiteBrief(domain, read, { opportunity: briefOpportunityOf(mine.opp), madeAt })
      const checked = domain.validateBrief(brief)
      if (!checked?.ok)
        return refuse(c, 422, 'BRIEF_INVALID', 'Research this place further, then make the brief again.', {
          errors: checked?.errors ?? []
        })
      const markdown = renderBriefWithReviews(domain, brief)
      const at = (name) => keyOf(mine.who.accountId, mine.opp.id, name)
      const kept =
        (await putText(at('brief.json'), JSON.stringify(brief), 'application/json')) &&
        (await putText(at('brief.md'), markdown, 'text/markdown; charset=utf-8'))
      if (!kept) return refuse(c, 502, 'STORE_WRITE_FAILED', 'Try again: the file store did not answer.')
      return c.json({ brief, markdown, madeAt })
    })

    app.get(`${BASE}/:id/manual/brief.md`, async (c) => {
      const mine = await own(c)
      if (mine instanceof Response) return mine
      const markdown = await readText(keyOf(mine.who.accountId, mine.opp.id, 'brief.md'))
      if (markdown === null) return refuse(c, 404, 'BRIEF_MISSING', 'Make the brief first: press Build demo.')
      const name =
        String(mine.opp.name ?? 'brief')
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60) || 'brief'
      return new Response(markdown, {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': `attachment; filename="brief.md"; filename*=UTF-8''${encodeURIComponent(name)}-brief.md`,
          'cache-control': 'private, no-store'
        }
      })
    })

    app.put(`${BASE}/:id/manual/built`, async (c) => {
      const mine = await own(c, { create: true })
      if (mine instanceof Response) return mine
      if (!objects) return noStore(c)
      const sent = await body(c)
      const url = builtUrl(sent?.url)
      if (!url)
        return refuse(
          c,
          422,
          'INVALID_URL',
          'Send {"url": "https://…"}, the address of the demo that was built.'
        )
      if (sent.note !== undefined && (typeof sent.note !== 'string' || sent.note.length > NOTE_MAX))
        return refuse(c, 422, 'INVALID_NOTE', `A note is text of up to ${NOTE_MAX} characters.`)
      const record = { url, note: sent.note?.trim() || null, recordedAt: new Date(now()).toISOString() }
      if (
        !(await putText(
          keyOf(mine.who.accountId, mine.opp.id, 'built.json'),
          JSON.stringify(record),
          'application/json'
        ))
      )
        return refuse(c, 502, 'STORE_WRITE_FAILED', 'Try again: the file store did not answer.')
      return c.json({ demo: demoOf(record) })
    })

    app.delete(`${BASE}/:id/manual/built`, async (c) => {
      const mine = await own(c)
      if (mine instanceof Response) return mine
      if (!objects) return noStore(c)
      await objects.delete?.(keyOf(mine.who.accountId, mine.opp.id, 'built.json'))
      return c.json({ demo: null })
    })
  }

  return defineBuilder({
    id: 'manual',
    routes,
    settingsOf: async () => ({ builder: 'manual' }),
    saveSettings: async () => ({
      status: 404,
      body: { code: 'NO_SETTINGS', next: 'The manual builder has nothing to set.' }
    }),
    templateChoicesOf: async () => ({}),
    async listedDemoOf(accountId, ids) {
      return new Map(
        [...(await recordsOf(accountId, ids))].map(([id, record]) => [id, { demo: demoOf(record) }])
      )
    },
    async detailOf(opp, accountId) {
      const record = await recordOf(accountId, opp.id)
      return { demo: record ? demoOf(record) : null }
    },
    async demoFactsOf(accountId, ids) {
      const records = await recordsOf(accountId, ids)
      return new Map(
        [...records.keys()].map((id) => [id, { built: true, liveSiteKey: null, queuedActionId: null }])
      )
    },
    // The record lives in the file store, not in SQL: the stage stays the research's.
    demoJourneySql: null
  })
}
