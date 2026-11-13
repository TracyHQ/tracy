/**
 * The build chat's template choice and build progress as data (TracyHQ/tracy#605, #608).
 *
 * Pure on purpose, like `conversation.mjs`: the template card and the task list (`@tracy/dsh-build-chat`) read what
 * these return, so the sample scenarios draw them in tests and real tool results draw them later (#609).
 *
 * Progress follows Contract B (`tracy-build-progress/v1`, `tracy-build-outcome/v1`). A build has no site check step
 * this round: the list ends with the write step and done follows it. A stopped build tells the owner which step
 * stopped it and what was kept; the fault reason (`outcome.stopped.reason`) stays with the team. A cancelled build
 * (the owner's choice) is neutral: nothing failed, the team is not told. A `result` this code does not know (a later
 * contract addition) is read as a build still running, never as done.
 */

/** The step kinds the owner's list shows, in plain words; any other kind (a site check) never reaches the owner. */
const SHOWN_KINDS = new Set(['look', 'writer', 'pictures', 'write'])

/**
 * @typedef {{ slug: string, name: string, version: string, picture: string, reason: string,
 *   quickstart: string, fits: boolean, recommended?: boolean }} TemplateOption
 */

/**
 * The templates the card offers: only those with a released AI quickstart that fit the business. `chosen` is the
 * recommended one, else the first; `none` when nothing fits, so the owner is pointed to Add site instead.
 * @param {TemplateOption[] | undefined} templates
 */
export function templateChoiceOf(templates) {
  const options = (templates ?? []).filter((t) => t?.quickstart === 'released' && t.fits === true)
  const chosen = (options.find((t) => t.recommended === true) ?? options[0])?.slug ?? null
  return { options, chosen, none: options.length === 0 }
}

/**
 * The build draft's template body (`PUT /api/build-draft/template`) for the option the owner chose.
 * @param {TemplateOption} option
 */
export function templateOfChoice(option) {
  return { slug: option.slug, name: option.name, version: option.version }
}

/** The outcome results this code knows. Any other value is read as no outcome yet. */
const ENDED = new Set(['done', 'stopped', 'cancelled'])

/** The results after which a step that is not done never ran to the end. */
const UNFINISHED = new Set(['stopped', 'cancelled'])

/** A failed step failed twice unless the engine says it was not run again (`noRerun`: it failed once). */
const failedTwice = (step) => step?.state === 'failed' && step.noRerun !== true

/** A step's state in the owner's list. */
function itemOf(step, result) {
  const base = { id: step.id, label: step.label }
  if (step.state === 'done') return { ...base, state: 'done', note: null }
  if (step.state === 'failed')
    return { ...base, state: 'failed', note: failedTwice(step) ? 'failed-twice' : 'failed' }
  if (step.state === 'running' && result === null) return { ...base, state: 'running', note: null }
  // A step still pending, or caught running, when the build stopped or was cancelled never ran to the end.
  return { ...base, state: 'pending', note: UNFINISHED.has(result) ? 'not-started' : null }
}

/**
 * The task list of one run: its outcome when it has one, else its last progress event.
 * @param {{ events?: any[], outcome?: any }} run - a Contract B run
 */
export function progressOf(run) {
  const outcome = run?.outcome ?? null
  const last = outcome ?? run?.events?.at(-1) ?? null
  const result = ENDED.has(outcome?.result) ? outcome.result : null
  const items = (last?.steps ?? []).filter((s) => SHOWN_KINDS.has(s.kind)).map((s) => itemOf(s, result))
  const count = (state) => items.filter((i) => i.state === state).length
  return {
    kind: last?.run?.kind ?? 'build',
    items,
    counts: {
      done: count('done'),
      running: count('running'),
      pending: count('pending'),
      failed: count('failed')
    },
    elapsedSeconds: last?.elapsedSeconds ?? 0,
    // An outcome with a result this code does not know is not an end: the build reads as still running.
    running: last !== null && result === null,
    result
  }
}

/**
 * The plain notice of a stopped build: the step that stopped it, how many pages were written and kept, whether the
 * site stayed as it was, whether the team was told. Null for a build that did not stop. No fault reason.
 * @param {any} outcome - a Contract B outcome
 */
export function stoppedOf(outcome) {
  if (outcome?.result !== 'stopped') return null
  const steps = outcome.steps ?? []
  const failed = steps.find((s) => s.state === 'failed') ?? steps.find((s) => s.id === outcome.stopped?.step)
  return {
    step: failed?.label ?? '',
    twice: failedTwice(failed),
    writtenPages: steps.filter((s) => s.kind === 'writer' && s.state === 'done').length,
    siteUnchanged: !steps.some((s) => s.kind === 'write' && s.state === 'done'),
    teamNotified: outcome.stopped?.teamNotified === true
  }
}

/**
 * The plain notice of a cancelled build: whether the site stayed as it was, and that the team was not told (a
 * cancel is the owner's choice). Null for a build that was not cancelled.
 * @param {any} outcome - a Contract B outcome
 */
export function cancelledOf(outcome) {
  if (outcome?.result !== 'cancelled') return null
  return {
    siteUnchanged: !(outcome.steps ?? []).some((s) => s.kind === 'write' && s.state === 'done'),
    teamNotified: outcome.cancelled?.teamNotified === true
  }
}

/** Minutes and seconds, the task list's clock: `7:48`. */
export function clockOf(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
