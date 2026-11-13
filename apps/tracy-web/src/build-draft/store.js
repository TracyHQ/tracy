/**
 * The pre site build draft (#603, migration 215): the answers, the chosen template and the one living plan of a site
 * built from the chat, tied to the account before any website opportunity or site exists.
 *
 * 🔒 ONE READ PATH. The plan card (through `GET /api/build-draft`) and the build engine (`draftPlanForBuild`) both read
 * `readDraft`, so the plan the owner approved is the plan that gets built. Every write is one transaction holding the
 * account's row (`for update`), so two edits of the same revision cannot both apply.
 */
import { checkPlanEdit } from 'website-opportunities/domain'
import { answerProblem, draftShape, planProblem, readTemplate, undoEditOf } from './rules.js'

const COLUMNS = ['questions', 'answers', 'template', 'plan', 'last_edit', 'undo_edit']

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
 * write. Answers `{draft}`, `{error: 'NO_DRAFT'}` or the refusal.
 */
async function changeDraft(pool, accountId, decide) {
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
 * Put a newly composed plan as the living plan. The same plan again needs a higher revision, so no revision ever names
 * two plans; the undo and the last edit belong to the plan they edited and are cleared.
 */
export function putPlan(pool, accountId, plan) {
  const problems = planProblem(plan)
  if (problems) return { error: 'INVALID_PLAN', problems }
  return changeDraft(pool, accountId, (row) => {
    if (row.plan?.id === plan.id && plan.revision <= row.plan.revision)
      return { error: 'STALE_PLAN', revision: row.plan.revision }
    return { plan, template: plan.look.template, last_edit: null, undo_edit: null }
  })
}

const applied = (row, edit, undo = null) => {
  const checked = checkPlanEdit(edit, row.plan)
  if (!checked.ok) {
    const stale = checked.problems.some((p) => p.at === 'plan.revision')
    return { error: stale ? 'STALE_EDIT' : 'INVALID_EDIT', problems: checked.problems }
  }
  return { plan: checked.plan, template: checked.plan.look.template, last_edit: edit, undo_edit: undo }
}

/** Apply a Contract B plan edit to the living plan; its undo replaces the previous one. */
export function editPlan(pool, accountId, edit) {
  return changeDraft(pool, accountId, (row) => {
    if (!row.plan) return { error: 'NO_PLAN' }
    const result = applied(row, edit)
    return result.error ? result : { ...result, undo_edit: undoEditOf(row.plan, edit) }
  })
}

/** Take the last plan edit back, once: the undo is applied as an edit and nothing is left to undo. */
export function undoPlanEdit(pool, accountId) {
  return changeDraft(pool, accountId, (row) =>
    row.undo_edit ? applied(row, row.undo_edit) : { error: 'NOTHING_TO_UNDO' }
  )
}
