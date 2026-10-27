/**
 * What `POST /api/onboarding/step` may record about the first-run guides (`@tracy/dsh-onboard`): for
 * each flow, the steps it can name and the ways it can end. Closed lists, so a typed value cannot open
 * a new line in what usage counts. A scene or a tour step the client gains must be added here too
 * (`packages/ui/tracy-onboard/test/usage.test.mjs` fails until it is).
 *
 * - `welcome`: the "Welcome to Tracy" popup, its scenes by number (`SCENES` in `welcome-flow.ts`); it
 *   ends by ×, Escape, or the last scene's call to action.
 * - `tour-start`: the first-run tour on the start screen (`START_STEPS` in `tour-targets.ts`).
 * - `tour-site`: the site tour once a site is ready (`SITE_STEPS`). A tour ends by its last step or an
 *   action that completes it (`done`), Skip, Escape, or its controls leaving the page (`gone`).
 */
const TOUR_ENDS = Object.freeze(['done', 'skip', 'escape', 'gone'])

export const ONBOARD_FLOWS = Object.freeze({
  welcome: Object.freeze({
    steps: Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8']),
    ends: Object.freeze(['close', 'escape', 'cta'])
  }),
  'tour-start': Object.freeze({
    steps: Object.freeze(['template', 'import', 'createsite']),
    ends: TOUR_ENDS
  }),
  'tour-site': Object.freeze({
    steps: Object.freeze([
      'preview',
      'designsystem',
      'changes',
      'team',
      'undo',
      'publish',
      'edit',
      'pick',
      'change',
      'composer'
    ]),
    ends: TOUR_ENDS
  })
})

/** The most step and end records one account leaves in an hour; one first run walks about twenty. */
export const ONBOARD_STEPS_PER_HOUR = 200

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The record a body asks for, or the refusal code. `{runId, flow, step}` is a step reached;
 * `{runId, flow, step, end}` is how that showing ended, at that step.
 * @param {any} body
 * @returns {{kind: 'onboard.step' | 'onboard.exit', data: Record<string, string>, dedupeKey: string} | {code: string}}
 */
export function onboardRecord(body) {
  const runId = typeof body?.runId === 'string' && RUN_ID.test(body.runId) ? body.runId.toLowerCase() : null
  if (runId === null) return { code: 'INVALID_RUN_ID' }
  const flow = typeof body.flow === 'string' && Object.hasOwn(ONBOARD_FLOWS, body.flow) ? body.flow : null
  if (flow === null) return { code: 'INVALID_FLOW' }
  const { steps, ends } = ONBOARD_FLOWS[flow]
  if (typeof body.step !== 'string' || !steps.includes(body.step)) return { code: 'INVALID_STEP' }
  const data = { run_id: runId, flow, step: body.step }
  if (body.end === undefined)
    return { kind: 'onboard.step', data, dedupeKey: `onboard:${runId}:${body.step}` }
  if (typeof body.end !== 'string' || !ends.includes(body.end)) return { code: 'INVALID_END' }
  return { kind: 'onboard.exit', data: { ...data, end: body.end }, dedupeKey: `onboard-end:${runId}` }
}
