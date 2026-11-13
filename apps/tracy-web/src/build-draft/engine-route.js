/**
 * The engine doors of the build chat (#609): what the dsh tool `tracy_build` calls before a site exists
 * (`packages/ui/tracy-build-chat/src/host/doors.ts` is the contract). Research and compose run in the background
 * (`engine.js`): their door answers `running` at once, and `GET /engine` reads the state again.
 *
 * WHO ASKS. The tool calls as the person who typed: `x-tracy-actor` (dsh's short-lived signed assertion,
 * `lib/actor.js`) and `x-tracy-session`, which must be that person's build session (`buildSessionIdOf`). A signed-in
 * browser (`tracy_sess`) is the same person, as on the other build draft doors. Each door touches only that account's
 * draft. 403 when the session is not the person's build session or the build chat is switched off; 409 when the
 * draft is not ready for the step or moved on; 422 `{problems}` the owner can read.
 */
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { PLAN_EDIT_SCHEMA } from 'website-opportunities/domain'
import { json } from '../lib/http.js'
import { principalOf } from '../lib/wo-principal.js'
import { engineStateOf } from './engine-state.js'
import { putEndedStep, readEngineRow } from './engine-store.js'
import { createDraft, editPlan } from './store.js'
import { readEngineRequest } from './engine-request.js'
import { callerOf } from './caller.js'

const BASE = '/api/build-draft'

const REFUSALS = {
  NOT_SIGNED_IN: [401, 'Call as the person who typed (x-tracy-actor) or with a session.'],
  NOT_BUILD_SESSION: [403, 'x-tracy-session must be the caller’s own build session.'],
  BUILD_CHAT_OFF: [403, 'The build chat is switched off on this server.'],
  INVALID_REQUEST: [400, 'Send the JSON body this door reads.'],
  NO_DRAFT: [409, 'Research the business first: POST /api/build-draft/research.'],
  NO_RESEARCH: [409, 'Research the business first: POST /api/build-draft/research.'],
  NO_TEMPLATE: [409, 'Choose a template first: PUT /api/build-draft/template.'],
  NO_KIT: [409, 'The chosen template has no AI quickstart kit on this server.'],
  NO_PLAN: [409, 'The draft has no plan yet: POST /api/build-draft/compose.'],
  STALE_EDIT: [409, 'The plan changed meanwhile: read GET /api/build-draft/engine and edit again.'],
  INVALID_EDIT: [422, 'The change does not fit the plan.']
}
const refuse = (c, code, extra = {}) => {
  const [status, next] = REFUSALS[code]
  return json(c, { code, next, ...extra }, status)
}
/** Owner readable problems: the sentences of the gate, never its paths or codes. */
const sentencesOf = (problems) =>
  (Array.isArray(problems) ? problems : [])
    .map((p) => (typeof p === 'string' ? p : p?.message))
    .filter(Boolean)

/**
 * @param {object} deps
 * @param {{sessionSecret: string, actorSecret?: string}} deps.config
 * @param {import('pg').Pool} deps.pool
 * @param {(pool: import('pg').Pool, email: string) => Promise<{id: string}>} deps.ensureAccount
 * @param {{loadKit: Function, templatesFor: Function}} deps.kits the AI quickstart catalogue (`ai-quickstarts.js`)
 * @param {ReturnType<import('./engine.js').createEngine>} deps.engine
 * @param {(email: string) => Promise<string>} deps.buildSessionIdOf the person's build session id (`workspace/`)
 * @param {() => Promise<boolean>} deps.buildChatOn the operator's `chat-build` switch
 */
export function buildEngineRoutes({
  config,
  pool,
  ensureAccount,
  kits,
  engine,
  buildSessionIdOf,
  buildChatOn
}) {
  const app = new Hono()

  /** The caller's address, or the refusal to answer. */
  async function engineCallerOf(c) {
    const caller = await callerOf(c, { config, buildSessionIdOf })
    if (caller.refusal) return caller
    return (await buildChatOn()) ? caller : { refusal: 'BUILD_CHAT_OFF' }
  }
  /** A door: the caller, their account (created when `create`), then the step. */
  const door =
    (run, { create = false } = {}) =>
    async (c) => {
      const caller = await engineCallerOf(c)
      if (caller.refusal) return refuse(c, caller.refusal)
      const accountId = create
        ? (await ensureAccount(pool, caller.email)).id
        : await principalOf(pool, caller.email)
      return run(c, accountId)
    }
  const answer = (c, result) => (result.error ? refuse(c, result.error) : json(c, result.state))

  app.use(`${BASE}/*`, async (c, next) => {
    c.header('cache-control', 'no-store')
    await next()
  })

  app.post(
    `${BASE}/research`,
    door(
      async (c, accountId) => {
        const body = readEngineRequest('research', await c.req.json().catch(() => null))
        if (!body) return refuse(c, 'INVALID_REQUEST')
        await createDraft(pool, accountId)
        return answer(c, await engine.research(accountId, body, await readEngineRow(pool, accountId)))
      },
      { create: true }
    )
  )

  app.get(
    `${BASE}/templates`,
    door(async (c, accountId) => {
      const row = accountId ? await readEngineRow(pool, accountId) : null
      const trade = row?.research?.trade
      // No researched trade, or no released kit fitting it, is an empty list: never a template made up.
      return json(c, { templates: typeof trade === 'string' ? kits.templatesFor(trade) : [] })
    })
  )

  app.post(
    `${BASE}/compose`,
    door(async (c, accountId) => {
      const body = readEngineRequest('compose', await c.req.json().catch(() => ({})))
      if (!body) return refuse(c, 'INVALID_REQUEST')
      const row = accountId ? await readEngineRow(pool, accountId) : null
      if (!row) return refuse(c, 'NO_DRAFT')
      if (!row.research?.profile) return refuse(c, 'NO_RESEARCH')
      const chosen = row.plan?.look?.template ?? row.template
      if (!chosen) return refuse(c, 'NO_TEMPLATE')
      const kit = kits.loadKit(chosen.slug)
      if (!kit) return refuse(c, 'NO_KIT')
      return answer(c, await engine.compose(accountId, body, row, kit))
    })
  )

  app.post(
    `${BASE}/edit`,
    door(async (c, accountId) => {
      const body = readEngineRequest('edit', await c.req.json().catch(() => null))
      if (!body) return refuse(c, 'INVALID_REQUEST')
      const row = accountId ? await readEngineRow(pool, accountId) : null
      if (!row) return refuse(c, 'NO_DRAFT')
      if (!row.plan) return refuse(c, 'NO_PLAN')
      // The tool sends the changes only: the edit names the plan's current revision here.
      const edit = {
        schema: PLAN_EDIT_SCHEMA,
        id: `edit-${randomUUID()}`,
        plan: { id: row.plan.id, revision: row.plan.revision },
        changes: body.changes
      }
      const edited = await editPlan(pool, accountId, edit, kits)
      if (edited.error === 'INVALID_EDIT')
        return refuse(c, 'INVALID_EDIT', { problems: sentencesOf(edited.problems) })
      if (edited.error) return refuse(c, edited.error)
      await putEndedStep(pool, accountId, { step: 'edit', state: 'done' })
      return json(c, engineStateOf(await readEngineRow(pool, accountId)))
    })
  )

  app.get(
    `${BASE}/engine`,
    door(async (c, accountId) => json(c, accountId ? await engine.read(accountId) : engineStateOf(null)))
  )

  return app
}
