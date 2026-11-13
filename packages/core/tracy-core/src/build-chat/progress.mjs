/**
 * The build chat's template choice and build progress as data (TracyHQ/tracy#605, #608).
 *
 * Pure on purpose, like `conversation.mjs`: the template card and the task list (`@tracy/dsh-build-chat`) read what
 * these return, so the sample scenarios draw them in tests and real tool results draw them later (#609).
 *
 * Progress follows Contract B (`tracy-build-progress/v1`, `tracy-build-outcome/v1`). A build has no site check step
 * this round: the list ends with the write step and done follows it. A stopped build tells the owner which step
 * stopped it and what was kept; the fault reason (`outcome.stopped.reason`) stays with the team.
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

/** A step's state in the owner's list. */
function itemOf(step, result) {
  const base = { id: step.id, label: step.label }
  if (step.state === 'done') return { ...base, state: 'done', note: null }
  if (step.state === 'failed')
    return { ...base, state: 'failed', note: step.attempt >= 2 ? 'failed-twice' : 'failed' }
  if (step.state === 'running' && result === null) return { ...base, state: 'running', note: null }
  // A step still pending, or caught running, when the build stopped never ran to the end.
  return { ...base, state: 'pending', note: result === 'stopped' ? 'not-started' : null }
}

/**
 * The task list of one run: its outcome when it has one, else its last progress event.
 * @param {{ events?: any[], outcome?: any }} run - a Contract B run
 */
export function progressOf(run) {
  const outcome = run?.outcome ?? null
  const last = outcome ?? run?.events?.at(-1) ?? null
  const result = outcome?.result ?? null
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
    twice: (failed?.attempt ?? 0) >= 2,
    writtenPages: steps.filter((s) => s.kind === 'writer' && s.state === 'done').length,
    siteUnchanged: !steps.some((s) => s.kind === 'write' && s.state === 'done'),
    teamNotified: outcome.stopped?.teamNotified === true
  }
}

/** Minutes and seconds, the task list's clock: `7:48`. */
export function clockOf(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
