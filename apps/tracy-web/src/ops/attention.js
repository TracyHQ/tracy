/**
 * `/api/ops/attention*` — the Admin attention page's two doors (tasks/todo-admin-attention.md).
 *
 *   - `GET /api/ops/attention` — the whole report: every quickstart and demo with something for an
 *     administrator to do, worst first, and `count` for the rail's badge.
 *   - `GET /api/ops/attention/questionnaire?tag=` — why the questionnaire in use does not fit one
 *     quickstart. Asked when a row is opened (decision #10), never for the whole list: it reads the
 *     release's contract files, and doing that for ninety releases on every page load buys nothing.
 *
 * 🔒 READ PER REQUEST, NEVER CACHED (decision #1). An administrator who has just fixed a thing must
 * see it gone on the next load; every input is a local query or a local file.
 *
 * 🔒 NO PROSE IN THE ANSWER. Codes and values only (`lib/admin-attention.js` says why); the screen
 * words them.
 *
 * MODULE-GRAPH BOUNDARY: imports only `lib/` and `./admit.js`, like every door under `ops/`.
 */
import { Hono } from 'hono'

import { questionnaireAnalysis, attentionReport } from '../lib/admin-attention.js'
import { loadStandardQuestions } from '../lib/build-questions.js'
import { contractFor, defaultContracts } from '../lib/contracts.js'
import { demoSitesByTag, liveDemosByTag } from '../lib/demo-sites.js'
import { candidatesFor, questionsInUse } from '../lib/question-sets.js'
import { readCapabilities } from '../lib/quickstart-capabilities.js'
import { cardIdOf, platformOfTag, readReleases } from '../lib/quickstart-releases.js'
import { shotFilesFor } from '../lib/template-shots.js'
import { admit, denied } from './admit.js'

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config
 * @param {Record<string, any>} [deps.standard] the CMS default sets, by platform
 */
export function attentionRoutes({ pool, config, standard = loadStandardQuestions() }) {
  const app = new Hono()

  const guard = async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    return { who }
  }

  app.get('/api/ops/attention', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const releases = await readReleases(pool)
    const [demos, live, held, { inUse }] = await Promise.all([
      demoSitesByTag(pool),
      liveDemosByTag(pool),
      shotFilesFor(
        pool,
        releases.map((r) => cardIdOf(r)).filter((id) => id !== null)
      ),
      questionsInUse(pool)
    ])
    const report = attentionReport({
      releases,
      demos,
      live,
      held,
      contracts: defaultContracts(),
      questions: inUse
    })
    return c.json({ readAt: releases[0]?.fetchedAt ?? null, ...report })
  })

  app.get('/api/ops/attention/questionnaire', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const tag = c.req.query('tag') ?? ''
    const [release] = (await readReleases(pool)).filter((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    if (!release.setting) return c.json({ error: 'NO_SETTING' }, 404)
    const platform = release.platform ?? platformOfTag(release.tag)
    const standardDoc = platform ? (standard[platform] ?? null) : null
    const { inUse } = await candidatesFor(pool, tag, standardDoc)
    // The release's capability reader, called directly so a read writes nothing.
    const snapshot = readCapabilities({
      release,
      standardDoc
    })
    const version = release.setting.version
    const analysis = questionnaireAnalysis({
      platform,
      snapshot,
      set: inUse,
      hasContract: contractFor(defaultContracts(), tag, version) !== null
    })
    return c.json({
      tag,
      platform,
      version,
      ...analysis,
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  return app
}
