/**
 * The pre site build draft (#603, migration 215): the answers, the chosen template and the one living plan of a site
 * built from the chat, tied to the account before any website opportunity or site exists.
 *
 * 🔒 ONE READ PATH. The plan card (through `GET /api/build-draft`) and the build engine (`draftPlanForBuild`) both read
 * `readDraft`, so the plan the owner approved is the plan that gets built. Once approved (#610, `build-store.js`), the
 * build engine reads the snapshot taken at approval (`build.snapshot`) instead, and the shaping columns refuse every
 * write (`BUILD_RUNNING`) until the build ends. Every write is one transaction holding the
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
  'brand',
  'build'
]

/** The account's draft as the doors answer it, or null when it has none. */
export async function readDraft(pool, accountId) {
  const { rows } = await pool.query('select * from build_draft where account_id = $1', [accountId])
  return rows[0] ? draftShape(rows[0]) : null
}

/**
 * What the build engine reads to build: the draft's plan, the last edit applied to it (what a partial re-run touches)
 * and the research it was gated with. Null when the account has no draft or the draft has no plan yet.
 *
 * 🔒 AN APPROVED BUILD READS ITS SNAPSHOT (#610). Once the owner approved a plan (`build-store.js approveBuild`), this
 * answers the plan, edit and research frozen at approval, never the living draft: a newer research or a plan edit made
 * meanwhile cannot change what is built. Before approval it is the same read as the plan card's, with `research` null.
 * @returns {Promise<{draftId: string, plan: object, lastEdit: object | null, research: object | null} | null>}
 */
export async function draftPlanForBuild(pool, accountId) {
  const { rows } = await pool.query(
    'select id, plan, last_edit, build from build_draft where account_id = $1',
    [accountId]
  )
  const row = rows[0]
  const snapshot = row?.build?.snapshot
  if (snapshot)
    return {
      draftId: row.id,
      plan: snapshot.plan,
      lastEdit: snapshot.lastEdit ?? null,
      research: snapshot.research
    }
  return row?.plan ? { draftId: row.id, plan: row.plan, lastEdit: row.last_edit, research: null } : null
}

/**
 * What the engine keeps beside the plan, never answered by a door: the settled needs profile, the research record and
 * the last system fault (a team report, never shown to the owner). Null when the account has no draft. Once a plan is
 * approved it answers the approval's snapshot: its profile and research, and no fault (approval is refused while a
 * step runs, and the fault column keeps every past fault, even one a later research replaced).
 * @returns {Promise<{draftId: string, needsProfile: object | null, research: object | null, fault: object | null} | null>}
 */
export async function readEngineDraft(pool, accountId) {
  const { rows } = await pool.query(
    'select id, needs_profile, research, fault, build from build_draft where account_id = $1',
    [accountId]
  )
  const row = rows[0]
  const snapshot = row?.build?.snapshot
  if (snapshot)
    return { draftId: row.id, needsProfile: snapshot.profile, research: snapshot.research, fault: null }
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

/** What the owner shapes: none of it changes while an approved build has not ended (#610). */
const SHAPED = ['questions', 'answers', 'template', 'plan', 'needs_profile', 'research']

/**
 * Whether a write would change what the owner shaped while the draft's approved build has not ended. The build reads
 * its own snapshot, so nothing would break, but the plan card would show a plan that is not the one being built.
 */
const buildHolds = (row, decided) =>
  Boolean(row.build) &&
  !row.build.endedAt &&
  !decided.error &&
  SHAPED.some((name) => Object.hasOwn(decided, name))

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
    const asked = row ? decide(row) : { error: 'NO_DRAFT' }
    const decided = row && buildHolds(row, asked) ? { error: 'BUILD_RUNNING' } : asked
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

/** Said when a plan edit would move the living plan to another template. Plain English, no dashes. */
export const TEMPLATE_CHANGE_SAY =
  'This plan is made for the design you chose, and I cannot move it to another design yet.'

/**
 * Choose the template before a plan exists; afterwards the template stays the plan's (a plan edit that moves it is
 * refused, `TEMPLATE_CHANGE_SAY`), and a restart of the plan keeps it too. Only a
 * template the catalogue offers now for the draft's researched trade (same slug and version) is stored: a draft with
 * no researched trade is offered nothing.
 * @param {{templatesFor: (trade: string) => Array<{slug: string, version: string}>}} kits the AI quickstart catalogue
 */
export function chooseTemplate(pool, accountId, sent, kits) {
  const template = readTemplate(sent)
  if (!template) return { error: 'INVALID_TEMPLATE' }
  return changeDraft(pool, accountId, (row) => {
    if (row.plan) return { error: 'PLAN_EXISTS' }
    const trade = row.research?.trade
    const offered = typeof trade === 'string' ? kits.templatesFor(trade) : []
    if (!offered.some((o) => o.slug === template.slug && o.version === template.version))
      return { error: 'TEMPLATE_NOT_OFFERED' }
    return { template }
  })
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

/**
 * End the running revise step of `runner` (#609 over #617) with what `revisePlan` answered: a changed plan and its
 * profile are written with the step's done state in one write, an unchanged one writes the done state only. Written
 * only while the living plan is still `base` (the plan the request was made for): an edit made meanwhile answers
 * `STALE_PLAN` and nothing is written. The undo and the last edit belonged to the plan before and are cleared.
 * @param {{plan: object, profile: object, unchanged: boolean}} revised
 * @param {{runner: string, base: {id: string, revision: number}, ended: object}} how `ended`: the done state's fields
 */
export function putRevised(pool, accountId, { plan, profile, unchanged }, { runner, base, ended }) {
  if (!unchanged) {
    const problems = planProblem(plan)
    if (problems) return { error: 'INVALID_PLAN', problems }
  }
  return changeDraft(pool, accountId, (row) => {
    if (row.engine?.state !== 'running' || row.engine.runner !== runner) return { error: 'NOT_RUNNING' }
    if (row.plan?.id !== base.id || row.plan?.revision !== base.revision) return { error: 'STALE_PLAN' }
    const engine = { ...row.engine, ...ended, state: 'done', endedAt: new Date().toISOString() }
    if (unchanged) return { engine }
    return {
      engine,
      plan,
      needs_profile: profile,
      template: plan.look.template,
      last_edit: null,
      undo_edit: null,
      undo_profile: null
    }
  })
}

/**
 * Discard the living plan because the owner asked to start it over (#609, compose `restart`): the plan, its edits and
 * their undo go, the needs profile is research's again, and the plan's template stays chosen. The owner's answers, the
 * research and the brand record are kept. A draft with no plan is left as it is.
 */
export function discardPlan(pool, accountId) {
  return changeDraft(pool, accountId, (row) => {
    if (!row.plan) return {}
    return {
      plan: null,
      template: row.plan.look?.template ?? row.template,
      needs_profile: row.research?.profile ?? null,
      last_edit: null,
      undo_edit: null,
      undo_profile: null
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
  // The plan's blocks, its brand record and its gate all belong to the plan's template: moving the plan to another
  // template would keep them all and build a broken site. Refused, in the owner's words (#609).
  const current = row.plan.look?.template
  const moved = (Array.isArray(edit?.changes) ? edit.changes : []).some(
    (ch) =>
      ch?.field === 'look.template' &&
      (ch.value?.slug !== current?.slug || ch.value?.version !== current?.version)
  )
  if (moved)
    return { error: 'INVALID_EDIT', problems: [{ at: 'look.template', message: TEMPLATE_CHANGE_SAY }] }
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
