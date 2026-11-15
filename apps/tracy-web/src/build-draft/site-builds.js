/**
 * The builds a site holds (#612, migration 220): the store a step chain run built from a build draft is given as
 * `deps.builds` (`docs/references/draft-revision-run.md`, "What the caller passes"). One store answers every site;
 * each call names its site by `ctx.siteKey`, the run's own site.
 *
 *   read(ref, ctx)                  the build result kept under `ref`, or null (unknown, or forgotten)
 *   keep(build, ctx, {expected})    COMPARE AND SET: stores `build` and makes its ref the build the site holds, only
 *                                   while the site holds `expected` (null for a first build); false, nothing stored,
 *                                   otherwise. Keeping a ref again (a restore keeps the earlier build) replaces it.
 *   current(ctx)                    the ref of the build the site holds, null for a blank site
 *   begin({runId, from}, ctx)       marks the site's one unfinished revision run; false when another run is marked,
 *                                   true for the same run id (a resume)
 *   unfinished(ctx)                 that mark `{runId, from, at}`, or null
 *   end(runId, ctx)                 clears the mark of that run
 *   forget(ref, ctx, {reason})      drops the build's content; its ref and the reason stay
 *   reset(siteKey)                  the site is blank again: it holds no build and no run is unfinished; the builds
 *                                   stay (not a contract door: the caller's, when it restores a blank site)
 *   history(siteKey)                every build of the site, newest first: `{ref, previous, keptAt, forgotten}`
 *
 * 🔒 ONE ROW PER SITE IS THE LOCK. `keep` and `begin` read the site's head row `for update` in one transaction, so two
 * runs that keep at once are told apart: the second sees the first's ref and answers false.
 *
 * 🔒 A SITE MADE AGAIN STARTS BLANK. The head remembers when the site row it belongs to was created; a site deleted and
 * made again under the same key reads as holding no build, and the builds of the earlier site are not read.
 *
 * 🔒 NOTHING IS DELETED. Every earlier build stays restorable; a forgotten one keeps its ref and the reason only.
 */

const SITE_CREATED = '(select created_at from site where site_key = $1)'

function siteOf(ctx) {
  const key = ctx?.siteKey
  if (typeof key !== 'string' || key.trim() === '')
    throw Object.assign(new Error('a build store call names its site (ctx.siteKey)'), {
      code: 'site_key_missing'
    })
  return key
}

/** The head of the site as it stands for the site row that exists now (`same` false: a site made again). */
async function headOf(client, siteKey, { lock = false } = {}) {
  if (lock)
    await client.query(
      `insert into site_draft_build_head (site_key, site_created_at) values ($1, ${SITE_CREATED})
         on conflict (site_key) do nothing`,
      [siteKey]
    )
  const { rows } = await client.query(
    `select h.current_ref, h.unfinished, h.site_created_at is not distinct from s.created_at as same
       from site_draft_build_head h left join site s on s.site_key = h.site_key
      where h.site_key = $1 ${lock ? 'for update of h' : ''}`,
    [siteKey]
  )
  const row = rows[0]
  if (!row) return { current: null, unfinished: null }
  if (!row.same) {
    if (lock)
      await client.query(
        `update site_draft_build_head set current_ref = null, unfinished = null, site_created_at = ${SITE_CREATED},
           updated_at = now() where site_key = $1`,
        [siteKey]
      )
    return { current: null, unfinished: null }
  }
  return { current: row.current_ref ?? null, unfinished: row.unfinished ?? null }
}

/** Run `work(client, head)` in one transaction holding the site's head row. */
async function withHead(pool, siteKey, work) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const head = await headOf(client, siteKey, { lock: true })
    const answer = await work(client, head)
    await client.query('commit')
    return answer
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The build store over Postgres.
 * @param {import('pg').Pool} pool
 * @param {{now?: () => number}} [options]
 */
export function siteBuildStore(pool, { now = Date.now } = {}) {
  return {
    async read(ref, ctx) {
      if (typeof ref !== 'string' || ref === '') return null
      const siteKey = siteOf(ctx)
      const { rows } = await pool.query(
        `select b.build from site_draft_build b left join site s on s.site_key = b.site_key
          where b.site_key = $1 and b.ref = $2 and (s.created_at is null or b.kept_at >= s.created_at)`,
        [siteKey, ref]
      )
      return rows[0]?.build ?? null
    },

    keep(build, ctx, { expected } = {}) {
      const siteKey = siteOf(ctx)
      if (typeof build?.ref !== 'string' || build.ref === '')
        throw Object.assign(new Error('a kept build names its ref'), { code: 'build_ref_missing' })
      return withHead(pool, siteKey, async (client, head) => {
        if (expected !== undefined && head.current !== (expected ?? null)) return false
        await client.query(
          `insert into site_draft_build (site_key, ref, build, previous) values ($1, $2, $3::json, $4)
             on conflict (site_key, ref) do update set build = excluded.build, previous = excluded.previous,
               forgotten_reason = null, forgotten_at = null, kept_at = now()`,
          [siteKey, build.ref, JSON.stringify(build), build.previous ?? null]
        )
        await client.query(
          'update site_draft_build_head set current_ref = $2, updated_at = now() where site_key = $1',
          [siteKey, build.ref]
        )
        return true
      })
    },

    async current(ctx) {
      return (await headOf(pool, siteOf(ctx))).current
    },

    begin(run, ctx) {
      const siteKey = siteOf(ctx)
      const runId = run?.runId ?? null
      return withHead(pool, siteKey, async (client, head) => {
        if (head.unfinished && head.unfinished.runId !== runId) return false
        if (head.unfinished) return true
        const mark = { runId, from: run?.from ?? null, at: new Date(now()).toISOString() }
        await client.query(
          'update site_draft_build_head set unfinished = $2::jsonb, updated_at = now() where site_key = $1',
          [siteKey, JSON.stringify(mark)]
        )
        return true
      })
    },

    async unfinished(ctx) {
      return (await headOf(pool, siteOf(ctx))).unfinished
    },

    async end(runId, ctx) {
      await pool.query(
        `update site_draft_build_head set unfinished = null, updated_at = now()
          where site_key = $1 and unfinished ->> 'runId' = $2`,
        [siteOf(ctx), String(runId)]
      )
    },

    async forget(ref, ctx, { reason = null } = {}) {
      await pool.query(
        `update site_draft_build set build = null, forgotten_reason = $3, forgotten_at = now()
          where site_key = $1 and ref = $2`,
        [siteOf(ctx), ref, reason === null ? 'forgotten' : String(reason).slice(0, 80)]
      )
    },

    async reset(siteKey) {
      await withHead(pool, siteOf({ siteKey }), (client) =>
        client.query(
          `update site_draft_build_head set current_ref = null, unfinished = null, updated_at = now()
            where site_key = $1`,
          [siteKey]
        )
      )
    },

    async history(siteKey) {
      const { rows } = await pool.query(
        `select b.ref, b.previous, b.kept_at, b.forgotten_reason from site_draft_build b
           left join site s on s.site_key = b.site_key
          where b.site_key = $1 and (s.created_at is null or b.kept_at >= s.created_at)
          order by b.kept_at desc, b.ref`,
        [siteOf({ siteKey })]
      )
      return rows.map((r) => ({
        ref: r.ref,
        previous: r.previous,
        keptAt: r.kept_at.toISOString(),
        forgotten: r.forgotten_reason ?? null
      }))
    }
  }
}
