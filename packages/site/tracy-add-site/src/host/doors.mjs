/**
 * The two addresses of one Joomla API door.
 *
 * `com_claudecowork` answers `option=com_claudecowork&task=api.exec` on the site client AND on the
 * administrator client — its system plugin answers before routing on both (claude-cowork 0.8.20+).
 * A site whose front end is gated (coming soon, offline, maintenance, a firewall extension) returns
 * an HTML page with status 200 for every front-end URL, component calls included, while the
 * administrator client is untouched. So the host does not know one endpoint; it knows two doors and
 * keeps the first that answers like the engine.
 *
 * Plain JavaScript, like `../client/credentials.mjs`, so `node --test` pins it without a TypeScript
 * loader. The TypeScript half imports it.
 */

const QUERY = 'option=com_claudecowork&task=api.exec&format=json'

/**
 * Both doors, front first.
 *
 * The administrator door assumes `/administrator` under the same webroot — the same assumption the
 * installer already makes, and `webRootFrom` keeps a subpath (`/office`) in the webroot, so a
 * relocated Joomla under a subpath still resolves. A renamed administrator directory does not: that
 * site opens the front door or nothing, which is where every site stood before there were two.
 * @param {string} webRootUrl The site's webroot as the extension resolved it, with or without a trailing slash.
 * @returns {string[]} Endpoint URLs in the order to try.
 */
export function apiDoors(webRootUrl) {
  const root = webRootUrl.replace(/\/+$/, '')
  return [`${root}/index.php?${QUERY}`, `${root}/administrator/index.php?${QUERY}`]
}

/**
 * Did the engine answer, or did something in front of it?
 *
 * The engine's every reply — success or refusal — is an object carrying a boolean `ok`. A gate's
 * HTML fails to parse (null), and Joomla's own JSON error for a guest on the administrator
 * (`{error:true, code:403}`) has no `ok`. Both mean "this door did not reach the engine".
 * @param {unknown} value Whatever `response.json()` produced.
 * @returns {boolean}
 */
export function isEngineAnswer(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (/** @type {{ ok?: unknown }} */ (value).ok) === 'boolean'
  )
}

/**
 * The engine's reply, out of a raw body — or `null` when whatever answered was not the engine.
 *
 * Read as text and judged by shape, never `response.json()` straight off the wire: a parked
 * domain answers the component URL with 405 and an empty body, a gate with a page of HTML, a
 * proxy with its own error page. `JSON.parse` throwing on those used to be the whole diagnosis
 * ("Something went wrong", joomlar.com, 2026-09-06).
 * @param {string} text The response body as received.
 * @returns {Record<string, unknown> | null}
 */
export function engineReply(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return isEngineAnswer(parsed) ? /** @type {Record<string, unknown>} */ (parsed) : null
}

/**
 * Did the door die on a PHP parse error?
 *
 * The engine needs PHP 8 (`?->`, `match`). On PHP 7 Joomla installs it without complaint, and then
 * every call to it answers 500 with "Parse error: syntax error, unexpected '?'…" — or an empty 500
 * when the host hides errors. Only the first is recognisable here; it is said as `php_too_old`
 * instead of the generic `call_failed` (measured: Joomla 3.10 on PHP 7.2).
 * @param {number} status The HTTP status the door answered with.
 * @param {string} text The response body as received.
 * @returns {boolean}
 */
export function isPhpParseFailure(status, text) {
  return status >= 500 && /\b(?:Parse error|syntax error, unexpected)\b/i.test(text)
}
