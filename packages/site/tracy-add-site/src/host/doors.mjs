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
  const parsed = parseJson(text)
  if (isEngineAnswer(parsed)) return /** @type {Record<string, unknown>} */ (parsed)
  // The engine's JSON with PHP's own notices printed in front of it is still the engine's reply.
  const rest = afterPhpNotices(text)
  if (rest === null) return null
  const again = parseJson(rest)
  return isEngineAnswer(again) ? /** @type {Record<string, unknown>} */ (again) : null
}

/** @param {string} text */
function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * One line of PHP's report of a problem it SURVIVED, as `display_errors` prints it — with
 * `html_errors` (`<br />` / `<b>Deprecated</b>:  … on line <b>53</b><br />`) or without
 * (`Deprecated: … on line 53`, `PHP Deprecated: …`). A fatal is not one: the request died there.
 */
const PHP_NOTICE_LINE =
  /^(?:<br\s*\/?>)?\s*(?:PHP\s+)?(?:<b>)?(?:Deprecated|Notice|Warning|Strict Standards|User Deprecated|User Notice|User Warning)(?:<\/b>)?:\s.*\bon line\b/i

/**
 * The body after the PHP notices printed in front of it, or null when it does not start with one.
 *
 * 🔒 WHY (beta report, 27/10/2026). A host that shows PHP's errors on the page prints every notice
 * the engine survives into its answer, ahead of the JSON: the engine's own buffer (`FatalGuard`) is
 * flushed as it is when nothing died. PHP 8.5 deprecates `curl_close()`, which the engine's uploader
 * calls after every part, so on such a host each `db.dump` / `files.pack` answer came back as
 * "Deprecated: Function curl_close() is deprecated … on line 53" plus the engine's JSON: read as not
 * the engine, the import stopped as `call_failed` after its first part, three times in a row. Only
 * whole lines in PHP's own notice form are taken off, and what remains must be an engine answer.
 * @param {string} text
 * @returns {string | null}
 */
export function afterPhpNotices(text) {
  const lines = String(text).split(/\r?\n/)
  let k = 0
  let notices = 0
  while (k < lines.length) {
    const line = lines[k].trim()
    if (line === '' || /^<br\s*\/?>$/i.test(line)) k += 1
    else if (PHP_NOTICE_LINE.test(line)) {
      notices += 1
      k += 1
    } else break
  }
  return notices > 0 && k < lines.length ? lines.slice(k).join('\n') : null
}

/**
 * What a body that was not an engine reply looked like, as one of `DIAGNOSTIC_ANSWERS`: never its
 * text, which can name the host's folders or carry a gate's markup.
 * @param {string} text
 * @returns {'empty' | 'php_fatal' | 'php_notice' | 'html' | 'json' | 'text'}
 */
export function answerKind(text) {
  const t = String(text ?? '').trim()
  if (t === '') return 'empty'
  if (/\b(?:Fatal error|Parse error|Uncaught\s+\w+)\b/.test(t)) return 'php_fatal'
  if (PHP_NOTICE_LINE.test(t.split(/\r?\n/).find((line) => line.trim() !== '' && !/^<br\s*\/?>$/i.test(line.trim())) ?? ''))
    return 'php_notice'
  if (t.startsWith('<')) return 'html'
  if (parseJson(t) !== undefined) return 'json'
  return 'text'
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
