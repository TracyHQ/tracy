/**
 * A STYLESHEET THE AGENT WRITES IS CHECKED ON THE PAGE BEFORE ANYONE CALLS IT DONE (follow-up to
 * TracyHQ/tch#1710 / PR #1713, 25/10/2026).
 *
 * 🔒 WHY. On dev `wp-tracy-ai` (theme `tracy`) the customer asked for one rule "at the end of the active
 * theme's custom CSS file (style.css)". The agent appended it to `wp-content/themes/tracy/style.css`, the
 * Site changes card said "Design · 1 file", and it answered "Done" with a note that a theme update may
 * replace the file. The home page links no `style.css` at all — it loads the theme's
 * `assets/css/app-pair.css` and `assets/css/marketing.css` and WooCommerce's sheets — so the rule never
 * reached the page. The rule "CSS the page does not load is not done" was in the prompt; the model did
 * not follow it. #1713 made the same check mechanical for Additional CSS only (`additional-css-check.mjs`);
 * this is the check for a FILE, on every platform, by behaviour and never by theme or template name.
 *
 * WHAT IS READ. The page the customer has open (else the home page), its server HTML, through the one
 * page-read road (`page.mjs` `fetchPageHtml`), and then — only when no `<link>` names the file — the
 * page's own stylesheets, at most {@link CSS_SHEETS_READ_MAX}, through the same road. The file is loaded
 * when:
 * - a `<link rel="stylesheet">` (or `rel="preload" as="style"`, the swap optimisers print) names it, its
 *   query string ignored (`?ver=…`, Joomla's asset hash);
 * - a loaded sheet, or a `<style>` of the page, `@import`s it (one level);
 * - a `<style>` of the page or a loaded sheet holds a rule the write added — a combined or optimised
 *   sheet (Joomla T4's `media/t4/optimize/`, WordPress concatenation, Astro's bundle or its inlined
 *   `<style>`): the same selector, with every property the written rule sets. Values are not compared:
 *   minifiers rewrite them (`#ffffff` → `#fff`, `0px` → `0`).
 * WHEN. WordPress and Joomla serve a written file at once: the check runs as the call ends and its
 * answer rides on the tool result. EmDash serves `/app` only after `site.rebuild` (Astro builds the
 * sources and copies `public/`), so its writes wait for the next rebuild of that site and the rebuild's
 * result carries the answer.
 *
 * 🔒 NEVER A REFUSAL: the write landed and stays (its look undo too); nothing here fails a call. A page
 * that cannot be read is "unchecked", never "loaded". Pure, but for `read`.
 */
import path from 'node:path'

/** The warning code of a written stylesheet the page does not load. */
export const CSS_FILE_NOT_LOADED = 'CSS_FILE_NOT_LOADED'

/** The longest the whole check may take; past it the answer says the page was not checked. */
export const CSS_FILE_BUDGET_MS = 10_000

/** The most stylesheets of the page read for an `@import` or a combined rule. */
export const CSS_SHEETS_READ_MAX = 24

/** How many of them are read at once. */
const CSS_SHEETS_PARALLEL = 6

/** The most stylesheets the page loads that an answer names. */
const LOADS_NAMED = 6

/** Where a site's webroot stands in its web container: its own mount, and the site folder's copy. */
const CONTAINER_WEBROOT = '/var/www/html/'

/**
 * @typedef {{ file: string, url: string | null, built: boolean }} ServedCss
 * `file`: the name the answer says (webroot-relative, or `/app/…`); `url`: the path a page links it by,
 * null for a source a build compiles; `built`: served only after a build (EmDash `/app`).
 * @typedef {{ selector: string, props: string[] }} WrittenRule
 * @typedef {{ served: ServedCss, rules: WrittenRule[] | null }} WrittenCss
 * `rules`: the rules the write added or changed; null when the file could not be read.
 * @typedef {{ file: string, state: 'loaded', by: 'link' | 'import' | 'rule', sheet: string }
 *   | { file: string, state: 'not loaded' }
 *   | { file: string, state: 'unchecked' }} FileVerdict
 * @typedef {(path: string) => Promise<{ ok: boolean, html?: string, contentType?: string } & Record<string, unknown>>} Read
 */

/**
 * Where a stylesheet a call wrote is served, or null when it is not a served `.css` of the site (a
 * `.scss` source, a note in the site folder, a build's output).
 * @param {string} file - as the call names it inside the site's container: absolute, or relative to `workdir`.
 * @param {{ workdir: string, label: string }} at
 * @returns {ServedCss | null}
 */
export function servedCss(file, { workdir, label }) {
  if (typeof file !== 'string' || !/\.css$/i.test(file)) return null
  const abs = file.startsWith('/') ? path.posix.normalize(file) : path.posix.resolve(workdir || '/', file)
  const site = `/site/${label}/`
  const webroot = abs.startsWith(CONTAINER_WEBROOT)
    ? abs.slice(CONTAINER_WEBROOT.length)
    : abs.startsWith(`${site}.webroot/`)
      ? abs.slice(`${site}.webroot/`.length)
      : null
  if (webroot !== null) return webroot === '' ? null : { file: webroot, url: `/${webroot}`, built: false }
  // EmDash: the template source in its container (`/app`) or the site folder's copy (`template/`)
  const app = abs.startsWith('/app/')
    ? abs.slice('/app/'.length)
    : abs.startsWith(`${site}template/`)
      ? abs.slice(`${site}template/`.length)
      : null
  if (app === null) return null
  const shown = abs.startsWith('/app/') ? abs : `template/${app}`
  if (app.startsWith('public/')) return { file: shown, url: `/${app.slice('public/'.length)}`, built: true }
  if (app.startsWith('src/')) return { file: shown, url: null, built: true }
  return null
}

/** CSS with comments gone and whitespace that carries no meaning taken out (as `additional-css-check.mjs`). @param {string} css */
const flat = (css) =>
  String(css)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~()])\s*/g, '$1')
    .trim()

/**
 * Every innermost rule of a stylesheet's text: its selectors (split at top-level commas) and the
 * properties it sets. At-rules that are not rules (`@font-face`, keyframe steps) are left out: their
 * "selector" names no element.
 * @param {string} css
 * @returns {{ key: string, selectors: string[], props: string[] }[]}
 */
export function cssRules(css) {
  /** @type {{ key: string, selectors: string[], props: string[] }[]} */
  const out = []
  for (const m of flat(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // what stands before the selector inside the same run (`@import …;`, `@charset …;`) is not it
    const selector = m[1].slice(m[1].lastIndexOf(';') + 1).trim()
    if (selector === '' || selector.startsWith('@') || /^(?:from|to|[\d.]+%)(?:,|$)/.test(selector)) continue
    const props = [
      ...new Set(
        m[2]
          .split(';')
          .map((d) => d.slice(0, d.indexOf(':')).trim().toLowerCase())
          .filter((p) => p !== '' && !p.includes(' '))
      )
    ]
    out.push({ key: `${selector}{${m[2].replace(/;$/, '')}}`, selectors: splitSelectors(selector), props })
  }
  return out
}

/** A selector list split at its top-level commas (never inside `:is(…)` or `[a="b,c"]`). @param {string} s */
function splitSelectors(s) {
  /** @type {string[]} */
  const out = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]
    if (quote !== '') {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1)
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(s.slice(start).trim())
  return out.filter((x) => x !== '')
}

/**
 * The rules a write added or changed: those of `after` that `before` did not have, whole. A file that
 * did not exist before (`null`) — every rule of it. `after` not read: null, nothing to look for.
 * @param {string | null | undefined} before
 * @param {string | null | undefined} after
 * @returns {WrittenRule[] | null}
 */
export function writtenRules(before, after) {
  if (typeof after !== 'string') return null
  const had = new Set(typeof before === 'string' ? cssRules(before).map((r) => r.key) : [])
  /** @type {Map<string, WrittenRule>} */
  const out = new Map()
  for (const r of cssRules(after))
    if (!had.has(r.key) && r.selectors.length > 0)
      out.set(`${r.selectors[0]}|${r.props.join(',')}`, { selector: r.selectors[0], props: r.props })
  return [...out.values()]
}

/**
 * The stylesheets a page's HTML loads, in document order (a `<link rel="stylesheet">`, or a preload
 * `as="style"` that an optimiser swaps in), and the bodies of its `<style>` elements. `href` is the path
 * and query on this site (its host dropped, resolved against `page`); `own` says it is this site's
 * (a relative address), else another host's that may still be this site under its public name.
 * @param {string} html
 * @param {string} page
 * @returns {{ links: { href: string, path: string, own: boolean }[], styles: string[] }}
 */
export function pageSheets(html, page) {
  const text = String(html).slice(0, 2 * 1024 * 1024)
  const base = `http://page.invalid${page.startsWith('/') ? page : `/${page}`}`
  /** @type {{ href: string, path: string, own: boolean }[]} */
  const links = []
  for (const m of text.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = m[1]
    const attr = (/** @type {string} */ name) =>
      new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
    const value = (/** @type {RegExpExecArray | null} */ a) =>
      a === null ? '' : (a[1] ?? a[2] ?? a[3] ?? '')
    const rel = value(attr('rel')).toLowerCase().split(/\s+/)
    const sheet =
      rel.includes('stylesheet') || (rel.includes('preload') && /^style$/i.test(value(attr('as'))))
    const href = value(attr('href')).replace(/&amp;/g, '&').trim()
    if (!sheet || href === '' || /^(?:data|javascript):/i.test(href)) continue
    let u
    try {
      u = new URL(href, base)
    } catch {
      continue
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    const one = { href: u.pathname + u.search, path: decoded(u.pathname), own: u.hostname === 'page.invalid' }
    if (!links.some((l) => l.href === one.href)) links.push(one)
  }
  const styles = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1])
  return { links, styles }
}

/** A path with its escapes read, or as it is when they do not decode. @param {string} p */
function decoded(p) {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}

/**
 * Whether a path a page loads is the written file's: the same path, or — for a path deep enough that
 * no other file shares its tail (three segments: `/wp-content/themes/<t>/…`) — the same path under the
 * folder a site is installed in (`/blog/wp-content/…`).
 * @param {string} loaded @param {string} url
 */
export function samePath(loaded, url) {
  if (loaded === url) return true
  return url.split('/').filter(Boolean).length >= 3 && loaded.endsWith(url)
}

/**
 * The `@import`s of a stylesheet's text, each resolved against the sheet's own path.
 * @param {string} css @param {string} from - the sheet's path (the page's, for a `<style>`).
 * @returns {string[]}
 */
export function cssImports(css, from) {
  const base = `http://page.invalid${from.startsWith('/') ? from : `/${from}`}`
  /** @type {string[]} */
  const out = []
  for (const m of String(css).matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
    try {
      out.push(decoded(new URL(m[1], base).pathname))
    } catch {
      // an address that does not parse imports nothing
    }
  }
  return out
}

/**
 * Whether a stylesheet's text holds a written rule: a rule with that selector among its selectors and
 * every property the written one sets.
 * @param {string} css @param {WrittenRule[]} rules
 */
export function holdsRule(css, rules) {
  if (rules.length === 0) return false
  const have = cssRules(css)
  return rules.some((w) =>
    have.some((r) => r.selectors.includes(w.selector) && w.props.every((p) => r.props.includes(p)))
  )
}

/**
 * The stylesheets of the page closest to the written file first: the ones in the deepest folder they
 * share with it (the same theme's or template's own folder), then the page's order.
 * @param {string[]} loads @param {string | null} url
 */
function closestFirst(loads, url) {
  if (url === null) return loads
  const parts = url.split('/')
  const shared = (/** @type {string} */ p) => {
    const q = p.split('/')
    let n = 0
    while (n < q.length - 1 && n < parts.length - 1 && q[n] === parts[n]) n += 1
    return n
  }
  return loads
    .map((p, i) => ({ p, i, n: shared(p) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.p)
}

/**
 * Whether the page loads each written stylesheet. One read of the page; the page's own sheets are read
 * only when a `<link>` does not settle it, each at most once for all the files.
 * @param {object} input
 * @param {WrittenCss[]} input.files
 * @param {string} input.page - the path read.
 * @param {Read} input.read
 * @param {number} [input.budgetMs]
 * @returns {Promise<{ verdicts: FileVerdict[], loads: string[] }>}
 */
export async function cssFilesLoaded({ files, page, read, budgetMs = CSS_FILE_BUDGET_MS }) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve('late'), budgetMs)
  })
  const unchecked = () => ({
    verdicts: files.map((f) => /** @type {FileVerdict} */ ({ file: f.served.file, state: 'unchecked' })),
    loads: /** @type {string[]} */ ([])
  })
  try {
    const got = await Promise.race([judge({ files, page, read }), late])
    return got === 'late' ? unchecked() : /** @type {{ verdicts: FileVerdict[], loads: string[] }} */ (got)
  } catch {
    return unchecked()
  } finally {
    clearTimeout(timer)
  }
}

/** @param {{ files: WrittenCss[], page: string, read: Read }} input */
async function judge({ files, page, read }) {
  const got = await read(page)
  if (got?.ok !== true || typeof got.html !== 'string')
    return {
      verdicts: files.map((f) => /** @type {FileVerdict} */ ({ file: f.served.file, state: 'unchecked' })),
      loads: []
    }
  const { links, styles } = pageSheets(got.html, page)
  const loads = links.map((l) => l.path)
  /** @type {Map<string, Promise<string | null>>} */
  const sheets = new Map()
  // this site's own sheets first, then another host's that may be this site under its public name
  const toRead = [...links.filter((l) => l.own), ...links.filter((l) => !l.own)].slice(0, CSS_SHEETS_READ_MAX)
  let running = 0
  /** @type {(() => void)[]} */
  const waiting = []
  const sheetText = (/** @type {{ href: string }} */ l) => {
    const had = sheets.get(l.href)
    if (had !== undefined) return had
    const work = (async () => {
      if (running >= CSS_SHEETS_PARALLEL)
        await new Promise((resolve) => waiting.push(() => resolve(undefined)))
      running += 1
      try {
        const r = await read(l.href)
        if (r?.ok !== true || typeof r.html !== 'string') return null
        // a page that answers in place of a sheet (a 404 the CMS renders) is read, and holds no CSS
        if (typeof r.status === 'number' && r.status >= 400) return ''
        if (typeof r.contentType === 'string' && /html/i.test(r.contentType)) return ''
        return r.html
      } catch {
        return null
      } finally {
        running -= 1
        waiting.shift()?.()
      }
    })()
    sheets.set(l.href, work)
    return work
  }
  /** @type {FileVerdict[]} */
  const verdicts = []
  for (const f of files) {
    const { url } = f.served
    const name = f.served.file
    const linked = url === null ? undefined : links.find((l) => samePath(l.path, url))
    if (linked !== undefined) {
      verdicts.push({ file: name, state: 'loaded', by: 'link', sheet: linked.path })
      continue
    }
    if (url !== null && styles.some((s) => cssImports(s, page).some((p) => samePath(p, url)))) {
      verdicts.push({ file: name, state: 'loaded', by: 'import', sheet: `<style> of ${page}` })
      continue
    }
    const rules = f.rules ?? []
    if (rules.length > 0 && styles.some((s) => holdsRule(s, rules))) {
      verdicts.push({ file: name, state: 'loaded', by: 'rule', sheet: `<style> of ${page}` })
      continue
    }
    const texts = await Promise.all(toRead.map(async (l) => ({ l, css: await sheetText(l) })))
    const imported =
      url === null
        ? undefined
        : texts.find((t) => t.css !== null && cssImports(t.css, t.l.path).some((p) => samePath(p, url)))
    if (imported !== undefined) {
      verdicts.push({ file: name, state: 'loaded', by: 'import', sheet: imported.l.path })
      continue
    }
    const holding =
      rules.length === 0 ? undefined : texts.find((t) => t.css !== null && holdsRule(t.css, rules))
    if (holding !== undefined) {
      verdicts.push({ file: name, state: 'loaded', by: 'rule', sheet: holding.l.path })
      continue
    }
    // nothing to look for in a combined sheet (the file was not read), a sheet that did not answer, or
    // sheets past the bound: not settled either way
    const unread = texts.some((t) => t.css === null) || links.length > toRead.length
    verdicts.push({ file: name, state: f.rules === null || unread ? 'unchecked' : 'not loaded' })
  }
  return { verdicts, loads }
}

/**
 * What the agent reads after the write: a short JSON block for the tool result.
 * - every file loaded → `cssFile: "loaded"` and by what;
 * - one not loaded → `cssFile: "not loaded"`, a {@link CSS_FILE_NOT_LOADED} warning per file, the
 *   stylesheets the page does load (the written file's own folder first), and a `next` that says it is
 *   not done and asks the customer — in plain words — where the rule should go;
 * - not settled → `cssFile: "unchecked"`, and the `next` asks for the check by hand.
 * @param {{ verdicts: FileVerdict[], loads: string[] }} found
 * @param {{ page: string, files: WrittenCss[] }} input
 * @returns {Record<string, unknown> | null} null when nothing was checked.
 */
export function cssFileAnswer({ verdicts, loads }, { page, files }) {
  if (verdicts.length === 0) return null
  const missing = verdicts.filter((v) => v.state === 'not loaded')
  const unsure = verdicts.filter((v) => v.state === 'unchecked')
  const loaded = verdicts.filter((v) => v.state === 'loaded')
  /** @type {Record<string, unknown>} */
  const answer = {
    cssFile: missing.length > 0 ? 'not loaded' : unsure.length > 0 ? 'unchecked' : 'loaded',
    page
  }
  if (loaded.length > 0)
    answer.loaded = loaded.map((v) => {
      if (v.state !== 'loaded') return v.file
      const by =
        v.by === 'link' ? 'linked' : v.by === 'import' ? `@import in ${v.sheet}` : `its rule is in ${v.sheet}`
      return `${v.file} (${by})`
    })
  if (missing.length > 0) {
    const url = files.find((f) => f.served.file === missing[0].file)?.served.url ?? null
    const named = closestFirst(
      loads.filter((p) => !missing.some((m) => samePath(p, `/${m.file}`))),
      url
    ).slice(0, LOADS_NAMED)
    answer.warnings = missing.map((v) => ({
      code: CSS_FILE_NOT_LOADED,
      file: v.file,
      page,
      message: `${page} does not load ${v.file}: no <link> or @import on the page reaches it, and no stylesheet of the page holds the rule written. The file is saved, but the rule does not show there.`
    }))
    answer.loads = named
    const where =
      named.length > 0
        ? `a stylesheet this page does load (${named.slice(0, 3).join(', ')})`
        : 'the place this page takes its look from (it links no stylesheet of its own)'
    answer.next = `Do not tell the customer it is done. Tell them in plain words that this page does not use ${missing.length === 1 ? 'that file' : 'those files'}, and ask whether to put the rule in ${where} instead; after they say where, write it there and read it back with page.look.`
  } else if (unsure.length > 0)
    answer.next = `The page could not be checked for ${unsure.map((v) => v.file).join(', ')}: page.look {path:"${page}", style:{selector:"<the rule's selector>"}} says whether the page loads the rule. Say it is done only when it does.`
  return answer
}
