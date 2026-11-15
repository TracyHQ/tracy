// The direct transport of the door client (ticket #585): one Claude Cowork plugin call over HTTP with the site's
// launch token, for the gate's own runs on a throwaway site. The app never imports this file: it passes its own `send`
// through the run's Apply door (`apps/tracy-web/src/step-chain-draft-send.js`). Same contract as that one: answers the
// plugin's answer, throws an Error with the answer's code on a refusal (`door_refused` when there is none), and marks
// an error `fatal` when the call may have reached the site without an answer (the write resumes from its record).
const DOOR = 'index.php?option=com_claudecowork&task=api.exec&format=json'
/** A payload as the log keeps it: file bytes by their length, not their base64. */
const logged = (payload) =>
  payload?.content_b64 ? { ...payload, content_b64: `<${payload.content_b64.length} base64 chars>` } : payload

/**
 * @param {{base: string, token: string, fetchImpl?: typeof fetch, log?: (entry: object) => void}} input `log` sees
 *   every call with its answer (the gate keeps them in its run folder, never the token)
 * @returns {(operation: string, payload: object) => Promise<object>}
 */
export function directSend({ base, token, fetchImpl = fetch, log = () => {} }) {
  const url = `${String(base).replace(/\/$/, '')}/${DOOR}`
  return async (operation, payload) => {
    let text
    let status
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: operation, params: payload })
      })
      status = response.status
      text = await response.text()
    } catch (error) {
      log({ operation, payload: logged(payload), error: String(error?.message ?? error) })
      throw Object.assign(new Error(`${operation}: no answer: ${error?.message ?? error}`), {
        code: 'no_answer',
        fatal: true
      })
    }
    let answer
    try {
      answer = JSON.parse(text)
    } catch {
      answer = { ok: false, error: 'not_json', message: `HTTP ${status}: ${text.slice(0, 200)}` }
    }
    log({ operation, payload: logged(payload), answer })
    if (answer?.ok !== true) {
      const code = answer?.error ?? answer?.code ?? 'door_refused'
      throw Object.assign(new Error(`${operation}: ${code}: ${answer?.message ?? ''}`.trim()), {
        code,
        answer
      })
    }
    return answer
  }
}
