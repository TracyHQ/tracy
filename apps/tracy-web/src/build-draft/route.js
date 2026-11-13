/**
 * The doors of the pre site build draft (#603, `store.js`): the chat that builds a site before the site exists keeps
 * the owner's answers, the chosen template and the living plan here. Each door reads the signed-in person and touches
 * only that account's draft. Reads never create an account; starting a draft creates one when the email has none yet,
 * as `seen-hints/route.js` does. The app's global csrfGuard enforces the same-origin JSON write policy.
 */
import { Hono } from 'hono'
import { ensureAccount } from '../seats/store.js'
import { json, requireViewer } from '../lib/http.js'
import { principalOf } from '../lib/wo-principal.js'
import {
  chooseTemplate,
  createDraft,
  editPlan,
  putPlan,
  readDraft,
  saveAnswer,
  undoPlanEdit
} from './store.js'

const BASE = '/api/build-draft'

/** Each refusal: its status and the sentence that says what to do next. */
const REFUSALS = {
  NO_DRAFT: [404, 'Start a draft first: POST /api/build-draft.'],
  NO_PLAN: [409, 'The draft has no plan yet: put one with PUT /api/build-draft/plan.'],
  INVALID_REQUEST: [400, 'Send the JSON body this door reads.'],
  INVALID_TEMPLATE: [400, 'Send "template" as {slug, name, version}.'],
  INVALID_ANSWER: [422, 'The answer does not fit its question.'],
  INVALID_PLAN: [422, 'The plan does not pass the Contract B check.'],
  INVALID_EDIT: [422, 'The edit does not fit the plan.'],
  STALE_EDIT: [
    409,
    'The plan changed since this edit was made: read the draft again and edit its current revision.'
  ],
  STALE_PLAN: [409, 'The draft already holds this plan at the same or a later revision.'],
  PLAN_EXISTS: [409, 'The draft has a plan: change its look.template with a plan edit.'],
  NOTHING_TO_UNDO: [409, 'There is no plan edit to undo.']
}

/** @param {{config: {sessionSecret: string}, pool: import('pg').Pool}} deps */
export function buildDraftRoutes({ config, pool }) {
  const app = new Hono()
  const answer = (c, result, okStatus = 200) => {
    if (!result.error) return json(c, { draft: result.draft }, okStatus)
    const [status, next] = REFUSALS[result.error]
    const { error: code, ...extra } = result
    return json(c, { code, next, ...extra }, status)
  }
  /** The account of the signed-in person (created when `create`), null when it has none, or a 401 Response. */
  async function accountOf(c, { create = false } = {}) {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    return create ? (await ensureAccount(pool, email.toLowerCase())).id : principalOf(pool, email)
  }
  /** A write door: the account, the body's one key, then the store call. */
  const write = (key, run) => async (c) => {
    const accountId = await accountOf(c)
    if (accountId instanceof Response) return accountId
    const body = key ? await c.req.json().catch(() => null) : null
    if (key && (!body || typeof body !== 'object' || !Object.hasOwn(body, key)))
      return answer(c, { error: 'INVALID_REQUEST' })
    if (!accountId) return answer(c, { error: 'NO_DRAFT' })
    return answer(c, await run(accountId, body))
  }

  app.use(`${BASE}/*`, async (c, next) => {
    c.header('cache-control', 'no-store')
    await next()
  })

  app.get(BASE, async (c) => {
    const accountId = await accountOf(c)
    if (accountId instanceof Response) return accountId
    return json(c, { draft: accountId ? await readDraft(pool, accountId) : null })
  })

  app.post(BASE, async (c) => {
    const accountId = await accountOf(c, { create: true })
    if (accountId instanceof Response) return accountId
    const { created, draft } = await createDraft(pool, accountId)
    return json(c, { draft }, created ? 201 : 200)
  })

  app.put(
    `${BASE}/answers`,
    write('answer', (id, body) => saveAnswer(pool, id, { question: body.question, answer: body.answer }))
  )
  app.put(
    `${BASE}/template`,
    write('template', (id, body) => chooseTemplate(pool, id, body.template))
  )
  app.put(
    `${BASE}/plan`,
    write('plan', (id, body) => putPlan(pool, id, body.plan))
  )
  app.post(
    `${BASE}/plan-edits`,
    write('edit', (id, body) => editPlan(pool, id, body.edit))
  )
  app.post(
    `${BASE}/plan-undo`,
    write(null, (id) => undoPlanEdit(pool, id))
  )

  return app
}
