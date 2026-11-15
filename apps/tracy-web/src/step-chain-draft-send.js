// The transport of a draft run's write step on a REAL site (#597): `send(operation, payload)`, ONE plugin call carried
// through the Apply door as the person who pressed Build for this run. `apply` is what the step chain engine hands the
// Write step (`how.door.apply`, `applyFor(email, runId)` of `app.js`, `applyAs(email, call, {setupRun: runId})` of
// `sites/route.js`), so every call is a write of the setup run: its `site_write` rows carry the origin `{kind: 'setup',
// ref: runId}`, Site changes folds them into one "Tracy setup" row, and the run frame (`sites/brief-build.js`) holds
// the webroot under `setupTurnOf(runId)` around them and closes the setup moment (`SETUP_MOMENT_VIA`).
// Spec: docs/references/draft-write-doors.md.
//
//   send(operation, payload)  operation: a plugin action the Apply door allows (`content.get`, `content.update`, ...)
//                             payload:   that action's params, as the plugin reads them (`apply_id`, `kind`, ...)
//                             returns:   the plugin's answer (`{ok: true, ...}`)
//                             throws:    a refusal (`ok: false`, or no answer) as an Error with the answer's `code`;
//                                        a call the run's signal stopped as `fatal` (never retried in place)
//
// Which door is which operation is NOT here: the door client (`siteDoors({send})`, scripts/ai-quickstart/site-doors.mjs)
// owns that mapping, and `step-chain-draft-site.js` hands it this function.

/**
 * @param {{apply: (call: {siteKey: string, action: string, params: object}) => Promise<any>, siteKey: string,
 *   signal?: AbortSignal | null}} input `apply`: the Apply door of this run as its person (bound to the run's setup id)
 * @returns {(operation: string, payload?: object) => Promise<object>}
 */
export function draftSendOf({ apply, siteKey, signal = null }) {
  if (typeof apply !== 'function') throw new TypeError('draftSendOf needs the Apply door of the run')
  if (typeof siteKey !== 'string' || siteKey === '') throw new TypeError('draftSendOf needs the site key')
  return async function send(operation, payload = {}) {
    if (typeof operation !== 'string' || operation === '')
      throw new TypeError('send needs a plugin operation')
    let answer
    try {
      answer = await apply({ siteKey, action: operation, params: payload })
    } catch (error) {
      if (signal?.aborted) throw Object.assign(error ?? new Error('the run stopped'), { fatal: true })
      throw error
    }
    if (!answer || answer.ok === false) {
      const code = String(answer?.code ?? answer?.error ?? 'door_refused')
      throw Object.assign(new Error(`${operation}: ${answer?.message ?? code}`), { code, door: operation })
    }
    return answer
  }
}
