/**
 * A `content.read` THE RELAY REFUSED, SENT ONCE MORE WITH THE ONE CORRECTION ITS OWN ANSWER NAMES.
 *
 * 🔒 WHY. A model names a language, not a site's tag for it: `locale:"en"` for a site that lists `en-GB`
 * (3 of 15 refused reads on the round-7 bench, on Joomla and WordPress alike). The relay knows the
 * answer and says it — `locale "en" is not one of this site's locales: en-GB, ru-RU; use "en-GB"` — and
 * says `use` ONLY when exactly one listed locale shares the language (`localeRefusal` in
 * `apps/tracy-web/src/sites/route.js`), so the correction is never a guess. But it makes no substitution
 * ("a different filter than it asked for is the caller's to choose"), so the model lost a step to type
 * what the message told it. Here the caller is the agent's own tool: it sends the call again with the
 * tag the relay named and says so in `normalized`, so the model reads its mistake once and the answer it
 * asked for in the same step.
 *
 * It is a READ, so sending it twice changes nothing; one correction only — a call still refused after
 * it is answered with the first refusal, as the relay worded it. Pure: no I/O.
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * The call to send again after a refusal about `locale`, or null when the refusal names no single tag.
 * @param {unknown} params - the `content.read` params as they were sent.
 * @param {unknown} answer - what the relay answered.
 * @returns {{ params: Record<string, unknown>, note: string } | null}
 */
export function localeAgain(params, answer) {
  if (!isRecord(params) || typeof params.locale !== 'string' || !isRecord(answer)) return null
  const error = isRecord(answer.error) ? answer.error : null
  if (error === null || error.code !== 'CONTENT_BAD_QUERY' || typeof error.message !== 'string') return null
  const tag = /^locale ".*" is not one of this site's locales: .*; use "([^"]{1,35})"$/.exec(
    error.message
  )?.[1]
  if (tag === undefined || tag === params.locale) return null
  return {
    params: { ...params, locale: tag },
    note: `locale "${params.locale.slice(0, 20)}" is "${tag}" here: the one tag this site lists for it`
  }
}

// ── an address with no language prefix ───────────────────────────────────────────────────────────────────

/**
 * A PAGE BY ADDRESS THAT THE SITE ANSWERED WITH NO PAGE, ONLY BECAUSE THE ADDRESS LACKS THE PREFIX ITS DEFAULT
 * LANGUAGE IS SERVED UNDER, SENT ONCE MORE WITH IT.
 *
 * 🔒 WHY. The relay matches an address as it is written. On a site that serves every language under its
 * own prefix (Joomla with its language filter on and the default prefix kept, Polylang showing the default
 * language's), the page a customer calls "the News page" is `/en/news`, and `/news` answers `pages: []`. The
 * round-7 add-by-chat runs sent `/news` twice in 16, got no page, and fell back to reading menu items and
 * category lists — the first call of the whole add lost. The relay's own reading of a link with no
 * prefix is "the default language" (`localeOfLink`); this is the same reading, spelled for a site whose
 * addresses need it spelled.
 *
 * 🔒 THE DEFAULT LANGUAGE IS NEVER GUESSED. The order of the locales a listing names is no answer (Joomla's
 * are sorted, and its listing says `defaultLocale: null`), and a wrong-language page is the one mistake a
 * retry must not make: the model would write the customer's article into the wrong edition. A site that
 * names its default in the listing (WordPress) is believed, and its prefix is read as the short code of the tag
 * only when no other listed locale shares that language (`pt-BR` beside `pt-PT`: `/pt` is either); for Joomla
 * the caller passes the facts measured
 * when the site was provisioned (`collect-site-facts.mjs`: `siteLanguage`, `languagePrefixes`,
 * `defaultPrefixRemoved`) — the same ones the site context prints as "`/` opens `/en/`, the en-GB edition".
 * With neither, or with the default served without a prefix, nothing is sent again.
 *
 * It is a READ, so sending it twice changes nothing; one retry only, and a retry that finds no page is
 * dropped: the first answer stands, with the way on it always had. Pure: no I/O.
 */

/** The Content API's pages document. */
const PAGES_DOCUMENT = 'tracy-content-pages/v1'

/**
 * The address of a pages read that found no page and could be missing only a language prefix; null for any
 * other call or answer. The cheap look the caller makes BEFORE it reads any facts.
 * @param {unknown} params - the `content.read` params as they were sent.
 * @param {unknown} answer - what the relay answered.
 * @returns {{ path: string, locales: string[], site: Record<string, unknown> } | null}
 */
export function unprefixedMiss(params, answer) {
  if (!isRecord(params) || params.view !== 'pages' || typeof params.url !== 'string') return null
  if (params.locale !== undefined || !isRecord(answer)) return null
  if (answer.schemaVersion !== PAGES_DOCUMENT || typeof answer.link !== 'string') return null
  if (!Array.isArray(answer.pages) || answer.pages.length !== 0 || !isRecord(answer.site)) return null
  const locales = Array.isArray(answer.site.locales)
    ? answer.site.locales.filter((one) => typeof one === 'string' && one !== '')
    : []
  const path = params.url.trim()
  // Only a path: a pasted link carries the prefix its visitor saw.
  if (locales.length < 2 || !path.startsWith('/') || path.startsWith('//')) return null
  if (startsWithLanguage(path, locales, null)) return null
  return { path, locales, site: answer.site }
}

/**
 * Whether the first segment of `path` is a language: a listed locale (any case), the short code of one
 * (`en` for `en-GB`), or a prefix the site itself serves (`pt-pt`).
 * @param {string} path
 * @param {string[]} locales
 * @param {unknown} prefixes - `languagePrefixes` of the site's facts, or null.
 */
function startsWithLanguage(path, locales, prefixes) {
  const first = path.slice(1).split(/[/?#]/)[0].toLowerCase()
  if (first === '') return false
  const served = isRecord(prefixes) ? Object.values(prefixes).map((one) => String(one).toLowerCase()) : []
  return (
    served.includes(first) ||
    locales.some((locale) => locale.toLowerCase() === first || locale.toLowerCase().split('-')[0] === first)
  )
}

/**
 * The call to send again — the same call with the address under the default language's prefix — and the
 * note that tells the model, or null when it is not the case or the default language is not known for sure.
 * @param {unknown} params - the `content.read` params as they were sent.
 * @param {unknown} answer - what the relay answered.
 * @param {unknown} facts - the site's measured facts (`.site-facts/<label>.json` → `facts`), or null.
 * @returns {{ params: Record<string, unknown>, note: string } | null}
 */
export function addressAgain(params, answer, facts) {
  const miss = unprefixedMiss(params, answer)
  if (miss === null || !isRecord(params)) return null
  const known = isRecord(facts) ? facts : {}
  const listed = (/** @type {unknown} */ code) =>
    typeof code === 'string'
      ? miss.locales.find((one) => one.toLowerCase() === code.toLowerCase())
      : undefined
  // The listing's word for it first (WordPress says it), else the language the site was measured to serve.
  const told = listed(miss.site.defaultLocale)
  const locale = told ?? listed(known.siteLanguage)
  if (locale === undefined || known.defaultPrefixRemoved === true) return null
  const sefs = isRecord(known.languagePrefixes) ? known.languagePrefixes : {}
  const sef = Object.entries(sefs).find(([code]) => code.toLowerCase() === locale.toLowerCase())?.[1]
  // The site's own prefix; failing that, only a listing that named its default may be read by the short code —
  // and only when no other listed locale shares it: `/pt` may be `pt-BR` or `pt-PT`, and a wrong edition is worse
  // than no retry.
  const short = locale.split('-')[0].toLowerCase()
  const sharing = miss.locales.filter((one) => one.split('-')[0].toLowerCase() === short)
  const prefix =
    typeof sef === 'string' && sef !== '' ? sef : told !== undefined && sharing.length === 1 ? short : ''
  if (!/^[a-z0-9-]{1,20}$/i.test(prefix) || startsWithLanguage(miss.path, miss.locales, sefs)) return null
  const rest = miss.path === '/' ? '' : /^\/[?#]/.test(miss.path) ? miss.path.slice(1) : miss.path
  const url = `/${prefix}${rest}`
  // Two addresses, a fixed sentence and a tag stay inside the 90 characters a `normalized` note may have.
  const cut = (/** @type {string} */ text) =>
    JSON.stringify(text.length > 16 ? `${text.slice(0, 15)}…` : text)
  return {
    params: { ...params, url },
    note: `${cut(miss.path)} is ${cut(url)} here: prefix of the default language, ${locale}`
  }
}
