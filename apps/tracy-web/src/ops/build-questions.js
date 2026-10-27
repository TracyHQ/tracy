/**
 * Which questionnaire a CMS's new sites are asked by default, when the archive they start from
 * brings none of its own.
 *
 * 🔒 THIS DOOR CHOOSES; IT DOES NOT EDIT. Editing a questionnaire happens on the quickstart it
 * belongs to (`ops/quickstarts.js`), where the candidates are — a set, its released siblings, and
 * the one in use. Keeping the editor here as well would be two screens writing the same rows, and
 * the second one would be the one nobody remembers to look at.
 */
import { Hono } from 'hono'

import {
  FEEDS,
  loadStandardQuestions,
  questionChoices,
  readDefaultSource,
  saveDefaultSource
} from '../lib/build-questions.js'
import { readReleases } from '../lib/quickstart-releases.js'
import { admit, denied } from './admit.js'

const PLATFORMS = new Set(['joomla', 'wordpress', 'emdash'])

export function buildQuestionsRoutes({ pool, config, standard = loadStandardQuestions() }) {
  const app = new Hono()
  const endpoint = '/api/ops/build-questions/:platform'

  /** Every questionnaire this CMS could be pointed at: its own set, and the ready releases. */
  const choicesFor = async (platform) => {
    const releases = (await readReleases(pool, { platform, choosable: true })).map((r) => ({
      ...r,
      // The candidate in use for that release is what a site would actually be asked; a release
      // with no questionnaire at all cannot be a default, and `questionChoices` drops it.
      questions: null
    }))
    const withSets = await Promise.all(
      releases.map(async (r) => {
        const { rows } = await pool.query(
          `select s.doc from question_set s
             left join question_choice c on c.owner = s.owner
            where s.owner = $1 order by (c.set_id = s.id) desc nulls last, s.source limit 1`,
          [r.tag]
        )
        const doc = rows[0]?.doc
        return { ...r, questions: typeof doc === 'string' ? JSON.parse(doc) : (doc ?? null) }
      })
    )
    return questionChoices(platform, standard, withSets)
  }

  app.get(endpoint, async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    const platform = c.req.param('platform')
    if (!PLATFORMS.has(platform)) return c.json({ error: 'UNKNOWN_PLATFORM' }, 404)
    c.header('cache-control', 'no-store')
    return c.json({
      ...(await readDefaultSource(pool, platform)),
      writable: ['owner', 'admin'].includes(who.role),
      server: new URL(c.req.url).host,
      options: await choicesFor(platform),
      feeds: [...FEEDS]
    })
  })

  app.put(endpoint, async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    const platform = c.req.param('platform')
    if (!PLATFORMS.has(platform)) return c.json({ error: 'UNKNOWN_PLATFORM' }, 404)
    if (!['owner', 'admin'].includes(who.role)) return c.body(null, 403)
    if (
      c.req.header('origin') !== config.origin ||
      !c.req.header('content-type')?.startsWith('application/json')
    )
      return c.body(null, 403)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.source !== 'string') return c.json({ error: 'INVALID_SOURCE' }, 400)
    const result = await saveDefaultSource(
      pool,
      platform,
      await choicesFor(platform),
      body.source,
      body.revision,
      who.email
    )
    return c.json(result, result.error === 'SOURCE_CHANGED' ? 409 : result.error ? 400 : 200)
  })

  return app
}
