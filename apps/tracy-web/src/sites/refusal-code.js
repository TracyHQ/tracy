/** The longest refusal code an ops signal keeps; a code is a short token, never a sentence. */
export const REFUSAL_CODE_MAX = 64

const bounded = (value) => {
  if (typeof value !== 'string') return null
  const code = value
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, REFUSAL_CODE_MAX)
  return code === '' ? null : code
}

/**
 * The code an Apply answer refuses with, or null when it names none. Three shapes reach the door:
 * Tracy's own `{code}`, the Claude Cowork engine's `{ok: false, error: '<code>', message}` (`Engine::err`),
 * and the Content API's `{error: {code, message}}`. Reading only `error.code` missed the engine's
 * string, so every refused `content.update` reached `site.edit` as `refusal: null` (prod, 19/10/2026).
 * @param {unknown} body
 * @returns {string | null}
 */
export function refusalCodeOf(body) {
  if (!body || typeof body !== 'object') return null
  const answer = /** @type {{ code?: unknown, error?: unknown }} */ (body)
  const error = answer.error
  return (
    bounded(answer.code) ??
    bounded(error) ??
    (error && typeof error === 'object' ? bounded(/** @type {{ code?: unknown }} */ (error).code) : null)
  )
}
