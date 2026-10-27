/**
 * The fonts a Joomla release serves, read off its pages (PURE: the caller fetches). A rebuilt
 * quickstart whose merged T4 stylesheet (`media/t4/optimize`) lost `--body-font-family`, or whose
 * `@font-face` files no longer answer, ships the wrong face while every colour check stays green
 * (JA Vital / JA Tour / JA Symphony write their faces as literals, so the variable is not asked of
 * every template: a release is judged against the version it replaces).
 */

const FONT_FILE = /\.(woff2?|ttf|otf|eot)(\?[^"')]*)?$/i

/**
 * The stylesheet URLs a page links, absolute, in document order (one of each).
 * @param {string} html
 * @param {string} pageUrl  the page's own URL, for relative hrefs
 */
export function stylesheetsOf(html, pageUrl) {
  const out = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel\s*=\s*["']?[^"'>]*\bstylesheet\b/i.test(tag)) continue
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? /\bhref\s*=\s*([^\s"'>]+)/i.exec(tag)?.[1]
    if (!href) continue
    try {
      const abs = new URL(href.replace(/&amp;/g, '&'), pageUrl).href
      if (!out.includes(abs)) out.push(abs)
    } catch {
      /* a malformed href is not a stylesheet */
    }
  }
  return out
}

/**
 * The font files one stylesheet loads (`@font-face { src: url(...) }` and any other font url), absolute.
 * @param {string} css
 * @param {string} cssUrl  the sheet's URL, for relative urls
 */
export function fontUrlsOf(css, cssUrl) {
  const out = []
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const raw = m[2].trim()
    if (raw.startsWith('data:') || !FONT_FILE.test(raw.split('#')[0])) continue
    try {
      const abs = new URL(raw, cssUrl).href
      if (!out.includes(abs)) out.push(abs)
    } catch {
      /* skip */
    }
  }
  return out
}

/**
 * What one served page says about its fonts. `sheets` is the stylesheet text by URL (missing = not fetched).
 * @param {{ html: string, pageUrl: string, sheets: Record<string, string | null>, fontStatus: Record<string, string> }} page
 *   `fontStatus`: the HTTP status the caller got for each font URL (by `fontUrlsOf`)
 * @returns {{ sheets: string[], bodyFontVar: boolean, fonts: { url: string, status: string, sameHost: boolean }[] }}
 */
export function fontReport({ html, pageUrl, sheets, fontStatus }) {
  const links = stylesheetsOf(html, pageUrl)
  const host = new URL(pageUrl).host
  const texts = links.map((u) => sheets[u] ?? '')
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
  // the variable T4 writes for the body face (templates/<tpl>/css/… via the merged optimize sheet)
  const bodyFontVar = [...texts, ...inline].some((t) => /--body-font-family\s*:/.test(t))
  const fonts = []
  links.forEach((u, i) => {
    for (const f of fontUrlsOf(texts[i], u))
      if (!fonts.some((x) => x.url === f))
        fonts.push({ url: f, status: fontStatus[f] ?? 'unchecked', sameHost: new URL(f).host === host })
  })
  for (const t of inline)
    for (const f of fontUrlsOf(t, pageUrl))
      if (!fonts.some((x) => x.url === f))
        fonts.push({ url: f, status: fontStatus[f] ?? 'unchecked', sameHost: new URL(f).host === host })
  return { sheets: links, bodyFontVar, fonts }
}

/**
 * A rebuilt version against the one it replaces: it may not lose the body font variable the released
 * version had, and every font file it serves from its own host must answer 200. Fonts the released
 * version itself failed to serve are the release's, not this build's.
 * @param {ReturnType<typeof fontReport>} was  the version as released
 * @param {ReturnType<typeof fontReport>} now  the rebuilt version
 * @returns {{ ok: boolean, problems: string[], bodyFontVar: { was: boolean, now: boolean }, fonts: { was: number, now: number, broken: string[] } }}
 */
export function compareFonts(was, now) {
  const problems = []
  if (was.bodyFontVar && !now.bodyFontVar)
    problems.push('--body-font-family is in the released stylesheets and missing from this build')
  const wasBroken = new Set(
    was.fonts.filter((f) => f.sameHost && f.status !== '200').map((f) => f.url.split('/').at(-1))
  )
  const broken = now.fonts
    .filter((f) => f.sameHost && f.status !== '200' && !wasBroken.has(f.url.split('/').at(-1)))
    .map((f) => `${f.url} ${f.status}`)
  for (const b of broken) problems.push(`font file does not answer: ${b}`)
  if (was.fonts.length && !now.fonts.length)
    problems.push('the released version loads font files, this build loads none')
  return {
    ok: problems.length === 0,
    problems,
    bodyFontVar: { was: was.bodyFontVar, now: now.bodyFontVar },
    fonts: { was: was.fonts.length, now: now.fonts.length, broken }
  }
}
