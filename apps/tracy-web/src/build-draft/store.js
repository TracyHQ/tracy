/**
 * The pre site build draft (#603, migration 215): the answers, the chosen template and the one living plan of a site
 * built from the chat, tied to the account before any website opportunity or site exists.
 *
 * 🔒 ONE READ PATH. The plan card (through `GET /api/build-draft`) and the build engine (`draftPlanForBuild`) both read
 * `readDraft`, so the plan the owner approved is the plan that gets built. Every write is one transaction holding the
 * account's row (`for update`), so two edits of the same revision cannot both apply.
 *
 * 🔒 ONLY THE ENGINE WRITES THE PLAN (#609). No model and no browser puts a plan: the writers are `putComposed` (a
 * plan that came out of the plan composer and its rules gate) and the gated edits (`editPlan`, `undoPlanEdit`), which
 * run `gateEditedPlan` with the needs profile the plan was composed from and the kit of the plan's template. The plan
 * and that profile are written in one transaction, so an edit the rules refuse changes nothing.
 */
import { gateEditedPlan } from 'website-opportunities/domain'
import { answerProblem, draftShape, planProblem, readTemplate, undoEditOf } from './rules.js'

const COLUMNS = [
  'questions',
  'answers',
  'template',
  'plan',
  'last_edit',
  'undo_edit',
  'needs_profile',
  'research',
  'fault',
  'undo_profile',
  'engine',
  'brand'
]

/** The account's draft as the doors answer it, or null when it has none. */
export async function readDraft(pool, accountId) {
  const { rows } = await pool.query('select * from build_draft where account_id = $1', [accountId])
  return rows[0] ? draftShape(rows[0]) : null
}

/**
 * What the build engine reads to build: the draft's living plan and the last edit applied to it (what a partial
 * re-run touches). Null when the account has no draft or the draft has no plan yet. The same read as the plan card's.
 * @returns {Promise<{draftId: string, plan: object, lastEdit: object | null} | null>}
 */
export async function draftPlanForBuild(pool, accountId) {
  const draft = await readDraft(pool, accountId)
  return draft?.plan ? { draftId: draft.id, plan: draft.plan, lastEdit: draft.lastEdit } : null
}

/**
 * What the engine keeps beside the plan, never answered by a door: the settled needs profile, the research record and
 * the last system fault (a team report, never shown to the owner). Null when the account has no draft.
 * @returns {Promise<{draftId: string, needsProfile: object | null, research: object | null, fault: object | null} | null>}
 */
export async function readEngineDraft(pool, accountId) {
  const { rows } = await pool.query(
    'select id, needs_profile, research, fault from build_draft where account_id = $1',
    [accountId]
  )
  const row = rows[0]
  return row
    ? { draftId: row.id, needsProfile: row.needs_profile, research: row.research, fault: row.fault }
    : null
}

/** Start the account's draft, or answer the one it has. No opportunity, no site. */
export async function createDraft(pool, accountId) {
  const { rows } = await pool.query(
    `insert into build_draft (account_id) values ($1) on conflict (account_id) do nothing returning *`,
    [accountId]
  )
  if (rows[0]) return { created: true, draft: draftShape(rows[0]) }
  return { created: false, draft: await readDraft(pool, accountId) }
}

/**
 * Change the account's draft in one transaction. `decide(row)` answers `{error, ...}` to refuse, or the columns to
 * write. Answers `{draft}`, `{error: 'NO_DRAFT'}` or the refusal. Also the writer of the engine state
 * (`engine-store.js`).
 */
export async function changeDraft(pool, accountId, decide) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const row = (
      await client.query('select * from build_draft where account_id = $1 for update', [accountId])
    ).rows[0]
    const decided = row ? decide(row) : { error: 'NO_DRAFT' }
    if (decided.error) {
      await client.query('rollback')
      return decided
    }
    const names = COLUMNS.filter((name) => Object.hasOwn(decided, name))
    const sets = names.map((name, i) => `${name} = $${i + 2}::jsonb`)
    const values = names.map((name) => (decided[name] === null ? null : JSON.stringify(decided[name])))
    const updated = await client.query(
      `update build_draft set ${[...sets, 'updated_at = now()'].join(', ')} where id = $1 returning *`,
      [row.id, ...values]
    )
    await client.query('commit')
    return { draft: draftShape(updated.rows[0]) }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Keep an answer with the question it answers; a later answer to the same question replaces the earlier one. */
export function saveAnswer(pool, accountId, { question, answer }) {
  const problems = answerProblem(question, answer)
  if (problems) return { error: 'INVALID_ANSWER', problems }
  return changeDraft(pool, accountId, (row) => ({
    questions: [...row.questions.filter((q) => q.id !== question.id), question],
    answers: [...row.answers.filter((a) => a.question !== question.id), answer]
  }))
}

/** Choose the template before a plan exists; afterwards the plan's `look.template` is changed by a plan edit. */
export function chooseTemplate(pool, accountId, sent) {
  const template = readTemplate(sent)
  if (!template) return { error: 'INVALID_TEMPLATE' }
  return changeDraft(pool, accountId, (row) => (row.plan ? { error: 'PLAN_EXISTS' } : { template }))
}

/**
 * Put a plan the plan composer returned (`composePlan`: it passed the rules gate) as the living plan, with the settled
 * needs profile it was composed from and, when given, the research record. The same plan again needs a higher revision,
 * so no revision ever names two plans; the undo and the last edit belong to the plan they edited and are cleared.
 * The only plan writer besides the gated edits: no door calls it with a body a browser sent.
 * @param {{plan: object, profile: object}} composed what `composePlan` answered
 * @param {{research?: object, runner?: string, lookSources?: object}} [extra] `runner`: the engine runner whose running
 *   compose step this ends (`engine.js`): the plan and the step's done state are one write, so a restart can never leave
 *   a stored plan beside a step that reads as stopped; a step no longer that runner's (`NOT_RUNNING`) writes nothing.
 *   `lookSources`: where the plan's accent and logo came from, as `composePlan` answered them, kept with the brand record
 */
export function putComposed(pool, accountId, { plan, profile } = {}, { research, runner, lookSources } = {}) {
  const problems = planProblem(plan)
  if (problems) return { error: 'INVALID_PLAN', problems }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile))
    return {
      error: 'INVALID_PLAN',
      problems: [{ at: 'profile', message: 'a composed plan comes with its needs profile' }]
    }
  return changeDraft(pool, accountId, (row) => {
    if (row.plan?.id === plan.id && plan.revision <= row.plan.revision)
      return { error: 'STALE_PLAN', revision: row.plan.revision }
    if (runner !== undefined && (row.engine?.state !== 'running' || row.engine.runner !== runner))
      return { error: 'NOT_RUNNING' }
    return {
      ...(runner === undefined
        ? {}
        : { engine: { ...row.engine, state: 'done', endedAt: new Date().toISOString() } }),
      plan,
      needs_profile: profile,
      template: plan.look.template,
      last_edit: null,
      undo_edit: null,
      undo_profile: null,
      ...(research === undefined ? {} : { research }),
      ...(lookSources === undefined ? {} : { brand: { ...row.brand, lookSources } })
    }
  })
}

/** Keep the last system fault of the chat build, for the team. It is never part of what a door answers. */
export function recordFault(pool, accountId, fault) {
  return changeDraft(pool, accountId, () => ({ fault: { ...fault, at: new Date().toISOString() } }))
}

/**
 * An edit of the living plan held to the rules gate, with `profile` as the plan's needs profile and the kit of the
 * plan's template. Answers the gated `{plan, profile}` or a refusal whose problems are sentences for the owner.
 */
function gatedEdit(row, edit, profile, loadKit) {
  if (!row.plan || !profile) return { error: 'NO_PLAN' }
  const kit = loadKit(row.plan.look?.template?.slug)
  if (!kit) return { error: 'NO_KIT' }
  const gated = gateEditedPlan({
    plan: row.plan,
    edit,
    profile,
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: kit.library
  })
  if (gated.ok) return gated
  const stale = gated.problems.some((p) => p.at === 'plan.revision')
  return { error: stale ? 'STALE_EDIT' : 'INVALID_EDIT', problems: gated.problems }
}

/**
 * Apply a Contract B plan edit to the living plan through the edit gate; the plan and its needs profile change
 * together. Its undo (the edit back and the profile before) replaces the previous one.
 * @param {{loadKit: (slug: string) => object | null}} kits the AI quickstart catalogue (`ai-quickstarts.js`)
 */
export function editPlan(pool, accountId, edit, { loadKit }) {
  return changeDraft(pool, accountId, (row) => {
    const gated = gatedEdit(row, edit, row.needs_profile, loadKit)
    if (gated.error) return gated
    return {
      plan: gated.plan,
      needs_profile: gated.profile,
      template: gated.plan.look.template,
      last_edit: edit,
      undo_edit: undoEditOf(row.plan, edit),
      undo_profile: row.needs_profile
    }
  })
}

/**
 * Take the last plan edit back, once: the undo is held to the edit gate like any edit, and the needs profile is put back
 * exactly as it was before the edit. Nothing is left to undo.
 * @param {{loadKit: (slug: string) => object | null}} kits
 */
export function undoPlanEdit(pool, accountId, { loadKit }) {
  return changeDraft(pool, accountId, (row) => {
    if (!row.undo_edit) return { error: 'NOTHING_TO_UNDO' }
    const gated = gatedEdit(row, row.undo_edit, row.undo_profile, loadKit)
    if (gated.error) return gated
    return {
      plan: gated.plan,
      needs_profile: row.undo_profile,
      template: gated.plan.look.template,
      last_edit: row.undo_edit,
      undo_edit: null,
      undo_profile: null
    }
  })
}
