// Every CI door uses the same staff admission as the rest of /ops; GitHub tokens stay here.
import { Hono } from 'hono'
import { admit, denied } from './admit.js'
import { createCiReader, ciScope } from './ci-github.js'
import { DEFAULT_SOURCE_REPOSITORY } from '../lib/source-repository.js'

export function ciRoutes({
  pool,
  config,
  fetchImpl,
  reader = createCiReader({ token: config.ciToken, repo: config.sourceRepo, fetchImpl })
}) {
  const CI_REPO = config.sourceRepo ?? DEFAULT_SOURCE_REPOSITORY
  const app = new Hono()
  async function readStates(email, rows) {
    const result = await pool.query(
      `select r.pr_number, r.read_at from ops_ci_pr_read r
       join account a on a.id = r.account_id
       where a.email = $1 and r.repo = $2 and r.pr_number = any($3::integer[])`,
      [email, CI_REPO, rows.map((row) => row.id)]
    )
    const states = new Map(result.rows.map((row) => [row.pr_number, row.read_at]))
    return rows.map((row) => ({ ...row, unread: !states.get(row.id), readAt: states.get(row.id) ?? null }))
  }
  app.get('/api/ops/ci', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    let scope
    if (c.req.query('range') || c.req.query('branch') || c.req.query('dateField')) {
      try {
        scope = ciScope(c.req.query())
      } catch {
        return c.json({ error: 'Invalid branch or date filters.' }, 400)
      }
    }
    const [data, identities] = await Promise.all([
      reader.list(scope),
      pool.query(`select distinct i.subject, a.display_name, a.email from identity i
        join account a on a.id = i.account_id join seat_workspace sw on sw.account_id = a.id
        join workspace w on w.id = sw.workspace_id
        where i.provider = 'github' and w.kind = 'tracy_admin' and sw.revoked_at is null
        and sw.declined_at is null and sw.accepted_at is not null`)
    ])
    const linked = identities.rows.find((row) => row.email === who.email)
    const members = new Map(
      data.rows.map((row) => [row.authorId, { id: row.authorId, name: row.author, login: row.login }])
    )
    for (const identity of identities.rows)
      if (!members.has(identity.subject))
        members.set(identity.subject, {
          id: identity.subject,
          name: identity.display_name || (identity.email === who.email ? 'You' : 'Linked member'),
          login: null
        })
    return c.json({
      ...data,
      rows: await readStates(who.email, data.rows),
      repo: CI_REPO,
      readAccount: who.email,
      members: [...members.values()],
      viewer: { authorId: linked?.subject ?? null, linked: Boolean(linked) }
    })
  })
  app.put('/api/ops/ci/read', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    if (c.req.header('origin') !== config.origin) return c.body(null, 403)
    c.header('cache-control', 'no-store')
    const body = await c.req.json().catch(() => null)
    if (
      !body ||
      typeof body.read !== 'boolean' ||
      !Array.isArray(body.numbers) ||
      !body.numbers.length ||
      body.numbers.length > 1000 ||
      body.numbers.some((number) => !Number.isSafeInteger(number) || number < 1 || number > 2147483647) ||
      Object.keys(body).some((key) => !['read', 'numbers'].includes(key))
    )
      return c.json({ error: 'Invalid PR read state.' }, 400)
    const result = await pool.query(
      `insert into ops_ci_pr_read(account_id, repo, pr_number, read_at)
       select a.id, $2, n, case when $4::boolean then now() else null end
       from account a cross join unnest($3::integer[]) n where a.email = $1
       on conflict(account_id, repo, pr_number) do update set read_at = excluded.read_at
       returning pr_number, read_at`,
      [who.email, CI_REPO, [...new Set(body.numbers)], body.read]
    )
    return c.json({
      readAccount: who.email,
      states: result.rows.map((row) => ({ id: row.pr_number, unread: !row.read_at, readAt: row.read_at }))
    })
  })
  app.get('/api/ops/ci/:number', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    const number = Number(c.req.param('number'))
    if (!/^\d+$/.test(c.req.param('number')) || !Number.isSafeInteger(number) || number < 1)
      return c.json({ error: 'Invalid PR number.' }, 400)
    try {
      const row = await reader.detail(number)
      return row
        ? c.json({ row: (await readStates(who.email, [row]))[0], measuredAt: new Date().toISOString() })
        : c.json({ error: 'PR not found.' }, 404)
    } catch {
      return c.json(
        { error: 'Could not refresh PR details from GitHub. Check GitHub access or try again later.' },
        503
      )
    }
  })
  return app
}
