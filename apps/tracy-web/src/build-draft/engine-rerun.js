/**
 * The rerun rule of the build chat's engine steps (#609, ADR 0047's stop and report rule), as a TEMPORARY wrapper:
 * Part 3's step frame takes these steps over, and this file is dropped then. Nothing else in the build draft knows it.
 *
 *   (a) a failure that carries `noRerun: true` (`plan_gate_failed`, `answer_invalid`, `model_missing`...) is never run
 *       again: a second run of the same inputs fails the same way;
 *   (b) a rerun takes exactly the inputs of the first run: they are copied once, before the first run, and every run
 *       reads its own copy of that copy, so a run that changed its inputs cannot change the next one's;
 *   (c) the second failure stops: the caller records the fault (`recordFault`) and the owner reads one sentence.
 */

/** How many times a step runs at most: once, and once more unless the failure says a rerun cannot help. */
export const STEP_ATTEMPTS = 2

/**
 * @template T
 * @param {(inputs: any) => Promise<T>} step
 * @param {object} inputs plain data (copied with `structuredClone`); tools such as the model go in the step's closure
 * @returns {Promise<{ok: true, value: T, attempts: number} | {ok: false, error: any, attempts: number}>}
 */
export async function runWithRerun(step, inputs) {
  const stored = structuredClone(inputs)
  let error = null
  for (let attempt = 1; attempt <= STEP_ATTEMPTS; attempt++) {
    try {
      return { ok: true, value: await step(structuredClone(stored)), attempts: attempt }
    } catch (e) {
      error = e
      if (e?.noRerun === true) return { ok: false, error, attempts: attempt }
    }
  }
  return { ok: false, error, attempts: STEP_ATTEMPTS }
}

/** The fault record of a failed step, for the team: its code, its message and how many times it ran. */
export function faultOf(step, { error, attempts }) {
  return {
    step,
    code: typeof error?.code === 'string' ? error.code : 'step_failed',
    message: String(error?.message ?? error),
    attempts,
    ...(error?.noRerun === true ? { noRerun: true } : {}),
    ...(typeof error?.reason === 'string' ? { reason: error.reason } : {}),
    // A failed change request keeps the owner's own words with the verbatim problems (Part 3 reads real cases).
    ...(typeof error?.requestText === 'string' ? { request: error.requestText } : {}),
    ...(Array.isArray(error?.details?.problems) ? { problems: error.details.problems.slice(0, 20) } : {})
  }
}
