/**
 * ONE CALL FOR A LOOK CHANGE — `tracy_site` `look.set {path, target, props, scope, viewport?}`
 * (PR #926, 05/10/2026). It reads the element the way `page.look {style}` does (the browser's own
 * cascade: the winning rule, its stylesheet, the `var(--token)` behind it), writes the change where
 * that reading says it belongs, keeps a look undo (`look-undo.mjs`) and reads the element again, so
 * the answer carries the values before and after.
 *
 * 🔒 WHY (flow D, 55 runs on the three bench sites, 05/10/2026). A style request was a hunt: "make
 * this one button blue" took 24 calls on WordPress, "hide it on phones" 15–20, "change the primary
 * colour except on Contact" 72 calls and 2.2M tokens on Joomla — docs, SCSS, compiled CSS, T4's
 * bundle and curl'd pages grepped, files edited (three refused for not being read first), a compile,
 * then `page.look` nine times. Everything those calls found, `page.look` had already named in its
 * first answer; what was missing was a door that writes from it.
 *
 * WHERE EACH SCOPE WRITES (the roads `site-context.mjs` `LOOK_ROAD` describes, decided from the
 * reading, never from a template's names):
 * - 🔒 WORDPRESS: EVERY WRITE GOES INTO THE SITE'S ADDITIONAL CSS (09/10/2026), never a theme file.
 *   Tracy's WordPress themes switch on their own auto-update (`tracy-wordpress-theme/src/<t>/inc/
 *   update.php`, `auto_update_theme` true for themselves) and a third-party theme updated by its
 *   owner is replaced the same way, so a rule appended to `sections.css` or a value edited in
 *   `theme.json` vanished at the next theme release, silently, on every site with no child theme.
 *   Additional CSS is the `custom_css` post of the theme the site runs (`wp_update_custom_css_post`,
 *   what the Customizer's panel writes): in the database, kept across theme updates, no theme switch.
 *   WHERE WORDPRESS PRINTS IT decides how specific a rule there must be (read on WordPress 7.1.2,
 *   `wp-includes/script-loader.php` `wp_enqueue_global_styles`, and its front page):
 *   - a CLASSIC theme: its own `<style id="wp-custom-css">` in `wp_head` at priority 101
 *     (`wp_custom_css_cb`), after every stylesheet WordPress enqueued and the global-styles inline
 *     CSS — a rule there stands after the sheet of any rule that wins now, so the selector rules below
 *     (at least as specific) hold as they are;
 *   - a BLOCK theme (Tracy's): merged INTO `global-styles-inline-css`, after the theme.json variables
 *     and before the theme's own stylesheets (`style.css`, `assets/css/*.css`) — so a rule whose winner
 *     stands in a sheet printed after global styles is made MORE specific than that winner
 *     ({@link beyond}), and wins on specificity instead of order.
 *   The read of the Additional CSS says which (`block`); a page that already prints
 *   `<style id="wp-custom-css">` names its place itself. A sheet printed in a classic theme's footer
 *   is the one place left that can still stand later: the read after the write catches it
 *   (`LOOK_SET_NO_EFFECT` puts the CSS back). A page that prints the Additional CSS in neither place
 *   is refused before the write (`LOOK_SET_NOT_PRINTED`, {@link additionalCssNotPrinted}).
 *   A token is SET AGAIN there, on the selector that sets it now (global styles' `:root`/`body` for a
 *   `theme.json` value — `--wp--preset--<kind>--<slug>`, `--wp--custom--<a>--<b>` — or the rule of the
 *   theme stylesheet that declares it): the same selector later in the page (made more specific when
 *   that declaration stands in a sheet printed after the Additional CSS), so it wins wherever that
 *   declaration won. Each appended block carries a `/* look.set: … *\/` comment naming the change.
 * - `element` / `page` — a NEW rule appended to a theme or template stylesheet the page loads AT OR
 *   AFTER the sheet of the rule that wins now (WordPress: Additional CSS, above; Joomla: the template's
 *   own customisation file, {@link ownStyleSheet} — T4 `local/css/custom.css` — made more specific
 *   than that rule when its order against it is not known), with a selector at
 *   least as specific as that rule's (more, on a WordPress block theme when that rule's sheet comes
 *   later): so it wins wherever that rule won, and nothing else. `element` is this one element
 *   (`describeTarget`'s `unique`); `page` is every element the winning rule paints. Both are scoped
 *   to this page by the body's own class (`page-id-42`, `item-599`) — except an element of the site's
 *   header or footer, which is the same element on every page. A token prop (`--x`) at page scope is
 *   set on `:root:has(> body.<page>)`, so tokens built from it are rebuilt on that page too.
 * - `site` — the TOKEN the value comes from, changed where it is set (WordPress: set again in Additional
 *   CSS, above): a template stylesheet → that declaration in place; EmDash's build → `src/styles/tokens.css` (then
 *   `global.css`) in the site's container. No token: the winning rule's own selector, appended after it
 *   (every element it paints). A token set where nothing may be edited (T4's bundle, a plugin's sheet)
 *   is set again by its own rule after it, the same way.
 * - `viewport` wraps an appended rule in `@media (max-width: 767.98px)` (phones) or
 *   `(min-width: 768px)` (tablets and desktops), the `md` line of Bootstrap and Tailwind alike.
 *
 * 🔒 WHAT IT REFUSES, AND SAYS SO (CLAUDE.md principle 3), with what it read so the file road needs no
 * second look: EmDash `element`/`page` (its sections are classes in `.astro` views, and its pages carry
 * no class a rule could scope by — the file road of `LOOK_ROAD` is the right one); a page with no class
 * that names it; a token or rule it cannot place; a stylesheet that is not a file of this site's theme
 * or template. Never written: platform core, plugins, uploads, T4's `media/t4/` cache, anything outside
 * the site's served tree (`takeLookSnapshot` checks every path against the site folder, symlinks
 * resolved, before a byte is written).
 *
 * 🔒 A WRITE THAT CHANGED NOTHING IS PUT BACK. When no asked value moved between the two readings
 * (WordPress, Joomla — EmDash is read after its rebuild), the files (WordPress: the Additional CSS) are
 * restored from the undo just taken and the answer is `LOOK_SET_NO_EFFECT` with what still wins: a rule left behind that paints
 * nothing is a trap for the next change.
 */
import {
  ADDITIONAL_CSS,
  cssHash,
  dropLookSnapshot,
  noteLookAfter,
  revertLook,
  takeLookSnapshot
} from './look-undo.mjs'
import { DS_SLOT_SHEET } from './ds-slot-worn.mjs'
import { styleAnswer } from './look-style.mjs'

/** The call's shape, as every refusal spells it. */
export const LOOK_SET_CALL =
  'look.set {path:"/", target:{text:"<its words>"} | {selector, nth?:0 = the first}, props:{"background-color":"#1d4ed8"}, scope:"element"|"page"|"site", viewport?:"mobile"|"desktop"}'

/** Every key `look.set` reads. */
export const LOOK_SET_KEYS = Object.freeze(['path', 'target', 'props', 'scope', 'viewport'])

/** The most properties one call writes. */
export const LOOK_SET_MAX_PROPS = 8

/** Phones, and everything from a portrait tablet up: Bootstrap's and Tailwind's `md` line. */
export const PHONE_MEDIA = '(max-width: 767.98px)'
export const WIDE_MEDIA = '(min-width: 768px)'

/** How the cascade answer names WordPress's Additional CSS (`wp_custom_css_cb` prints it with this id). */
export const WP_CUSTOM_CSS_SHEET = '<style id="wp-custom-css">'

/**
 * 🔒 ADDITIONAL CSS THE PAGE DOES NOT PRINT IS NOT A PLACE TO WRITE (TracyHQ/tch#1710, 25/10/2026).
 * WordPress prints a site's Additional CSS in exactly two places: its own `<style id="wp-custom-css">`
 * (`wp_custom_css_cb`, a classic theme, or a theme that hands it back), or — on a block theme — inside
 * the `global-styles` inline sheet. A page whose theme dequeues `global-styles` (Tracy's design pages
 * did, the seeded home page among them) prints it nowhere, and a rule written there never shows. The
 * Additional CSS the site already has proves it: when it holds something and neither sheet is on the
 * page, the page does not print it. Empty Additional CSS prints nothing anywhere, so that page cannot be
 * judged before the write: the read after it does (`LOOK_SET_NO_EFFECT` puts it back).
 *
 * The answer names the theme stylesheet this page loads last — the place a rule does reach it — and
 * what writing there costs (a theme update replaces the file), so the agent can say both.
 * @param {string[]} sheets - every stylesheet of the page, in document order (`describeTarget`).
 * @param {{ css: string, block?: boolean }} current - the Additional CSS as read.
 * @returns {{ why: string, answer: { code: string, next: string } } | null}
 */
export function additionalCssNotPrinted(sheets, current) {
  if (String(current.css ?? '').trim() === '') return null
  if (sheets.some((sheet) => /wp-custom-css/.test(sheet))) return null
  if (current.block === true && sheets.some((sheet) => /global-styles-inline-css/.test(sheet))) return null
  const last = sheets
    .map((name) => editableSheet('wordpress', name))
    .filter((at) => at !== null)
    .at(-1)
  return {
    why: `this page does not print the site's Additional CSS (no <style id="wp-custom-css">${current.block === true ? ', and its theme leaves out global-styles, where a block theme prints it' : ''}), so a rule there would not show`,
    answer: {
      code: 'LOOK_SET_NOT_PRINTED',
      next:
        last === undefined
          ? 'This page loads no stylesheet of its theme either: tell the customer this change cannot reach this page, and why.'
          : `Append the rule at the end of ${last.slice(1)} (the theme stylesheet this page loads last), tell the customer a theme update replaces that file, then page.look to check it shows.`
    }
  }
}

/** The platforms whose look this writes. */
const PLATFORMS = new Set(['wordpress', 'joomla', 'emdash'])

/** Where an EmDash token is looked for, in this order (`LOOK_ROAD`: tokens, then shared classes). */
export const EMDASH_STYLE_FILES = Object.freeze(['/app/src/styles/tokens.css', '/app/src/styles/global.css'])

const bad = (/** @type {string} */ error) => ({
  ok: /** @type {const} */ (false),
  code: 'BAD_LOOK_SET',
  error,
  next: `Call ${LOOK_SET_CALL}.`
})

// ── What a call may ask ──────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ path: string, target: { text?: string, selector?: string, nth: number },
 *   props: [string, string][], scope: 'element' | 'page' | 'site', viewport: 'mobile' | 'desktop' | null }} LookSetReq
 */

/**
 * `look.set`'s parameters, checked before anything is asked of the site. `beside` is a `target`
 * object the model put beside `action` (planCall keeps a `target` there for the relay, so it is read
 * from there too, never dropped).
 * @param {Record<string, unknown>} params
 * @param {unknown} [beside]
 * @returns {{ ok: true, req: LookSetReq } | { ok: false, answer: ReturnType<typeof bad> }}
 */
export function lookSetRequest(params, beside) {
  const p = /** @type {Record<string, unknown>} */ (params && typeof params === 'object' ? params : {})
  const no = (/** @type {string} */ why) => ({ ok: /** @type {const} */ (false), answer: bad(why) })
  const unknown = Object.keys(p).filter(
    (key) => p[key] !== undefined && p[key] !== null && !LOOK_SET_KEYS.includes(key)
  )
  if (unknown.length > 0)
    return no(
      `look.set takes ${LOOK_SET_KEYS.join(', ')}, nothing else: ${unknown
        .slice(0, 4)
        .map((key) => `"${key.slice(0, 30)}"`)
        .join(', ')} would have been ignored`
    )
  const path = typeof p.path === 'string' && p.path.trim() !== '' ? p.path.trim() : '/'
  const t = p.target ?? (beside && typeof beside === 'object' ? beside : undefined)
  const asked = /** @type {Record<string, unknown>} */ (
    typeof t === 'string' ? { text: t } : t && typeof t === 'object' && !Array.isArray(t) ? t : {}
  )
  const text = typeof asked.text === 'string' ? asked.text.replace(/\s+/g, ' ').trim() : ''
  const selector = typeof asked.selector === 'string' ? asked.selector.trim() : ''
  if (text === '' && selector === '')
    return no('target names no element: give text (its visible words) or selector')
  if (text !== '' && selector !== '') return no('target takes text or selector, not both')
  if (text.length > 200 || selector.length > 200)
    return no('target text or selector is longer than 200 characters')
  const nthRaw = typeof asked.nth === 'string' && /^\d+$/.test(asked.nth) ? Number(asked.nth) : asked.nth
  const nth = nthRaw === undefined || nthRaw === null ? 0 : nthRaw
  if (typeof nth !== 'number' || !Number.isInteger(nth) || nth < 0 || nth > 200)
    return no('target nth must be a whole number from 0 (the first match)')
  const rawProps = p.props
  if (!rawProps || typeof rawProps !== 'object' || Array.isArray(rawProps))
    return no(
      'props is an object of CSS properties and the values to give them, e.g. {"background-color":"#1d4ed8"}'
    )
  /** @type {[string, string][]} */
  const props = []
  for (const [key, raw] of Object.entries(/** @type {Record<string, unknown>} */ (rawProps))) {
    const name = key.trim().startsWith('--') ? key.trim() : key.trim().toLowerCase()
    if (!/^(?:--[A-Za-z0-9_-]+|[a-z][a-z0-9-]*)$/.test(name))
      return no(`"${key.slice(0, 40)}" is not a CSS property name`)
    const value =
      typeof raw === 'number' && Number.isFinite(raw)
        ? String(raw)
        : typeof raw === 'string'
          ? raw.trim()
          : ''
    if (value === '' || value.length > 200) return no(`props["${name}"] needs a value of 1–200 characters`)
    if (/[;{}<>\\\n\r]|\/\*|\*\//.test(value))
      return no(
        `props["${name}"] holds a character a CSS value cannot carry here (; { } < > \\ or a comment)`
      )
    if (/!\s*important/i.test(value))
      return no(`props["${name}"]: leave !important out — look.set decides it`)
    if (/\burl\s*\(|expression\s*\(|javascript:|@import/i.test(value))
      return no(
        `props["${name}"]: a picture or an import is not a look value (a picture goes in through media.upload)`
      )
    if (!props.some(([n]) => n === name)) props.push([name, value])
  }
  if (props.length === 0) return no('props names no property to set')
  if (props.length > LOOK_SET_MAX_PROPS)
    return no(`look.set writes at most ${LOOK_SET_MAX_PROPS} props in one call`)
  const scope = typeof p.scope === 'string' ? p.scope.trim().toLowerCase() : ''
  if (scope !== 'element' && scope !== 'page' && scope !== 'site')
    return no(
      'scope is "element" (this one), "page" (every one like it on this page) or "site" (the shared token or rule, every page)'
    )
  /** @type {'mobile' | 'desktop' | null} */
  let viewport = null
  if (p.viewport !== undefined && p.viewport !== null && p.viewport !== '') {
    const v = typeof p.viewport === 'string' ? p.viewport.trim().toLowerCase() : ''
    const size = /(\d{3,4})\s*(?:px)?\s*[x×*]\s*\d{3,4}/.exec(v)
    if (size !== null) viewport = Number(size[1]) < 768 ? 'mobile' : 'desktop'
    else if (/\b(?:mobiles?|phones?|smartphones?|iphone|android)\b/.test(v)) viewport = 'mobile'
    else if (/\b(?:desktops?|laptops?|tablets?|ipad|pc|computers?|wide)\b/.test(v)) viewport = 'desktop'
    else
      return no(
        'viewport is "mobile" (phones, below 768px) or "desktop" (768px and wider), or left out for every width'
      )
  }
  if (scope === 'site' && viewport !== null)
    return no(
      'scope "site" changes the shared token or rule at every width: for phones or desktops only, use scope "page" or "element" (an element of the header or footer reaches every page)'
    )
  return {
    ok: true,
    req: { path, target: { ...(text !== '' ? { text } : { selector }), nth }, props, scope, viewport }
  }
}

/**
 * The element a look write read and wrote for, as its answer names it: the tag with its id and
 * classes, its words, and which of how many matches it was.
 *
 * 🔒 `nth` COUNTS FROM 0, AND AGENTS COUNT FROM 1 (dskeepwp, dskeepjo, 09–10/10/2026): "the first
 * button" was asked as `nth:1` three times — a refused call on WordPress T3, the second "Start a
 * conversation" (`#mod-custom-233`) changed instead of the hero's on Joomla T3, the wrong button then
 * a self-revert on Joomla T4b. The answer named neither the element nor its place among the matches,
 * so the slip showed only on the page; it now shows in the same turn.
 * @param {{ el?: string, text?: string, matches?: number, how?: string }} info
 * @param {{ nth: number }} target
 * @returns {string}
 */
export function matchedElement(info, target) {
  const el = typeof info.el === 'string' && info.el !== '' ? info.el : 'an element'
  const words = typeof info.text === 'string' && info.text !== '' ? ` "${info.text.slice(0, 60)}"` : ''
  const n = typeof info.matches === 'number' ? info.matches : 0
  const place =
    info.how === 'partial'
      ? 'the closest partial match of the words'
      : n > 1
        ? `match ${target.nth + 1} of ${n} (nth:${target.nth}; nth:0 is the first)`
        : 'the only match'
  return `${el}${words} — ${place}`
}

// ── Selectors ────────────────────────────────────────────────────────────────────────────────────

/** The index just past the bracket, parenthesis or string that opens at `i`. */
function skipGroup(/** @type {string} */ s, /** @type {number} */ i) {
  const open = s[i]
  if (open === '"' || open === "'") {
    let j = i + 1
    while (j < s.length && s[j] !== open) j += s[j] === '\\' ? 2 : 1
    return j + 1
  }
  const close = open === '(' ? ')' : ']'
  let depth = 0
  for (let j = i; j < s.length; j += 1) {
    const c = s[j]
    if (c === '\\') j += 1
    else if (c === '"' || c === "'") j = skipGroup(s, j) - 1
    else if (c === open) depth += 1
    else if (c === close && --depth === 0) return j + 1
  }
  return s.length
}

/**
 * A list split at its top-level `sep` (never inside brackets, parentheses or strings).
 * @param {string} s
 * @param {string} [sep]
 */
export function splitTop(s, sep = ',') {
  /** @type {string[]} */
  const out = []
  let from = 0
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]
    if (c === '\\') i += 1
    else if (c === '(' || c === '[' || c === '"' || c === "'") i = skipGroup(s, i) - 1
    else if (c === sep) {
      out.push(s.slice(from, i))
      from = i + 1
    }
  }
  out.push(s.slice(from))
  return out.map((x) => x.trim()).filter((x) => x !== '')
}

const identEnd = (/** @type {string} */ s, /** @type {number} */ i) => {
  let j = i
  while (j < s.length && (/[\w-]/.test(s[j]) || s.charCodeAt(j) > 127 || s[j] === '\\'))
    j += s[j] === '\\' ? 2 : 1
  return j
}

/**
 * A selector's specificity `[ids, classes, types]` — the highest of its list, `:is`/`:not`/`:has`
 * by their most specific argument, `:where` nothing (Selectors Level 4 §17).
 * @param {string} selector
 * @returns {[number, number, number]}
 */
export function specificity(selector) {
  /** @type {[number, number, number]} */
  let best = [0, 0, 0]
  for (const one of splitTop(selector)) {
    const s = specOne(one)
    if (compareSpec(s, best) > 0) best = s
  }
  return best
}

/** @returns {[number, number, number]} */
function specOne(/** @type {string} */ sel) {
  let a = 0
  let b = 0
  let c = 0
  const add = (/** @type {number[]} */ s) => {
    a += s[0]
    b += s[1]
    c += s[2]
  }
  let i = 0
  while (i < sel.length) {
    const ch = sel[i]
    if (ch === '\\') i += 2
    else if (ch === '#') {
      a += 1
      i = identEnd(sel, i + 1)
    } else if (ch === '.') {
      b += 1
      i = identEnd(sel, i + 1)
    } else if (ch === '[') {
      b += 1
      i = skipGroup(sel, i)
    } else if (ch === ':') {
      if (sel[i + 1] === ':') {
        c += 1
        i = identEnd(sel, i + 2)
        if (sel[i] === '(') i = skipGroup(sel, i)
        continue
      }
      const start = i + 1
      i = identEnd(sel, start)
      const name = sel.slice(start, i).toLowerCase()
      if (/^(?:before|after|first-line|first-letter)$/.test(name)) {
        c += 1
        continue
      }
      if (sel[i] === '(') {
        const end = skipGroup(sel, i)
        const inner = sel.slice(i + 1, end - 1)
        i = end
        if (name === 'where') continue
        if (/^(?:is|not|has|matches|-webkit-any|-moz-any)$/.test(name)) {
          add(specificity(inner))
          continue
        }
        b += 1
        if (/^nth-(?:last-)?child$/.test(name)) {
          const of = /\bof\s+([\s\S]+)$/.exec(inner)
          if (of) add(specificity(of[1]))
        }
        continue
      }
      b += 1
    } else if (/[A-Za-z_]/.test(ch) || sel.charCodeAt(i) > 127) {
      c += 1
      i = identEnd(sel, i)
    } else i += 1
  }
  return [a, b, c]
}

/** <0, 0, >0 as `x` is less, as, or more specific than `y`. */
export function compareSpec(/** @type {number[]} */ x, /** @type {number[]} */ y) {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/**
 * `selector` made at least as specific as `need`, matching exactly what it matched: the last
 * compound's own class repeated, or `:not(.\#)` / `:not(#\#)` (no element carries the class or id
 * "#"), as few times as it takes.
 * @param {string} selector - one selector, no list.
 * @param {number[]} need
 */
export function boostTo(selector, need) {
  let out = selector
  const own = /\.(?:\\.|[\w-])+(?=[^\s>+~]*$)/.exec(out)?.[0] ?? null
  for (let guard = 0; guard < 8 && compareSpec(specificity(out), need) < 0; guard += 1) {
    if (specificity(out)[0] < need[0]) out = `${out}:not(#\\#)`
    else out = own !== null ? `${out}${own}` : `${out}:not(.\\#)`
  }
  return out
}

/**
 * Each selector of a list made MORE specific than `beat` (those that already are, kept as they are),
 * matching exactly what it matched: {@link boostTo} one step past it.
 * @param {string} list
 * @param {number[]} beat
 */
export function beyond(list, beat) {
  return splitTop(list)
    .map((one) =>
      compareSpec(specificity(one), beat) > 0 ? one : boostTo(one, [beat[0], beat[1], beat[2] + 1])
    )
    .join(', ')
}

/**
 * A selector list limited to one page by the body's class: `body.<c> <sel>`; a selector that starts
 * at `<body>` gets the class on it, one that starts at `<html>`/`:root` asks `:has(> body.<c>)` there.
 * @param {string} selector
 * @param {string} pageClass
 */
export function scopeTo(selector, pageClass) {
  return splitTop(selector)
    .map((one) => {
      let end = 0
      while (end < one.length && !/[\s>+~]/.test(one[end])) {
        const c = one[end]
        end =
          c === '(' || c === '[' || c === '"' || c === "'" ? skipGroup(one, end) : end + (c === '\\' ? 2 : 1)
      }
      const head = one.slice(0, end)
      const rest = one.slice(end)
      if (/^(?:html|:root)(?![\w-])/i.test(head)) return `${head}:has(> body.${pageClass})${rest}`
      if (/^body(?![\w-])/i.test(head)) return `body.${pageClass}${head.slice(4)}${rest}`
      return `body.${pageClass} ${one}`
    })
    .join(', ')
}

/**
 * The page's own class, read off `<body>`: WordPress `page-id-<n>`/`postid-<n>`/an archive's term,
 * Joomla's menu item (`item-<n>` in T4, `itemid-<n>` in Cassiopeia), else WordPress's `home`.
 * @param {unknown} body - the body's class attribute.
 * @returns {string | null}
 */
export function pageClassOf(body) {
  const classes = typeof body === 'string' ? body.trim().split(/\s+/) : []
  for (const pattern of [
    /^page-id-\d+$/,
    /^postid-\d+$/,
    /^itemid-\d+$/,
    /^item-\d+$/,
    /^(?:term|category|tag|author)-\d+$/,
    /^home$/
  ]) {
    const hit = classes.find((c) => pattern.test(c))
    if (hit !== undefined) return hit
  }
  return null
}

/**
 * What a cascade answer's `by` names: the selectors that matched, and the `@media` and `@layer` it
 * stands in (`resolveStyles` `ruleName`). Null for a winner that is not a rule (an attribute, the
 * style attribute, the browser's default).
 * @param {unknown} by
 * @returns {{ selectors: string, media: string | null, cut: boolean } | null}
 */
export function parseBy(by) {
  if (typeof by !== 'string' || by === '') return null
  if (/^(?:its style attribute|an HTML attribute|the browser default|no rule)/.test(by)) return null
  let rest = by.replace(/\s@layer\s.+$/, '')
  let media = null
  const m = /\s@media\s(.+)$/.exec(rest)
  if (m !== null) {
    media = m[1]
    rest = rest.slice(0, m.index)
  }
  const selectors = rest.trim()
  if (selectors === '' || selectors === '?') return null
  return { selectors, media, cut: selectors.endsWith('…') || (media?.endsWith('…') ?? false) }
}

/** A selector as both the cascade and a source file can be compared: spaces, quotes, combinators. */
export function normSelector(/** @type {string} */ s) {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\[\s*([^\]=~|^$*\s]+)\s*([~|^$*]?=)\s*(["'])([^"']*)\3\s*\]/g, (_, attr, op, _q, v) =>
      /^-?[A-Za-z_][\w-]*$/.test(v) ? `[${attr}${op}${v}]` : `[${attr}${op}"${v}"]`
    )
}

/** A media condition as both sides write it. */
const normMedia = (/** @type {string} */ s) =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*:\s*/g, ': ')

// ── Stylesheets this site's look may be written into ─────────────────────────────────────────────

/**
 * The webroot path of a stylesheet look.set may add to, or null: a file of a WordPress theme, or of
 * a Joomla template (`templates/<t>/`, `media/templates/site/<t>/`) — never core, a plugin, uploads or
 * T4's `media/t4/` cache. `name` is the sheet as the cascade answer names it (a path on this origin).
 * @param {string} platform
 * @param {unknown} name
 * @returns {string | null}
 */
export function editableSheet(platform, name) {
  if (typeof name !== 'string') return null
  const at = name.replace(/ \(inlined in the page\)$/, '')
  if (!at.startsWith('/')) return null
  let decoded
  try {
    decoded = decodeURIComponent(at)
  } catch {
    return null
  }
  if (decoded.split('/').some((seg) => seg === '..' || seg === '.') || /[\0\\]/.test(decoded)) return null
  if (!/\.css$/i.test(decoded)) return null
  const inFolder =
    platform === 'wordpress'
      ? /^\/wp-content\/themes\/[^/]+(\/.+)$/.exec(decoded)
      : platform === 'joomla'
        ? /^\/(?:templates|media\/templates\/site)\/[^/]+(\/.+)$/.exec(decoded)
        : null
  if (inFolder === null || LIBRARY_SHEET.test(inFolder[1])) return null
  return decoded
}

/**
 * A stylesheet inside a theme or template folder that belongs to a library the template bundles (a
 * lightbox's icon font, a carousel, a vendor folder, a minified copy), not to the template's own
 * styles: a template update replaces it, and a script may add it to the page late, or only on some
 * pages. Measured on saigon-iron-boxing (25/10/2026): `js/html5lightbox/icons/css/fontello.css`.
 */
const LIBRARY_SHEET =
  /\/(?:js|vendors?|fonts?|icons?|libs?|node_modules|plugins?)\/|lightbox|fontello|font-?awesome|\.min\.css$/i

/**
 * THE TEMPLATE'S OWN CUSTOMISATION STYLESHEET, the one a Joomla site's look is written into (turn
 * latency, 25/10/2026). The rule used to go into the first template-folder sheet loaded after the
 * winning one, and on a T4 site, whose template CSS all stands in T4's bundle, that was a library's
 * sheet: four of six colour edits on saigon-iron-boxing landed in the lightbox's `fontello.css`, and
 * the agent searched, undid and rewrote each into `local/css/custom.css` (~20–30 s a turn).
 * - T4: `local/css/custom.css`, else the template's own `css/custom.css` — T4 looks the file up
 *   local-first (`Path::findInTheme`), so a new `local/` copy would hide a shipped `css/custom.css`;
 *   neither yet → `local/css/custom.css`, the update-safe home (t4-framework-knowledge), created.
 * - T3: `css/custom.css` (its `head.php` adds it when it exists), created when missing.
 * - a Joomla 4+ template in `media/templates/site/<t>/` (Cassiopeia and its children): `css/user.css`.
 * - any other framework (Gavick's own): `css/custom.css`, `css/override.css` or `css/user.css`, only
 *   when the page loads it; else null, and the caller keeps to the template's other own sheets.
 * `k` is its place among the page's sheets, -1 when the page does not list it (T4's or T3's bundle
 * merged it, or it is created now): the caller then makes the rule more specific than the one it
 * must beat, since its order against that rule is not known.
 * @param {{ info: Info, sheets: string[], read: (file: string) => Promise<Buffer | null>, webroot: string }} input
 * @returns {Promise<{ at: string, k: number } | null>}
 */
export async function ownStyleSheet({ info, sheets, read, webroot }) {
  const paths = sheets.map((name) => String(name).replace(/ \(inlined in the page\)$/, ''))
  const fromSheets = () => {
    /** @type {Map<string, number>} */
    const seen = new Map()
    for (const p of paths) {
      const m = /^\/media\/templates\/site\/([^/]+)\//.exec(p) ?? /^\/templates\/([^/]+)\//.exec(p)
      if (m !== null && m[1] !== 'system') seen.set(m[1], (seen.get(m[1]) ?? 0) + 1)
    }
    return [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const template =
    typeof info.template === 'string' && /^[\w.-]+$/.test(info.template) ? info.template : fromSheets()
  if (template === null) return null
  const framework =
    info.framework === 't4' || info.framework === 't3'
      ? info.framework
      : paths.some((p) => /^\/(?:plugins\/system\/t4|media\/t4)\//.test(p))
        ? 't4'
        : paths.some((p) => /^\/(?:plugins\/system\/t3|media\/t3)\//.test(p))
          ? 't3'
          : null
  const media = paths.some((p) => p.startsWith(`/media/templates/site/${template}/`))
  const known =
    framework === 't4'
      ? [`/templates/${template}/local/css/custom.css`, `/templates/${template}/css/custom.css`]
      : framework === 't3'
        ? [`/templates/${template}/css/custom.css`]
        : media
          ? [`/media/templates/site/${template}/css/user.css`]
          : null
  const loadedOnly = [
    `/templates/${template}/css/custom.css`,
    `/templates/${template}/css/override.css`,
    `/templates/${template}/css/user.css`,
    `/media/templates/site/${template}/css/user.css`
  ]
  const candidates = known ?? loadedOnly
  for (let k = paths.length - 1; k >= 0; k -= 1) if (candidates.includes(paths[k])) return { at: paths[k], k }
  if (known === null) return null
  for (const at of known) if ((await read(`${webroot}${at}`)) !== null) return { at, k: -1 }
  return { at: known[0], k: -1 }
}

// ── Declarations in a stylesheet's text ──────────────────────────────────────────────────────────

/**
 * @typedef {{ name: string, value: string, start: number, end: number, important: boolean,
 *   selectors: string[], media: string[], theme: boolean, nested: boolean, line: number }} Declaration
 */

/**
 * Every declaration of a stylesheet's text with where its value stands, the rule's selectors (Tailwind
 * v4's `@theme` read as `:root`, which it compiles to), the `@media` around it and the rule's line.
 * Comments and strings are skipped; a rule nested in another is marked (its selector is relative).
 * @param {string} text
 * @returns {Declaration[]}
 */
export function cssDeclarations(text) {
  /** @type {Declaration[]} */
  const out = []
  /** @type {({ kind: 'media', text: string } | { kind: 'at' } | { kind: 'rule', selectors: string[], theme: boolean, nested: boolean, line: number })[]} */
  const stack = []
  const lineAt = (/** @type {number} */ pos) => {
    let n = 1
    for (let k = text.indexOf('\n'); k !== -1 && k < pos; k = text.indexOf('\n', k + 1)) n += 1
    return n
  }
  const bare = (/** @type {string} */ s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  let seg = 0
  const flush = (/** @type {number} */ end) => {
    const top = stack.at(-1)
    if (top === undefined || top.kind !== 'rule') return
    const raw = text.slice(seg, end)
    const m = /^((?:\s|\/\*[\s\S]*?\*\/)*)(--[\w-]+|-?[A-Za-z][\w-]*)\s*:/.exec(raw)
    if (m === null) return
    let vs = seg + m[0].length
    let ve = end
    while (vs < ve && /\s/.test(text[vs])) vs += 1
    while (ve > vs && /\s/.test(text[ve - 1])) ve -= 1
    const imp = /\s*!\s*important$/i.exec(text.slice(vs, ve))
    if (imp !== null) ve -= imp[0].length
    out.push({
      name: m[2],
      value: text.slice(vs, ve),
      start: vs,
      end: ve,
      important: imp !== null,
      selectors: top.selectors,
      media: stack.flatMap((f) => (f.kind === 'media' ? [f.text] : [])),
      theme: top.theme,
      nested: top.nested,
      line: top.line
    })
  }
  for (let i = 0; i < text.length; ) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2)
      i = e === -1 ? text.length : e + 2
    } else if (c === '"' || c === "'") i = skipGroup(text, i)
    else if (c === '{') {
      const prelude = bare(text.slice(seg, i)).trim()
      let lead = seg
      for (;;) {
        while (lead < i && /\s/.test(text[lead])) lead += 1
        if (text.startsWith('/*', lead)) {
          const e = text.indexOf('*/', lead + 2)
          lead = e === -1 ? i : e + 2
        } else break
      }
      const nested = stack.some((f) => f.kind === 'rule')
      const at = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude)
      if (at !== null) {
        const name = at[1].toLowerCase()
        if (name === 'media') stack.push({ kind: 'media', text: normMedia(at[2]) })
        else if (name === 'theme')
          stack.push({ kind: 'rule', selectors: [':root'], theme: true, nested, line: lineAt(lead) })
        else stack.push({ kind: 'at' })
      } else
        stack.push({
          kind: 'rule',
          selectors: splitTop(prelude).map(normSelector),
          theme: false,
          nested,
          line: lineAt(lead)
        })
      i += 1
      seg = i
    } else if (c === '}') {
      flush(i)
      stack.pop()
      i += 1
      seg = i
    } else if (c === ';') {
      flush(i)
      i += 1
      seg = i
    } else i += 1
  }
  return out
}

/**
 * The one declaration of `name` that the cascade's `by` (and `line`, when the file is the one served)
 * names — or why there is not exactly one.
 * @param {Declaration[]} decls
 * @param {{ name: string, by: unknown, line?: number | null }} where
 * @returns {{ ok: true, decl: Declaration } | { ok: false, why: string }}
 */
export function pickDeclaration(decls, { name, by, line }) {
  const want = parseBy(by)
  if (want === null) return { ok: false, why: 'it is not set by a rule' }
  const sels = splitTop(want.selectors.replace(/…$/, '')).map(normSelector)
  const media = want.media === null ? null : normMedia(want.media.replace(/…$/, ''))
  const candidates = decls.filter((d) => {
    if (d.name !== name || d.nested) return false
    const selOk = d.theme
      ? sels.every((s) => s === ':root' || s === ':host')
      : want.cut
        ? sels.every((s, k) =>
            k === sels.length - 1 ? d.selectors.some((x) => x.startsWith(s)) : d.selectors.includes(s)
          )
        : sels.every((s) => d.selectors.includes(s))
    if (!selOk) return false
    const inMedia = d.media.filter((m) => m !== 'all')
    if (media === null) return inMedia.length === 0
    return inMedia.some((m) => (want.cut ? m.startsWith(media) : m === media))
  })
  if (candidates.length === 1) return { ok: true, decl: candidates[0] }
  if (candidates.length > 1 && typeof line === 'number') {
    const at = candidates.filter((d) => d.line === line)
    if (at.length === 1) return { ok: true, decl: at[0] }
  }
  return {
    ok: false,
    why:
      candidates.length === 0
        ? `no rule ${want.selectors} sets it in this file`
        : `${candidates.length} rules ${want.selectors} set it in this file`
  }
}

// ── WordPress theme.json ─────────────────────────────────────────────────────────────────────────

/** WordPress's `_wp_to_kebab_case`: how a `settings.custom` key becomes part of its variable. */
export function wpKebab(/** @type {string} */ key) {
  return (
    String(key)
      .replace(/'/g, '')
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g) ?? []
  )
    .map((w) => w.toLowerCase())
    .join('-')
}

/** The theme.json presets WordPress prints as `--wp--preset--<kind>--<slug>`: their list and field. */
const PRESETS = Object.freeze({
  color: [['settings', 'color', 'palette'], 'color'],
  gradient: [['settings', 'color', 'gradients'], 'gradient'],
  'font-size': [['settings', 'typography', 'fontSizes'], 'size'],
  'font-family': [['settings', 'typography', 'fontFamilies'], 'fontFamily'],
  spacing: [['settings', 'spacing', 'spacingSizes'], 'size'],
  shadow: [['settings', 'shadow', 'presets'], 'shadow']
})

const dig = (/** @type {unknown} */ obj, /** @type {(string | number)[]} */ at) =>
  at.reduce((/** @type {any} */ o, k) => (o !== null && typeof o === 'object' ? o[k] : undefined), obj)

/**
 * Does theme.json's own CSS (`styles.css`, which WordPress prints at the END of global styles, after a
 * block theme's Additional CSS) declare `token`?
 * @param {unknown} json
 * @param {string} token
 */
export function themeJsonCssSets(json, token) {
  const css = dig(json, ['styles', 'css'])
  return typeof css === 'string' && cssDeclarations(css).some((d) => d.name === token)
}

/**
 * Where in a theme.json a WordPress variable is set: `--wp--preset--<kind>--<slug>` is that preset's
 * entry, `--wp--custom--<a>--<b>` is `settings.custom.<a>.<b>` (keys compared kebab-cased). Null when
 * this file does not set it.
 * @param {unknown} json
 * @param {string} token
 * @returns {{ path: (string | number)[], label: string, old: string | number } | null}
 */
export function themeJsonPath(json, token) {
  const preset = /^--wp--preset--(color|gradient|font-size|font-family|spacing|shadow)--(.+)$/.exec(token)
  if (preset !== null) {
    const [at, field] = PRESETS[/** @type {keyof typeof PRESETS} */ (preset[1])]
    const list = dig(json, /** @type {string[]} */ (at))
    if (!Array.isArray(list)) return null
    const hits = list.flatMap((entry, k) =>
      entry &&
      typeof entry === 'object' &&
      (entry.slug === preset[2] || wpKebab(String(entry.slug ?? '')) === preset[2])
        ? [k]
        : []
    )
    if (hits.length !== 1) return null
    const old = list[hits[0]][/** @type {string} */ (field)]
    if (typeof old !== 'string' && typeof old !== 'number') return null
    return {
      path: [...at, hits[0], /** @type {string} */ (field)],
      label: `${preset[1]} "${preset[2]}"`,
      old
    }
  }
  const custom = /^--wp--custom--(.+)$/.exec(token)
  if (custom === null) return null
  /** @type {(string | number)[]} */
  const path = ['settings', 'custom']
  let node = dig(json, path)
  for (const seg of custom[1].split('--')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return null
    const keys = Object.keys(node).filter((k) => wpKebab(k) === seg || k === seg)
    if (keys.length !== 1) return null
    path.push(keys[0])
    node = /** @type {Record<string, unknown>} */ (node)[keys[0]]
  }
  if (typeof node !== 'string' && typeof node !== 'number') return null
  return { path, label: `custom ${path.slice(2).join('.')}`, old: node }
}

/**
 * Other colours of a theme.json holding the same value as the one changed — WordPress prints each as
 * its own variable (Tracy Business's orange is `custom.tracy.brand.orange` AND palette `warn`), and
 * page content may use either inline. Named, never changed: two tokens that share a value by chance
 * are two decisions.
 * @param {unknown} json
 * @param {string | number} old
 * @param {string} except - the variable just changed.
 * @returns {string[]}
 */
export function themeJsonSameValue(json, old, except) {
  const same = (/** @type {unknown} */ v) =>
    (typeof v === 'string' || typeof v === 'number') &&
    String(v).trim().toLowerCase() === String(old).trim().toLowerCase()
  /** @type {string[]} */
  const out = []
  const palette = dig(json, ['settings', 'color', 'palette'])
  if (Array.isArray(palette))
    for (const entry of palette)
      if (entry && typeof entry === 'object' && same(entry.color))
        out.push(`--wp--preset--color--${entry.slug}`)
  const walk = (/** @type {unknown} */ node, /** @type {string} */ prefix) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return
    for (const [k, v] of Object.entries(node)) {
      const name = `${prefix}--${wpKebab(k)}`
      if (same(v)) out.push(name)
      else walk(v, name)
    }
  }
  walk(dig(json, ['settings', 'custom']), '--wp--custom')
  return out.filter((name) => name !== except).slice(0, 4)
}

// ── The call ─────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ value?: string, hex?: string, on?: string, set?: string | null, by?: string, sheet?: string,
 *   line?: number, tokens?: { name: string, value: string | null, by?: string, sheet?: string, line?: number }[],
 *   split?: boolean, parts?: Row[], props?: string[], spec?: number[], layer?: string, paints?: number }} Row
 *   `paints`: how many elements of the page the winning rule's selectors match (look.set's reading only).
 * @typedef {{ el?: string, text?: string, matches?: number, how?: string, hidden?: unknown, unique?: string,
 *   body?: string, chrome?: boolean, sheets?: string[], template?: string | null, framework?: string | null,
 *   copies?: { unique: string, el: string, props: Record<string, Row> }[] }} Info
 *   `copies`: the copies visitors see of a link the page hides here, each with its own reading (`describeTarget`).
 * @typedef {(req: { text?: string, selector?: string, nth: number, props: string[], viewport: string, set?: boolean },
 *   path: string) => Promise<{ ok: true, payload: any, url: string } | Record<string, unknown>>} Measure
 * @typedef {import('./look-undo.mjs').LookIo} LookIo
 */

/**
 * The token a value literally comes from: the first `var()` of the row, followed down while the
 * token's own value is another `var()` it found.
 * @param {Row['tokens']} tokens
 */
function deepestToken(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null
  let t = tokens[0]
  for (let guard = 0; guard < 6 && t && typeof t.value === 'string'; guard += 1) {
    const next = /var\(\s*(--[A-Za-z0-9_-]+)/.exec(t.value)?.[1]
    const found = next ? tokens.find((x) => x.name === next && x.value !== null) : undefined
    if (!found) break
    t = found
  }
  return t && t.value !== null && typeof t.by === 'string' ? t : null
}

const shown = (/** @type {string} */ file, /** @type {string} */ siteRoot) =>
  file.startsWith(`${siteRoot}/`) ? file.slice(siteRoot.length + 1) : file

/**
 * One appended rule as CSS text: inside `@media` for one width, and inside the cascade layer of the
 * `!important` declaration it must beat (an important declaration outside every layer loses to one
 * inside a layer, whatever its specificity).
 */
function ruleText(
  /** @type {{ selector: string, media: string | null, decls: [string, string, boolean][], note: string, layer?: string | null }} */ r
) {
  const body = r.decls.map(
    ([name, value, important]) => `${name}: ${value}${important ? ' !important' : ''};`
  )
  let css = `${r.selector} {\n  ${body.join('\n  ')}\n}`
  const inside = (/** @type {string} */ at) => `${at} {\n  ${css.split('\n').join('\n  ')}\n}`
  if (r.media !== null) css = inside(`@media ${r.media}`)
  if (typeof r.layer === 'string') css = inside(`@layer ${r.layer}`)
  return `/* look.set: ${r.note} */\n${css}\n`
}

/**
 * `tracy_site` `look.set`: read, write where the reading says, keep an undo, read again.
 *
 * `wide`, when given, is asked after the reading and BEFORE any file is read or written, with how far
 * an "element" or "page" write reaches: `everyPage` for an element of the site's header or footer, and
 * `paints`, the most elements one winning rule paints on this page at scope "page" (read in the same
 * visit, `look-style.mjs` `countPaints`; null when it could not be told). An answer it returns is the
 * call's answer, and nothing is written (`index.ts` asks the customer first: `consequence.mjs`
 * `lookReachOf`); null goes on.
 * @param {{ params: Record<string, unknown>, beside?: unknown, platform: string, siteRoot: string,
 *   measure: Measure, io: LookIo,
 *   wide?: ((reach: { scope: string, everyPage: boolean, paints: number | null, reach: string }) => (Record<string, unknown> | null)) | null,
 *   roles?: ((props: [string, string][]) => Promise<{ props: [string, string][], through: { prop: string, value: string, use: string }[] }>) | null }} input
 *   `roles`, when given, is asked after the reading and before anything is decided, with the values asked:
 *   it hands back the values to write (a literal written through its design-system role, `role-pins.mjs`
 *   `throughRoles`) and which it changed; a failure writes the values as asked.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function lookSet({
  params,
  beside,
  platform,
  siteRoot,
  measure,
  io,
  wide = null,
  roles = null
}) {
  const asked = lookSetRequest(params, beside)
  if (!asked.ok) return asked.answer
  const req = asked.req
  if (!PLATFORMS.has(platform))
    return noRoad(
      `look.set writes the look of WordPress, Joomla and EmDash sites; this one reads as "${platform}"`
    )
  if (platform === 'emdash' && req.scope !== 'site') return noRoad(EMDASH_SECTION)
  const names = req.props.map(([name]) => name)
  const viewport = req.viewport ?? 'desktop'
  const read = await measure({ ...req.target, props: names, viewport, set: true }, req.path)
  if (read.ok !== true) return read
  const before =
    /** @type {{ info?: Info, props?: Record<string, Row>, error?: string, loaded?: boolean }} */ (
      read.payload && typeof read.payload === 'object' ? read.payload : {}
    )
  const url = typeof read.url === 'string' ? read.url : req.path
  if (typeof before.error === 'string') return styleAnswer(before, { url, path: req.path, viewport })
  const info = before.info ?? {}
  const rows = before.props ?? {}
  /** @type {{ prop: string, value: string, use: string }[]} */
  let through = []
  if (typeof roles === 'function') {
    try {
      const roled = await roles(req.props)
      if (Array.isArray(roled?.props) && roled.props.length === req.props.length) {
        req.props = roled.props
        through = Array.isArray(roled.through) ? roled.through : []
      }
    } catch {
      // the values are written as asked; the pins after the write still name a literal
    }
  }
  // 🔒 THE COPIES VISITORS SEE OF A LINK HIDDEN HERE (`describeTarget` `copies`, 26/10/2026): written in the
  // same rule as the element named, and read again after the write in its place — what a visitor sees.
  const copies =
    req.scope === 'element' && info.hidden && Array.isArray(info.copies)
      ? info.copies.filter(
          (c) =>
            c && typeof c.unique === 'string' && c.unique !== '' && c.props && typeof c.props === 'object'
        )
      : []
  const named = matchedElement(info, req.target)
  const element =
    copies.length === 0
      ? named
      : `${named}, hidden here (${String(info.hidden)}); its ${copies.length === 1 ? 'copy' : `${copies.length} copies`} visitors see written with it: ${copies.map((c) => c.el).join(', ')}`
  const refuse = (/** @type {string} */ why) => ({
    ...noRoad(why, true),
    element,
    measured: styleAnswer(before, { url, path: req.path, viewport, cap: 1400 }).style
  })
  const sheets = Array.isArray(info.sheets) ? info.sheets : []
  const posOf = (/** @type {unknown} */ sheet) => (typeof sheet === 'string' ? sheets.indexOf(sheet) : -1)
  const pageClass = pageClassOf(info.body)
  const webroot = `${siteRoot}/.webroot`
  const media = req.viewport === 'mobile' ? PHONE_MEDIA : req.viewport === 'desktop' ? WIDE_MEDIA : null
  const forWidth =
    req.viewport === 'mobile' ? 'phones (below 768px)' : req.viewport === 'desktop' ? '768px and wider' : null
  const chrome = info.chrome === true
  if ((req.scope === 'page' || (req.scope === 'element' && !chrome)) && pageClass === null)
    return refuse(
      `this page's <body> carries no class that names it (${String(info.body ?? '').slice(0, 80) || 'none'}), so a rule for it could reach other pages`
    )
  const onPage = req.scope === 'element' && chrome ? null : pageClass
  const unique = typeof info.unique === 'string' && info.unique !== '' ? info.unique : null

  /**
   * Rules to append, the sheet (by its place in the page) each must come at or after, and the
   * specificity of the rule it must beat (`beat`: a WordPress block theme prints Additional CSS
   * BEFORE the theme's sheets, so there a rule must be MORE specific than that one, not as specific).
   */
  /** @type {{ selector: string, media: string | null, decls: [string, string, boolean][], after: number, note: string, beat: number[], layer: string | null, late: boolean }[]} */
  const appends = []
  const append = (
    /** @type {string} */ selector,
    /** @type {[string, string, boolean]} */ decl,
    /** @type {number} */ after,
    /** @type {string} */ note,
    /** @type {string | null} */ within = media,
    /** @type {number[]} */ beat = [0, 0, 0],
    /** @type {string | null} */ layer = null,
    /** @type {boolean} */ late = false
  ) => {
    const same = appends.find(
      (a) => a.selector === selector && a.note === note && a.media === within && a.layer === layer
    )
    if (same) {
      same.decls.push(decl)
      same.after = Math.max(same.after, after)
      if (compareSpec(beat, same.beat) > 0) same.beat = beat
      same.late = same.late || late
    } else appends.push({ selector, media: within, decls: [decl], after, note, beat, layer, late })
  }
  /** Tokens changed where they are set, resolved against the files below. */
  /** @type {{ token: string, value: string, by: string, sheet: string | null, line: number | null }[]} */
  const tokens = []
  /** @type {string[]} */
  const reach = []
  /** The most elements one winning rule paints on this page, at scope "page" (null: not told). */
  /** @type {number | null} */
  let paints = null

  for (const [name, value] of req.props) {
    const row = rows[name] ?? {}
    const rule = parseBy(row.by)
    // 🔒 EVERY RULE THAT WINS A PART OF IT (dskeepwp, 09/10/2026): a shorthand whose sides different
    // rules win (`parts`, `resolveStyles`) is beaten only by a rule that beats each of them — the most
    // specific, standing at or after the latest sheet. One winner: the row itself, as before.
    const winners = winnersOf(row)
    const important =
      winners.some((w) => /!important(?:;|$)/.test(String(w.set ?? ''))) ||
      winners.some((w) => w.by === 'its style attribute')
    // the browser's own specificity when the reading has it (exact for a nested or a cut selector)
    /** @type {(w: Row) => number[]} */
    const specOf = (w) => {
      if (Array.isArray(w.spec) && w.spec.length === 3) return w.spec
      const r = parseBy(w.by)
      return r === null ? [0, 0, 0] : specificity(r.selectors.replace(/…$/, ''))
    }
    const strongest = winners.reduce(
      (best, w) => (compareSpec(specOf(w), best) > 0 ? specOf(w) : best),
      /** @type {number[]} */ ([0, 0, 0])
    )
    // 🔒 AN `!important` IN A CASCADE LAYER IS BEATEN ONLY FROM INSIDE THAT LAYER (10/10/2026): among
    // important declarations an earlier layer beats a later one and any layer beats the unlayered, so
    // the rule written for it goes into the same layer (`ruleText`), where specificity and order decide.
    const layers = [
      ...new Set(
        winners
          .filter((w) => /!important(?:;|$)/.test(String(w.set ?? '')) && typeof w.layer === 'string')
          .map((w) => /** @type {string} */ (w.layer))
      )
    ]
    if (layers.length > 1)
      return refuse(
        `${name} is set !important from more than one cascade layer (${layers.join(', ')}): set each side's own property`
      )
    if (layers.length === 1 && layers[0].split('.').some((part) => part === ''))
      return refuse(
        `${name} is set !important inside an unnamed cascade layer, which no rule written later can join`
      )
    const layer = layers[0] ?? null
    const latest = Math.max(-1, ...winners.map((w) => (w.sheet ? posOf(w.sheet) : -1)))
    if (req.scope === 'site') {
      if (winners.length > 1) {
        const each = winners.map((w) => `${(w.props ?? []).join(', ')}: ${w.by ?? '?'}`).join('; ')
        const sides = winners.flatMap((w) => w.props ?? []).join(', ')
        return refuse(
          `${name} is set side by side by different rules (${each}): set each side's own property (${sides}), or use scope "element" or "page"`
        )
      }
      const own =
        name.startsWith('--') && rule !== null
          ? { name, by: /** @type {string} */ (row.by), sheet: row.sheet ?? null, line: row.line ?? null }
          : null
      // a shorthand set by its longhands one by one (`split`) is not one token's value: its rule
      const token = own ?? (row.split === true ? null : deepestToken(row.tokens))
      if (token !== null && typeof token.by === 'string') {
        tokens.push({
          token: token.name,
          value,
          by: token.by,
          sheet: token.sheet ?? null,
          line: token.line ?? null
        })
        reach.push(`every element using ${token.name}, on every page`)
      } else if (rule !== null && !rule.cut && platform !== 'emdash') {
        append(
          rule.selectors,
          [name, value, important],
          posOf(row.sheet),
          'every element this rule paints, every page',
          media,
          specOf(row),
          layer
        )
        reach.push(`every element the rule \`${rule.selectors}\` paints, on every page`)
      } else
        return refuse(
          platform === 'emdash' && rule !== null
            ? `${name} comes from the rule ${rule.selectors}, not a token: on EmDash that is a class in the site's source — ${EMDASH_SECTION}`
            : `no shared token or rule sets ${name} on this element (${row.by ?? 'nothing'}): scope "element" or "page" sets it here`
        )
      continue
    }
    if (unique === null) return refuse('the page did not say which selector names this element alone')
    if (req.scope === 'page' && rule !== null && !rule.cut) {
      // every element the winning rule paints, on this page; a token, where it is set
      if (typeof row.paints === 'number' && row.paints >= 0) paints = Math.max(paints ?? 0, row.paints)
      const scoped = scopeTo(rule.selectors, /** @type {string} */ (pageClass))
      append(
        winners.length > 1
          ? splitTop(scoped)
              .map((one) => boostTo(one, strongest))
              .join(', ')
          : scoped,
        [name, value, important],
        winners.length > 1 ? latest : posOf(row.sheet),
        `this page only (body.${pageClass})`,
        media,
        winners.length > 1 ? strongest : specOf(row),
        layer
      )
      reach.push(
        name.startsWith('--')
          ? `${name}, on this page only (body.${pageClass})`
          : `every element \`${rule.selectors}\` paints, on this page only (body.${pageClass})`
      )
      continue
    }
    // this element alone: its own selector, as specific as the rule (each rule) that wins now — and, for a
    // link the page hides here, each copy visitors see, as specific as what wins on that copy
    const own = (/** @type {string} */ sel) => (onPage === null ? sel : scopeTo(sel, onPage))
    const selectors = [boostTo(own(unique), strongest)]
    let after = latest
    let beat = strongest
    let strong = important
    for (const copy of copies) {
      const cw = winnersOf(copy.props[name] ?? {})
      // a copy whose winner stands in another cascade layer cannot share this rule
      const cl = cw.find((w) => /!important(?:;|$)/.test(String(w.set ?? '')) && typeof w.layer === 'string')
      if ((cl?.layer ?? null) !== layer) continue
      const cs = cw.reduce(
        (best, w) => (compareSpec(specOf(w), best) > 0 ? specOf(w) : best),
        /** @type {number[]} */ ([0, 0, 0])
      )
      selectors.push(boostTo(own(copy.unique), cs))
      after = Math.max(after, ...cw.map((w) => (w.sheet ? posOf(w.sheet) : -1)))
      if (compareSpec(cs, beat) > 0) beat = cs
      strong =
        strong ||
        cw.some((w) => /!important(?:;|$)/.test(String(w.set ?? '')) || w.by === 'its style attribute')
    }
    const also =
      selectors.length > 1 ? ` and the ${selectors.length - 1 === 1 ? 'copy' : 'copies'} visitors see` : ''
    append(
      selectors.join(', '),
      [name, value, strong],
      after,
      onPage === null
        ? `this element${also}, every page`
        : `this element${also}, this page only (body.${onPage})`,
      media,
      beat,
      layer
    )
    reach.push(
      onPage === null
        ? `this element${also}, on every page (it is in the site's header or footer)`
        : `this element${also}, on this page only (body.${onPage})`
    )
  }

  // 🔒 THE REACH IS SAID BEFORE THE WRITE (20/10/2026): `wide` above.
  if (typeof wide === 'function' && req.scope !== 'site') {
    const stop = wide({
      scope: req.scope,
      everyPage: req.scope === 'element' && onPage === null,
      paints,
      reach: [...new Set(reach)].join('; ')
    })
    if (stop !== null && stop !== undefined)
      return { ...stop, element, reach: [...new Set(reach)].join('; ') }
  }

  /** @type {Map<string, { old: string, text: string, tail: string[] }>} */
  const files = new Map()
  const fileOf = async (/** @type {string} */ file) => {
    const had = files.get(file)
    if (had) return had
    const bytes = await io.read(file)
    if (bytes === null) return null
    const entry = {
      old: bytes.toString('utf8'),
      text: bytes.toString('utf8'),
      tail: /** @type {string[]} */ ([])
    }
    files.set(file, entry)
    return entry
  }
  /** @type {{ file: string, change: string }[]} */
  const wrote = []
  /** @type {string[]} */
  const also = []
  /** @type {string[]} */
  const sameValue = []
  /** One declaration changed in place in a stylesheet's text: true when it was found there. */
  const inPlace = async (
    /** @type {string} */ file,
    /** @type {{ token: string, value: string, by: string, line: number | null }} */ t,
    /** @type {boolean} */ byLine
  ) => {
    const entry = await fileOf(file)
    if (entry === null) return false
    const decls = cssDeclarations(entry.text)
    const picked = pickDeclaration(decls, { name: t.token, by: t.by, line: byLine ? t.line : null })
    if (!picked.ok) return false
    const d = picked.decl
    entry.text = `${entry.text.slice(0, d.start)}${t.value}${entry.text.slice(d.end)}`
    wrote.push({
      file: shown(file, siteRoot),
      change: `${t.token}: ${d.value} → ${t.value} (${d.theme ? '@theme' : d.selectors.join(', ')})`
    })
    noteOthers(decls, d, also, sameValue)
    return true
  }

  /**
   * WordPress: where a token is set again in Additional CSS — the selector (and `@media`) of the
   * declaration that sets it now, read from the theme stylesheet when it is one (the full selector
   * list, a cut cascade name made whole), else from the cascade's own name. Files are only READ here:
   * a `theme.json` for the colours that hold the same value, a stylesheet for its other declarations.
   *
   * `late`: in global styles, where the token is set may stand AFTER the Additional CSS — theme.json's
   * own `styles.css` sets it (wp-ja-fresco sets `--wp--preset--color--bg` again there on `:root`), or
   * no theme.json makes it a variable, so a `:root` there is CSS, not a preset. The same selector would
   * then lose by order: it is made more specific (the global-styles rule below).
   * @param {{ token: string, value: string, by: string, sheet: string | null, line: number | null }} t
   * @returns {Promise<{ selectors: string, media: string | null, important: boolean, late: boolean } | null>}
   */
  const wpTokenRule = async (t) => {
    let late = false
    if (t.sheet !== null && /global-styles-inline-css/.test(t.sheet)) {
      let variable = false
      for (const theme of wpThemes(info)) {
        const bytes = await io.read(`${webroot}/wp-content/themes/${theme}/theme.json`)
        if (bytes === null) continue
        let json
        try {
          json = JSON.parse(bytes.toString('utf8'))
        } catch {
          continue
        }
        if (themeJsonCssSets(json, t.token)) late = true
        if (variable) continue
        const at = themeJsonPath(json, t.token)
        if (at === null) continue
        variable = true
        for (const name of themeJsonSameValue(json, at.old, t.token))
          if (!sameValue.includes(name)) sameValue.push(name)
      }
      if (!variable) late = true
    }
    const fileSheet = editableSheet(platform, t.sheet)
    const bytes = fileSheet === null ? null : await io.read(`${webroot}${fileSheet}`)
    if (bytes !== null) {
      const decls = cssDeclarations(bytes.toString('utf8'))
      const picked = pickDeclaration(decls, { name: t.token, by: t.by, line: t.line })
      const inMedia = picked.ok ? picked.decl.media.filter((m) => m !== 'all') : []
      if (picked.ok && inMedia.length <= 1) {
        noteOthers(decls, picked.decl, also, sameValue)
        return {
          selectors: picked.decl.theme ? ':root' : picked.decl.selectors.join(', '),
          media: inMedia[0] ?? null,
          important: picked.decl.important,
          late
        }
      }
    }
    const where = parseBy(t.by)
    return where === null || where.cut
      ? null
      : { selectors: where.selectors, media: where.media, important: false, late }
  }

  // 🔒 A TOKEN THE DESIGN-SYSTEM SLOT SETS IS THE SYSTEM'S (10/10/2026, `ds-slot-worn.mjs`). Measured on
  // the stand's EmDash site wearing Moxie: `--color-signal` was won by `<style id="tracy-ds-slot">`, and
  // the refusal said only "not a file look.set can change" — the agent then pinned the system's values
  // by hand. Setting it again for every page would override the system itself; so the answer says whose
  // value it is and what to do instead, before anything is written.
  // 🔒 NEVER A "NO" TO THE CUSTOMER (beta week, 20/10/2026). "Signal colour is blue; make it red": this
  // answer said "tell the customer … is choosing another design system", the agent refused, and the
  // customer left after that one request (and another the week before). The lock stays — no site-wide
  // value over the slot — but the agent makes the change where the customer means it, and offers the
  // other design system as a choice, never as the answer.
  const slotOwned = tokens.find((t) => t.sheet === DS_SLOT_SHEET)
  if (slotOwned !== undefined)
    return {
      ...refuse(
        `${slotOwned.token} is set by the design system this site wears (Tracy's design-system slot, ${DS_SLOT_SHEET}), which owns it on every page`
      ),
      next:
        'Never answer the customer that it cannot be changed: make the change on the elements or pages they mean, as below, and say in one line it is set there and will not follow a later design-system change. ' +
        "Only if they want it on every page of the site, say this value is their design system's own and offer the choice: you set it on the parts they name, or they pick another design system in the Design system tab. " +
        (platform === 'emdash'
          ? `For one element, edit its class in the \`.astro\` view relative to the slot's variable (\`var(${slotOwned.token})\`, or a \`calc()\` of it for a size), never its value typed back, then the one rebuild.`
          : // 🔒 RELATIVE TO THE SLOT HERE TOO (Akemi, 20/10/2026): "the value they named" read as a literal,
            // so "a rounder button" became the system's own radius typed back, and the next system missed it.
            `For one element or one page, call look.set with scope "element" or "page": a change of degree (bigger, rounder, darker) relative to the slot's variable (\`calc(var(${slotOwned.token}) + 4px)\`, \`color-mix(in srgb, var(${slotOwned.token}) 80%, black)\`), never its value typed back; only a value the customer named exactly is written as they named it, and say it will not follow the next design system.`)
    }
  for (const t of tokens) {
    if (platform === 'wordpress') {
      const placed = await wpTokenRule(t)
      if (placed === null)
        return refuse(
          `${t.token} is set by ${t.by}${t.sheet ? ` in ${t.sheet}` : ''}, a rule look.set cannot name whole to set it again`
        )
      append(
        placed.selectors,
        [t.token, t.value, placed.important],
        posOf(t.sheet),
        `${t.token}, every page`,
        placed.media,
        specificity(placed.selectors),
        null,
        placed.late
      )
      continue
    }
    let done = false
    const fileSheet = editableSheet(platform, t.sheet)
    if (!done && fileSheet !== null) done = await inPlace(`${webroot}${fileSheet}`, t, true)
    if (!done && platform === 'emdash' && t.sheet !== null && t.sheet.startsWith('/_astro/'))
      for (const file of EMDASH_STYLE_FILES) if (!done) done = await inPlace(file, t, false)
    if (done) continue
    const where = parseBy(t.by)
    if (platform === 'emdash' || where === null || where.cut)
      return refuse(
        `${t.token} is set by ${t.by}${t.sheet ? ` in ${t.sheet}` : ''}, which is not a file look.set can change`
      )
    // set again by its own rule, after the sheet that sets it now (T4's bundle, a plugin's sheet)
    append(
      where.selectors,
      [t.token, t.value, false],
      posOf(t.sheet),
      `${t.token}, every page`,
      where.media,
      specificity(where.selectors)
    )
  }

  /** WordPress: the Additional CSS as read, and what it holds once the rules are appended. */
  /** @type {{ stylesheet: string, css: string, existed: boolean, next: string } | null} */
  let custom = null
  if (appends.length > 0 && platform === 'wordpress') {
    if (io.customCss === undefined) return refuse("Tracy cannot reach this site's Additional CSS")
    let current
    try {
      current = await io.customCss.read()
    } catch (error) {
      return refuse(
        `Tracy could not read this site's Additional CSS (${error instanceof Error ? error.message : String(error)})`
      )
    }
    // where the page prints Additional CSS (the top of this file): its own `<style id="wp-custom-css">`
    // when the page already shows it; on a block theme inside global styles; on a classic theme the end
    // of <head>. A rule whose winner stands in a sheet printed later is made MORE specific than it.
    const printed = sheets.indexOf(WP_CUSTOM_CSS_SHEET)
    const merged = printed < 0 && current.block === true
    const notPrinted = additionalCssNotPrinted(sheets, current)
    if (notPrinted !== null) return { ...refuse(notPrinted.why), ...notPrinted.answer }
    const own =
      printed >= 0
        ? printed
        : merged
          ? sheets.findIndex((sheet) => /global-styles-inline-css/.test(sheet))
          : sheets.length
    // 🔒 IN GLOBAL STYLES ITSELF, A TIE LOSES (dskeepwp, 09/10/2026; WordPress 7.1.3 `script-loader.php`
    // `wp_enqueue_global_styles`): a block theme's Additional CSS goes in AFTER theme.json's variables,
    // styles and presets but BEFORE theme.json's own `styles.css` — where a design-system slot writes
    // its (0,6,0)+ rules — so a rule there exactly as specific as one of those loses. Which part of the
    // sheet a winner stands in, the cascade does not say; one more specific than `:root` (what the
    // variables and presets stand on) is beaten strictly, and so is a token `wpTokenRule` found set
    // after the Additional CSS (`late`: theme.json's own `styles.css`, or no theme.json variable at all).
    for (const a of appends)
      if (
        a.after > own ||
        (merged && own >= 0 && a.after === own && (compareSpec(a.beat, [0, 1, 0]) > 0 || a.late))
      )
        a.selector = beyond(a.selector, a.beat)
    const tail = appends.map((a) => ruleText(a)).join('\n')
    custom = {
      stylesheet: current.stylesheet,
      css: current.css,
      existed: current.exists !== false,
      next:
        current.css.trim() === '' ? tail : `${current.css}${current.css.endsWith('\n') ? '' : '\n'}\n${tail}`
    }
    for (const a of appends)
      wrote.push({
        file: ADDITIONAL_CSS,
        change: `added ${ruleText(a).split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim()}`
      })
  } else if (appends.length > 0) {
    // the stylesheet the appended rules go into: one of the theme's or template's, loaded at or after
    // every sheet whose rule they must beat
    const after = Math.max(...appends.map((a) => a.after))
    // Joomla: the template's own customisation stylesheet ({@link ownStyleSheet}); where its order
    // against the winning rule is not known, or it loads before it, the rule is made more specific.
    const own =
      platform === 'joomla' ? await ownStyleSheet({ info, sheets, read: (f) => io.read(f), webroot }) : null
    const editable = sheets.flatMap((name, k) => {
      const at = editableSheet(platform, name)
      return at === null ? [] : [{ at, k }]
    })
    const target = own ?? (after >= 0 ? editable.find((sheet) => sheet.k >= after) : editable.at(-1))
    const kind = platform === 'joomla' ? 'template' : 'theme'
    if (target === undefined)
      return refuse(
        after >= 0
          ? `no stylesheet of this site's ${kind} loads after ${sheets[after]}, where the rule that wins now stands`
          : `this page loads no stylesheet of this site's ${kind}`
      )
    if (own !== null && (own.k < 0 || own.k < after))
      for (const a of appends) a.selector = beyond(a.selector, a.beat)
    const file = `${webroot}${target.at}`
    // a customisation file the template has not got yet is created (its undo removes it again)
    const entry =
      (await fileOf(file)) ??
      (own !== null && own.k < 0
        ? (files.set(file, { old: '', text: '', tail: [] }).get(file) ?? null)
        : null)
    if (entry === null)
      return refuse(`${target.at} is not a file of this site, so nothing can be added to it`)
    for (const a of appends) {
      const text = ruleText(a)
      entry.tail.push(text)
      wrote.push({
        file: shown(file, siteRoot),
        change: `added ${text.split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim()}`
      })
    }
  }

  /** @type {[string, string][]} */
  const out = []
  for (const [file, entry] of files) {
    const text =
      entry.tail.length === 0
        ? entry.text
        : entry.text === ''
          ? entry.tail.join('\n')
          : `${entry.text}${entry.text.endsWith('\n') ? '' : '\n'}\n${entry.tail.join('\n')}`
    if (text !== entry.old) out.push([file, text])
  }
  if (out.length === 0 && custom === null) return refuse('the files already say exactly this')
  let kept
  try {
    kept = await takeLookSnapshot({
      siteRoot,
      files: out.map(([file]) => file),
      io,
      tool: 'look.set',
      ...(custom === null
        ? {}
        : { customCss: { stylesheet: custom.stylesheet, css: custom.css, existed: custom.existed } })
    })
  } catch (error) {
    return refuse(
      `Tracy could not keep an undo copy first (${error instanceof Error ? error.message : String(error)}), so nothing was written`
    )
  }
  if (custom !== null && io.customCss !== undefined) {
    // only while the Additional CSS still holds what was read: a person saving it at the same
    // moment is never overwritten
    let put
    try {
      put = await io.customCss.write({
        stylesheet: custom.stylesheet,
        css: custom.next,
        expect: cssHash(custom.css)
      })
    } catch (error) {
      await dropLookSnapshot({ siteRoot, id: kept.id })
      return refuse(
        `WordPress did not save the Additional CSS (${error instanceof Error ? error.message : String(error)})`
      )
    }
    if (put.ok !== true) {
      await dropLookSnapshot({ siteRoot, id: kept.id })
      return refuse(
        "this site's Additional CSS changed while look.set was writing (a person saved it at the same moment): read the page again and call look.set once more"
      )
    }
    await noteLookAfter({ siteRoot, id: kept.id, css: put.css }).catch(() => {
      // the change stands; look.revert then says this undo was not kept whole
    })
  }
  for (const [file, text] of out) await io.write(file, Buffer.from(text, 'utf8'))

  const pick = (/** @type {Row | undefined} */ row) => (row ? (row.hex ?? row.value ?? null) : null)
  /** @type {Record<string, unknown>} */
  const values = {}
  /** @type {Record<string, unknown>} */
  const answer = {
    ok: true,
    element,
    scope: req.scope,
    reach: [...new Set(reach)].join('; '),
    ...(forWidth ? { for: forWidth } : {}),
    ...(typeof info.matches === 'number' && info.matches > 1 ? { matches: info.matches } : {}),
    wrote,
    values
  }
  if (also.length > 0) answer.alsoSet = also
  if (sameValue.length > 0)
    answer.sameValue = `${sameValue.join(', ')} ${sameValue.length === 1 ? 'holds' : 'hold'} the old value too: change ${sameValue.length === 1 ? 'it' : 'them'} only if the customer means the same colour (look.set props {"<token>": …}, scope "site")`
  answer.undo = kept.id
  const languages =
    req.scope !== 'site' && onPage !== null
      ? ' This page in another language is another page: one look.set on each.'
      : ''
  if (platform === 'emdash') {
    for (const [name] of req.props) values[name] = { before: pick(rows[name]), after: 'after the rebuild' }
    answer.next = `Make every look edit of the request, then ONE tracy_site_build_emdash request site.rebuild, then page.look to check. Its undo, yours to call and never in the reply: look.revert {undo:"${kept.id}"}.`
    return answer
  }
  // what a visitor sees is read again: the first copy of a link hidden here, else the element itself
  const seen = copies[0] ?? null
  const shownRows = seen === null ? rows : seen.props
  const again = await measure(
    seen !== null
      ? { selector: seen.unique, nth: 0, props: names, viewport }
      : unique !== null
        ? { selector: unique, nth: 0, props: names, viewport }
        : { ...req.target, props: names, viewport },
    req.path
  )
  const payload =
    again.ok === true && again.payload && typeof again.payload === 'object' ? again.payload : null
  if (payload === null || typeof payload.error === 'string') {
    for (const [name] of req.props) values[name] = { before: pick(shownRows[name]), after: 'not read' }
    answer.next = `Written, but the page could not be read again: check it with page.look.${languages} Its undo, yours to call and never in the reply: look.revert {undo:"${kept.id}"}.`
    return answer
  }
  const afterRows = /** @type {Record<string, Row>} */ (payload.props ?? {})
  let moved = 0
  for (const [name] of req.props) {
    const b = pick(shownRows[name])
    const a = pick(afterRows[name])
    values[name] = { before: b, after: a }
    if (a !== b) moved += 1
  }
  if (payload.info?.hidden) answer.hidden = payload.info.hidden
  if (moved === 0) {
    try {
      await revertLook({ siteRoot, undo: kept.id, io })
    } catch {
      // the answer below still says what was tried; the undo id stays with it
    }
    const still = req.props
      .map(
        ([name]) =>
          `${name}: ${pick(afterRows[name])} by ${afterRows[name]?.by ?? '?'}${afterRows[name]?.sheet ? ` in ${afterRows[name].sheet}` : ''}`
      )
      .join('; ')
    return {
      ok: false,
      code: 'LOOK_SET_NO_EFFECT',
      element,
      error: `Nothing changed on the page (${still}), so ${platform === 'wordpress' ? "the site's Additional CSS was" : 'the files were'} put back as ${platform === 'wordpress' ? 'it was' : 'they were'}.`,
      next: 'If that is already the value asked, there is nothing to do. Otherwise another rule wins: change it on the file road the LOOK line describes, then page.look.',
      tried: wrote
    }
  }
  if (through.length > 0) answer.throughRoles = through.map((t) => `${t.prop}: ${t.use}`)
  const roled =
    through.length > 0
      ? ` Written through the design-system role (${through.map((t) => `\`${t.prop}: ${t.use}\``).join('; ')}): it shows exactly the value asked now, and a design system applied later reaches it; nothing more to do for it.`
      : ''
  answer.next = `Done when the after values are what was asked.${roled}${languages} Its undo, yours to call and never in the reply: look.revert {undo:"${kept.id}"}.`
  return answer
}

/**
 * The winning blocks a change to one property must beat: the row's own, or — for a shorthand whose
 * longhands different rules win (`resolveStyles` `parts`) — each of them.
 * @param {Row} row
 * @returns {Row[]}
 */
function winnersOf(row) {
  return Array.isArray(row.parts) && row.parts.length > 1 ? row.parts : [row]
}

/** Why EmDash's sections are not look.set's: what to do instead. */
const EMDASH_SECTION =
  'on EmDash one section or element is the classes of its `.astro` view, and its pages carry no class a rule could be scoped by: edit them on the file road, then the one rebuild. look.set changes EmDash tokens (scope "site")'

/**
 * Other declarations of the token in the same file (dark mode, another media) — left as they are and
 * said — and other tokens of the same rule holding the value it had.
 */
function noteOthers(
  /** @type {Declaration[]} */ decls,
  /** @type {Declaration} */ decl,
  /** @type {string[]} */ also,
  /** @type {string[]} */ sameValue
) {
  for (const d of decls)
    if (d !== decl && d.name === decl.name && !d.nested && also.length < 3)
      also.push(
        `${decl.name} is also set by ${d.theme ? '@theme' : d.selectors.join(', ')}${d.media.length > 0 ? ` @media ${d.media.join(' ')}` : ''} (unchanged)`
      )
  const old = decl.value.trim().toLowerCase()
  for (const d of decls)
    if (
      d !== decl &&
      d.name.startsWith('--') &&
      d.name !== decl.name &&
      d.value.trim().toLowerCase() === old &&
      d.theme === decl.theme &&
      d.selectors.join(',') === decl.selectors.join(',') &&
      d.media.join(',') === decl.media.join(',') &&
      !sameValue.includes(d.name) &&
      sameValue.length < 5
    )
      sameValue.push(d.name)
}

/** The WordPress themes this page runs, child first: `wp-child-theme-<x>`, `wp-theme-<x>`, then its sheets. */
function wpThemes(/** @type {Info} */ info) {
  const classes = typeof info.body === 'string' ? info.body.split(/\s+/) : []
  /** @type {string[]} */
  const out = []
  const add = (/** @type {string | undefined} */ slug) => {
    if (slug && /^[\w.-]+$/.test(slug) && slug !== '.' && slug !== '..' && !out.includes(slug)) out.push(slug)
  }
  for (const c of classes) add(/^wp-child-theme-(.+)$/.exec(c)?.[1])
  for (const c of classes) add(/^wp-theme-(.+)$/.exec(c)?.[1])
  for (const s of Array.isArray(info.sheets) ? info.sheets : [])
    add(/^\/wp-content\/themes\/([^/]+)\//.exec(s)?.[1])
  return out
}

/**
 * The refusal when look.set has no road for a call: what it could not do, and the road that can —
 * naming the reading it carries only when the page was read before the refusal.
 * @param {string} why
 * @param {boolean} [measured]
 */
function noRoad(why, measured = false) {
  return {
    ok: false,
    code: 'LOOK_SET_NO_ROAD',
    error: `look.set wrote nothing: ${why}.`,
    next: `Change it on the file road the LOOK line of the rules describes${measured ? ' (what was measured is below)' : ''}, then page.look to check.`
  }
}
