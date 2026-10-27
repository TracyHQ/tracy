/**
 * The brand facts of a released WordPress quickstart, measured on its restored stand
 * (`scripts/brand-facts.mjs`, a step of `release-measure.mjs`): the facts a row of
 * `apps/tracy-web/src/lib/template-profiles.json` holds, read off the page instead of written by hand.
 *
 * WHY: every version needs an exact profile row, because "a re-release whose logo spot moved would inherit a
 * stale answer". A patch release copies the previous row only when these facts, measured on BOTH versions, are
 * equal (`packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs`); any difference stops it.
 *
 * Each fact comes from one probe on the home page at 1440 px, light scheme, the stand's options changed through
 * wp-cli and put back after:
 *   spots       every logo spot of the page: the option it reads (`site_logo` or `tracy_logo_dark`), found by
 *               pointing each option at another image of the release's own library and seeing which `<img>`
 *               shows it; `where` is the spot's wrapper (`header`, `footer`, `main`) and its classes
 *   logos       `pair` (spots read both options), `dark` (only `tracy_logo_dark`), `single` (only `site_logo`),
 *               or `none`
 *   brandReady  some spot shows the image an option was pointed at
 *   darkLogo    some spot reads `tracy_logo_dark`
 *   nameFallback with both options empty, every spot shows the site title as text
 *   faviconReady with `site_icon` pointed at an image, a `<link rel~="icon">` names it
 *   favicons    the number of `<link rel~="icon">` the page prints then
 *   frame       the rendered box (CSS px, rounded) of the first visible logo in the demo state
 *   heightHeld  with the first spot's option pointed at an image of another shape, the logo keeps the frame's
 *               height (the template holds the height; false = the picture's own shape sets it, `logoHeight`)
 * Each document names its tag, version and `themeFiles` (`themeFilesHash` of the theme folder on the stand), so a
 * copy from another version or a measurement of another build is refused (`brandFactsProblem`).
 * Not measured here: `framework`, `profiles`, `darkSpots` (Joomla only), `footerSlot` (a contract slot, not a
 * page fact), `unverified` and `note` (words).
 */

import { createHash } from 'node:crypto'

export const BRAND_FACTS_SCHEMA = 'tracy-brand-facts/wordpress/v1'
export const BRAND_FACTS_FILE = 'brand-facts.json'

/**
 * The page probe: every `<img>` that is a logo candidate (in a Site Logo block, a `custom-logo` link, or whose
 * src names one of `marks`), with the box it renders at and its wrapper; the icon links; the site title text in
 * each candidate wrapper. Runs in the page; returns plain data.
 * @param {{ marks: string[], title: string, wrappers?: string[] }} input
 */
export const logoProbe = ({ marks, title, wrappers = [] }) => `(() => {
  const marks = ${JSON.stringify(marks)}
  const title = ${JSON.stringify(title)}
  const wanted = ${JSON.stringify(wrappers)}
  const region = (el) => el.closest('header, footer, main, aside, nav')?.tagName.toLowerCase() ?? 'body'
  // the spot: its Site Logo block, else what holds a classic theme's custom-logo link; an <img> and the text a
  // theme prints in its place both sit in it, so a spot is found again whichever it shows
  const wrapperOf = (el) => el.closest('.wp-block-site-logo') ?? el.closest('.custom-logo-link')?.parentElement ?? el.parentElement
  const keyOf = (w) => region(w) + ' ' + [...w.classList].filter((c) => !/^wp-container-|^is-|^has-/.test(c)).sort().join('.')
  const seen = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const imgs = [...document.querySelectorAll('img')].filter((i) =>
    i.closest('.wp-block-site-logo, .custom-logo-link') || i.classList.contains('custom-logo') ||
    marks.some((m) => m && (i.currentSrc || i.src).includes(m)))
  const logos = imgs.map((i) => {
    const r = i.getBoundingClientRect()
    return { wrapper: keyOf(wrapperOf(i)), src: i.currentSrc || i.src, width: Math.round(r.width), height: Math.round(r.height), visible: seen(i) }
  })
  const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => ({ rel: l.rel, href: l.href }))
  const all = [...new Set([...document.querySelectorAll('.wp-block-site-logo, .custom-logo-link, [class*="logo"]')].map(wrapperOf).concat([...document.querySelectorAll('.wp-block-site-logo')]))]
  const texts = Object.fromEntries(wanted.map((k) => {
    const w = all.find((e) => keyOf(e) === k)
    return [k, w ? { text: w.textContent.replace(/\\s+/g, ' ').trim(), img: !!w.querySelector('img'), title: w.textContent.includes(title) } : null]
  }))
  return { logos, icons, texts }
})()`

/** The file part of an upload URL without its size suffix and extension (`logo-150x150.png` → `logo`). */
export const stemOf = (/** @type {string} */ url) =>
  String(url ?? '')
    .split('?')[0]
    .split('/')
    .pop()
    ?.replace(/\.[a-z0-9]+$/i, '')
    .replace(/-(\d+x\d+|scaled|rotated)$/i, '') ?? ''

/**
 * The facts from the probes' answers. Pure, so the test feeds it answers.
 * @param {{
 *   demo: { logos: any[], icons: any[] },
 *   marked: { logos: any[], icons: any[] },
 *   marks: { site_logo: string, tracy_logo_dark: string, site_icon: string },
 *   cleared: { texts: Record<string, { text: string, img: boolean, title: boolean } | null> },
 *   reshaped: { logos: any[] } | null,
 *   reshapedMark: string | null
 * }} answers
 */
export function brandFactsOf({ demo, marked, marks, cleared, reshaped, reshapedMark }) {
  /** @type {Record<string, string>} */
  const spotOption = {}
  for (const l of marked.logos)
    for (const option of /** @type {const} */ (['site_logo', 'tracy_logo_dark']))
      if (marks[option] && stemOf(l.src) === marks[option]) spotOption[l.wrapper] ??= option
  const spots = Object.entries(spotOption)
    .map(([where, option]) => ({ where, option }))
    .sort((a, b) => a.where.localeCompare(b.where))
  const reads = new Set(spots.map((s) => s.option))
  const logos =
    reads.has('site_logo') && reads.has('tracy_logo_dark')
      ? 'pair'
      : reads.has('tracy_logo_dark')
        ? 'dark'
        : reads.has('site_logo')
          ? 'single'
          : 'none'
  const first = demo.logos.find((l) => l.visible)
  const frame = first ? { width: first.width, height: first.height } : null
  const nameFallback =
    spots.length > 0 &&
    spots.every((s) => cleared.texts[s.where]?.title === true && !cleared.texts[s.where]?.img)
  const icons = marked.icons.filter((i) => /(^|\s)icon(\s|$)/.test(i.rel))
  const faviconReady = !!marks.site_icon && icons.some((i) => stemOf(i.href).startsWith(marks.site_icon))
  let heightHeld = null
  if (frame && reshaped && reshapedMark) {
    const shown = reshaped.logos.find((l) => l.visible && stemOf(l.src) === reshapedMark)
    heightHeld = shown ? Math.abs(shown.height - frame.height) <= 1 : null
  }
  return {
    spots,
    logos,
    brandReady: spots.length > 0,
    darkLogo: reads.has('tracy_logo_dark'),
    nameFallback,
    faviconReady,
    favicons: icons.length,
    frame,
    heightHeld
  }
}

/** The spot to reshape: the first whose marked logo is visible in the light scheme at 1440 (a dark spot is hidden there). */
export const visibleSpotOf = (
  /** @type {{ spots: { where: string, option: string }[] }} */ facts,
  /** @type {{ logos: any[] }} */ marked
) => facts.spots.find((s) => marked.logos.some((l) => l.wrapper === s.where && l.visible)) ?? null

/** The facts that decide a profile row; `spots` stays as evidence of where they were read. */
export const ROW_FACTS = Object.freeze([
  'logos',
  'brandReady',
  'darkLogo',
  'nameFallback',
  'faviconReady',
  'favicons',
  'frame',
  'heightHeld',
  'spots'
])

/**
 * Every way two measured brand-fact documents differ, as sentences; empty when a row may be carried.
 * @param {any} previous @param {any} next
 */
export function brandFactDifferences(previous, next) {
  const out = []
  for (const doc of [previous, next])
    if (doc?.schemaVersion !== BRAND_FACTS_SCHEMA)
      return [`${doc?.version ?? 'a version'}: not a ${BRAND_FACTS_SCHEMA} document`]
  for (const k of ROW_FACTS) {
    const a = JSON.stringify(previous.facts?.[k] ?? null)
    const b = JSON.stringify(next.facts?.[k] ?? null)
    if (a !== b) out.push(`${k}: ${previous.version} ${a}, ${next.version} ${b}`)
  }
  return out
}

/**
 * One hash of a theme's files, `path → sha256` with webroot-relative paths (`wp-content/themes/<theme>/…`): the shape
 * of a presentation lock's `files`, so the theme a stand measured is compared with the theme a version's committed
 * lock was cut from.
 * @param {Record<string, string>} files
 */
export function themeFilesHash(files) {
  const sorted = Object.fromEntries(
    Object.keys(files ?? {})
      .sort()
      .map((k) => [k, files[k]])
  )
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

/**
 * Why a `brand-facts.json` is not the measurement of this version, or null: it must name the version's own tag and
 * version, and the theme it measured must be the theme the version's committed presentation lock holds (a copy from
 * another version, or a measurement of another build, fails here).
 * @param {any} doc @param {{ tag: string, version: string, lock: any }} version
 */
export function brandFactsProblem(doc, { tag, version, lock }) {
  if (!doc) return `${BRAND_FACTS_FILE} is missing`
  if (doc.schemaVersion !== BRAND_FACTS_SCHEMA)
    return `${BRAND_FACTS_FILE} is not a ${BRAND_FACTS_SCHEMA} document`
  if (doc.tag !== tag || doc.version !== version)
    return `${BRAND_FACTS_FILE} measured ${doc.tag}@${doc.version}, not ${tag}@${version}`
  if (!lock?.files || doc.themeFiles !== themeFilesHash(lock.files))
    return `${BRAND_FACTS_FILE} measured another theme than the one presentation-lock.json of ${version} holds`
  return null
}
