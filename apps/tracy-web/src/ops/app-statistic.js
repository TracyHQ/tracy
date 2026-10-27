/** Staff-only, read-only statistics of desktop download requests and observed installs. */
import { Hono } from 'hono'
import { listStatistics, statisticDetail, statisticQuery } from '../lib/app-statistic.js'
import { admit, denied } from './admit.js'

export function appStatisticRoutes({ pool, config, now = Date.now }) {
  const app = new Hono()
  app.use('/api/ops/app-statistic/*', async (c, next) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    await next()
  })
  app.get('/api/ops/app-statistic', async (c) => {
    const at = now()
    let query
    try {
      query = statisticQuery(c.req.query(), at)
    } catch (error) {
      return c.json({ code: 'INVALID_FILTER', field: error.message }, 400)
    }
    return c.json(await listStatistics(pool, query, at))
  })
  app.get('/api/ops/app-statistic/:view/:id', async (c) => {
    const detail = await statisticDetail(pool, c.req.param('view'), c.req.param('id'), now())
    return detail ? c.json(detail) : c.json({ code: 'NOT_FOUND' }, 404)
  })
  return app
}
