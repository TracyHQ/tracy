/**
 * What the language question starts with.
 *
 * English, and the person's own language when it is another one the site can be built in —
 * Lee, 15/09: "always English, plus the user's language when it is not English", the same rule
 * on Joomla, WordPress and EmDash. Before this the form said `['en']` for everyone, and a
 * Vietnamese customer who did not touch the box got an English-only site.
 *
 * `allowed` is what THIS build can be asked for: a template ships its locales (EmDash Business:
 * `en`, `ru`), a CMS with language packs takes any. A tag the build cannot honour is not
 * preselected — the box would promise a language the site never gets.
 *
 * @param {string | undefined} uiLang the page's language tag (`vi`, `zh-TW`, `pt-BR`)
 * @param {readonly string[] | undefined} allowed the languages on offer; undefined means any
 * @param {readonly string[]} [browser] the browser's own languages (`navigator.languages`), which
 *   say WHICH English when the build offers more than one — see `englishFor`
 * @returns {string[]} English first, then the person's language when it differs and is offered
 */
export function defaultLanguages(uiLang, allowed, browser = []) {
  const tag = String(uiLang ?? '').trim()
  const base = tag.split('-')[0].toLowerCase()
  const english = englishFor(allowed, [tag, ...browser])
  const own = [tag, base].map((c) => resolve(c, allowed)).find((c) => c !== undefined && baseOf(c) !== 'en')
  const out = english !== undefined ? [english] : []
  if (own !== undefined && !out.includes(own)) out.push(own)
  if (out.length > 0) return out
  return allowed !== undefined && allowed.length > 0 ? [allowed[0]] : ['en']
}

/**
 * The ONE language a one-language build starts with (a quickstart with no second edition, such as
 * ja-kinetic): the person's own when it is on offer, English otherwise, else the first offered.
 *
 * @param {string | undefined} uiLang the page's language tag
 * @param {readonly string[] | undefined} allowed the languages on offer; undefined means any
 * @param {readonly string[]} [browser] the browser's own languages, as `defaultLanguages` takes them
 * @returns {string}
 */
export function defaultLanguage(uiLang, allowed, browser = []) {
  const tag = String(uiLang ?? '').trim()
  const base = tag.split('-')[0].toLowerCase()
  const own =
    baseOf(tag) === 'en'
      ? undefined
      : [tag, base].map((c) => resolve(c, allowed)).find((c) => c !== undefined)
  if (own !== undefined) return own
  const english = englishFor(allowed, [tag, ...browser])
  if (english !== undefined) return english
  return allowed !== undefined && allowed.length > 0 ? allowed[0] : 'en'
}

/**
 * Which English a build starts with.
 *
 * A Joomla build offers five (Lee, 24/09/2026): the archive's en-GB and the en-US, en-AU, en-CA,
 * en-NZ that relabel it. The first one listed is en-GB only because the archive is, so "the first
 * English" put British English in front of everyone. The person's own English decides — the first
 * regional English among the page's language and the browser's that the build offers — and
 * American English when they name none. An offer with one English, or none, is answered as before.
 * @param {readonly string[] | undefined} allowed
 * @param {readonly string[]} wanted the page's language, then the browser's, most wanted first
 * @returns {string | undefined}
 */
export function englishFor(allowed, wanted) {
  const offered = (allowed ?? []).filter((a) => baseOf(a) === 'en')
  if (allowed === undefined || offered.length < 2) return resolve('en', allowed)
  for (const code of wanted) {
    const want = String(code ?? '')
      .trim()
      .toLowerCase()
    if (baseOf(want) !== 'en' || !want.includes('-')) continue
    const exact = offered.find((a) => a.toLowerCase() === want)
    if (exact !== undefined) return exact
  }
  return offered.find((a) => a.toLowerCase() === 'en-us') ?? resolve('en', allowed)
}

/**
 * `zh-TW` → `zh`, `en` → `en`.
 * @param {string} code
 */
export function baseOf(code) {
  return String(code).split('-')[0].toLowerCase()
}

/**
 * The offered entry a wanted code stands for, or undefined when the build cannot honour it.
 *
 * The offer is written in two spellings and this is the one place that reconciles them. A
 * template lists two-letter codes (`en`, `ru`); a Joomla build lists the tags its language packs
 * carry, lowercased for the questionnaire (`en-gb`, `zh-tw`). A wanted `vi` must find `vi-vn`,
 * and a wanted `zh-TW` must find `zh-tw` and NOT `zh-cn` — the base matches both, so an exact
 * match is tried first and the base only decides when nothing exact is on offer.
 *
 * @param {string} code what is wanted (`en`, `vi`, `zh-TW`)
 * @param {readonly string[] | undefined} allowed the offer; undefined means anything goes
 * @returns {string | undefined}
 */
export function resolve(code, allowed) {
  const want = String(code ?? '').trim()
  if (want === '') return undefined
  if (allowed === undefined) return want
  const lower = want.toLowerCase()
  const exact = allowed.find((a) => a.toLowerCase() === lower)
  if (exact !== undefined) return exact
  const b = baseOf(want)
  return allowed.find((a) => baseOf(a) === b)
}

/**
 * Site languages as ISO 639-1 codes. Order matters: after English the first six are the shortlist
 * the picker opens with (Lee, 06/09: Vietnamese is not a shortlist language).
 */
export const CODES = Object.freeze(
  'en zh es fr de ja pt ko ru ar hi it nl id ms th tr pl sv da fi no cs sk hu ro bg el uk he fa ur bn ta te ml kn mr gu pa si my km lo ne tl sw af zu am ha yo ig et lv lt sl hr sr bs mk sq ca eu gl is ga cy mt lb vi'.split(
    ' '
  )
)

/** `zh-cn` → `zh-CN`: the spelling `Intl.DisplayNames` answers to. @param {string} code */
function tagOf(code) {
  return String(code).replace(
    /^([a-z]{2,3})-([a-z]{2,4})$/i,
    (_, l, r) => `${l.toLowerCase()}-${r.toUpperCase()}`
  )
}

/**
 * A language's ENGLISH name, and nothing else — "Chinese (China)".
 *
 * 🔒 THIS IS WHAT THE SENTENCE SENT TO THE CHAT USES, and it must stay English by construction.
 * The host reads the language it should speak off the customer's newest message by its script
 * (`words.mjs` `localeOf`: Han → zh, Vietnamese marks → vi, Han tested first), and the Build form's
 * sentence is sent as the customer's own message. Measured 21/09 on `site-swe9an`: a Vietnamese
 * brief whose language line read "中文（中国） · Chinese (China), Tiếng Việt …" turned the whole
 * session Chinese — every question the build asked came back in `中文`. The native name belongs on
 * the chip the customer sees (`languageLabel`), never in the line the agent reads.
 * @param {string} code
 */
export function languageName(code) {
  const tag = tagOf(code)
  // `fallback: 'none'`: a tag the browser cannot name yields undefined, not "xx (Unknown Region)" —
  // a decorated guess is worse than the code, because it reads as if someone had checked.
  try {
    return new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(tag) ?? tag
  } catch {
    // Not a tag the browser knows at all: the code itself is the only honest name.
    return tag
  }
}

/**
 * Chinese regions stand for a script, and the script is what a reader tells apart: `zh-cn` and
 * `zh-tw` are Simplified and Traditional, not two countries.
 */
const HAN_SCRIPT = Object.freeze({
  cn: 'Hans',
  sg: 'Hans',
  hans: 'Hans',
  tw: 'Hant',
  hk: 'Hant',
  mo: 'Hant',
  hant: 'Hant'
})

/**
 * What one picker row stands for: the base language (`en-au` → `en`), except Chinese, which keeps
 * its script (`zh-tw` → `zh-Hant`).
 * @param {string} code
 */
function rowKey(code) {
  const [lang, region = ''] = tagOf(code).split('-')
  const base = lang.toLowerCase()
  const script =
    base === 'zh' ? HAN_SCRIPT[/** @type {keyof typeof HAN_SCRIPT} */ (region.toLowerCase())] : undefined
  return script ? `zh-${script}` : base
}

/**
 * The name on the chip: the language's English name and nothing else — "Vietnamese", "Spanish",
 * "Simplified Chinese" (24/09/2026: "just English, Vietnamese, Spanish is enough").
 * The region is dropped because the picker offers one row per language (`rowsFor`); the native name
 * is dropped from the label but still found by the search (`searchText`).
 * @param {string} code
 */
export function languageLabel(code) {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(rowKey(code)) ?? tagOf(code)
    )
  } catch {
    return tagOf(code)
  }
}

/**
 * What the search box matches a row against: the English name, the native name and the code, so
 * "Tiếng Việt", "español" and "vi" still find their row although the chip shows English only.
 * @param {string} code
 */
function searchText(code) {
  const key = rowKey(code)
  let native = ''
  try {
    native = new Intl.DisplayNames([key], { type: 'language', fallback: 'none' }).of(key) ?? ''
  } catch {
    // A locale the browser cannot name in its own language: the English name and the code remain.
  }
  return `${languageLabel(code)} ${native} ${code}`.toLowerCase()
}

/** @param {string} code */
const rowOf = (code) => ({ code, label: languageLabel(code), search: searchText(code) })

/**
 * Which offered tag a row stands for when a language comes in several regions: the one already
 * picked, else American English for English (as `englishFor`), else the tag whose region repeats
 * the language (`es-es`, `fr-fr`, `vi-vn`), else the first offered.
 * @param {string[]} tags offered tags sharing one row key, in offer order
 * @param {readonly string[]} picked
 */
function representative(tags, picked) {
  const chosen = tags.find((t) => picked.includes(t))
  if (chosen !== undefined) return chosen
  const base = baseOf(tags[0])
  if (base === 'en') {
    const us = tags.find((t) => t.toLowerCase() === 'en-us')
    if (us !== undefined) return us
  }
  return tags.find((t) => t.toLowerCase() === `${base}-${base}`) ?? tags[0]
}

/**
 * What the picker offers, from what the build allows: one row per language.
 *
 * Two spellings reach the box. A template offers two-letter codes (`en`, `ru`) and the row IS the
 * code. A Joomla build offers the tags its language packs carry, lowercased by the questionnaire
 * (`en-gb`, `en-us`, `en-au`, `zh-cn`, `zh-tw`, `pt-br`): those collapse to one row per language —
 * five Englishes read as five near-identical rows (Lee, 24/09/2026) — and the row carries one tag
 * (`representative`). Chinese stays two rows, Simplified and Traditional, because those are two
 * scripts. Rows keep the CODES order so the first six are still the common ones. No offer at all
 * means the two-letter list.
 * @param {readonly string[] | undefined} allowed
 * @param {readonly string[]} [picked] what is already chosen — a row stands for the picked tag
 * @returns {{ code: string, label: string, search: string }[]}
 */
export function rowsFor(allowed, picked = []) {
  if (allowed === undefined) return CODES.map(rowOf)
  if (!allowed.some((a) => a.includes('-'))) {
    // 🔒 EVERY CODE OFFERED IS A ROW, NOT ONLY THE ONES THE SHORTLIST KNOWS. `CODES` orders the
    // box; it is not a list of what may be chosen. Tracy Business offers the 40 locales it ships,
    // and filtering them through `CODES` drew 37 — Belarusian, Georgian and Norwegian Bokmal (`be`,
    // `ka`, `nb`) were shipped by the template and could not be picked (measured 23/09/2026). The
    // codes `CODES` knows keep its order; the rest follow in the order they were offered.
    const offered = [...new Set(allowed)]
    const known = CODES.filter((c) => offered.includes(c))
    const extra = offered.filter((a) => !CODES.includes(a))
    return [...known, ...extra].map(rowOf)
  }
  /** @type {Map<string, string[]>} */
  const groups = new Map()
  for (const tag of allowed) {
    const key = rowKey(tag)
    const list = groups.get(key) ?? []
    if (!list.includes(tag)) list.push(tag)
    groups.set(key, list)
  }
  const rank = new Map(CODES.map((c, i) => [c, i]))
  /** @param {string} key */
  const at = (key) => rank.get(baseOf(key)) ?? CODES.length
  return [...groups.keys()]
    .sort((a, b) => at(a) - at(b) || a.localeCompare(b))
    .map((key) => rowOf(representative(/** @type {string[]} */ (groups.get(key)), picked)))
}
