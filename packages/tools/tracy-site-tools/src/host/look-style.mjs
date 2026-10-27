/**
 * HOW ONE ELEMENT LOOKS, AND WHERE THAT COMES FROM — `page.look {path, style:{…}}` (suite v6, item
 * #3, 28/09/2026). In the site container's own browser (`BROWSER_SCRIPT` mode `style`, exec.mjs): the
 * element whose own visible words are the ones asked (or a CSS selector), its computed values, and
 * for each value the declaration that wins, the rule and stylesheet it stands in, and the chain of
 * `var(--token)`s behind it down to where each token is SET.
 *
 * 🔒 WHY THE TOKEN AND NOT JUST THE VALUE. A designer asked to make "the button" another colour
 * patched the one element (an inline style, a new rule) because nothing told it the colour is a
 * theme token that every button shares; verifying took `grep` loops over minified CSS (KNOWLEDGE-MAP
 * §4 #3). The cascade is the browser's: this reads it over CDP (`CSS.getMatchedStylesForNode`, the
 * data DevTools' Styles pane shows) rather than re-deriving specificity, layers and media here.
 *
 * 🔒 THREE KINDS OF CODE LIVE HERE, AND TWO OF THEM RUN ELSEWHERE:
 * - {@link findTarget} and {@link describeTarget} run IN THE PAGE (CDP `Runtime.evaluate` /
 *   `callFunctionOn`), and {@link resolveStyles} runs in the container's node beside chromium —
 *   `exec.mjs` embeds all three by their source text (`String(fn)`). So each is SELF-CONTAINED: no
 *   name from this module's scope, no import (`test/look-style.test.mjs` compiles each one alone);
 * - {@link styleRequest} and {@link styleAnswer} run on the host: what the call may ask, and the
 *   answer the model reads.
 *
 * 🔒 WHAT IT DOES NOT CLAIM (CLAUDE.md principle 3). The winning declaration is the last one in the
 * browser's cascade order, `!important` first; two `!important` declarations in different cascade
 * layers are read in that same order (the browser reverses layer order for them) — rare on the three
 * templates, and said here rather than guessed at. Nothing is computed from CSS text.
 */

/** The properties read when a call names none: what "how does it look" is usually about. */
export const STYLE_DEFAULT_PROPS = Object.freeze([
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight'
])
/** The most properties one call reads. */
export const STYLE_MAX_PROPS = 8
/**
 * The viewports a style is read at: desktop and mobile exactly the v6 oracles' (`bench v6
 * lib/style.mjs` `VIEWPORTS`) — a style checked here at another width could cross a breakpoint the
 * oracle does not — and a portrait tablet, the width where Bootstrap's and Tailwind's `md` begins.
 */
export const STYLE_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900, mobile: false }),
  tablet: Object.freeze({ width: 768, height: 1024, mobile: true }),
  mobile: Object.freeze({ width: 390, height: 844, mobile: true })
})

/**
 * The viewport a call means, or null when its words name none: a name (`desktop`, `tablet`,
 * `mobile`), a device word (`phone`, `iPad`, `laptop`), or a size (`390x844`, `390×844`, `"phone
 * 390×844"`) — a size is read at the named viewport of its width class (below 768 a phone, below
 * 1024 a tablet, else a desktop), and the answer's `viewport` says which size was read.
 *
 * 🔒 EACH OF THESE WAS A REFUSAL (flow D, 05/10/2026): `"390x844"`, `"1440x900"`, `"1280x900"`,
 * `"phone 390×844"` were all answered BAD_STYLE — 5 of the 55 runs spent 1–2 calls on it, two of them
 * twice in one step — for a question whose meaning was never in doubt.
 * @param {unknown} asked
 * @returns {'desktop' | 'tablet' | 'mobile' | null}
 */
export function viewportOf(asked) {
  if (asked === undefined || asked === null || asked === '') return 'desktop'
  if (typeof asked !== 'string') return null
  const s = asked.trim().toLowerCase()
  if (s === 'desktop' || s === 'tablet' || s === 'mobile') return s
  const size = /(\d{3,4})\s*(?:px)?\s*[x×*]\s*\d{3,4}/.exec(s) ?? /^(\d{3,4})\s*(?:px)?(?:\s+wide)?$/.exec(s)
  if (size !== null) {
    const width = Number(size[1])
    return width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'
  }
  if (/\b(?:phones?|mobiles?|smartphones?|iphone|android|handheld)\b/.test(s)) return 'mobile'
  if (/\b(?:tablets?|ipad)\b/.test(s)) return 'tablet'
  if (/\b(?:desktops?|laptops?|pc|computers?|wide)\b/.test(s)) return 'desktop'
  return null
}

const BAD_STYLE_NEXT =
  'Call again with style:{text:"<the words the element shows>"} or {selector:"<css>", nth?:0 = the first}, props?:["color", …], viewport?:"mobile".'

/** Every key `page.look` reads, and every key its `style` reads (`styleRequest`). */
export const LOOK_KEYS = Object.freeze(['path', 'style', 'maxChars'])
export const STYLE_KEYS = Object.freeze(['text', 'selector', 'nth', 'props', 'prop', 'viewport'])

/**
 * `page.look`'s parameters, checked before anything is asked of the site: null when every key is one
 * it reads, else the refusal naming the keys it takes.
 *
 * 🔒 AN IGNORED KEY IS A SILENT WRONG ANSWER (suite v6 BEFORE, 29/09/2026). `full:true`,
 * `fullPage:true` and `scrollTo:"bottom"` were each dropped without a word, and the agent got the
 * same 1280×800 picture back — identical hash — then spent steps on curl and its own Chromium to see
 * what sat below it (WordPress L4-01 T3, Joomla L4-01 T3). A refusal costs one call; a picture that
 * pretends to answer the question costs the theory built on it.
 * @param {Record<string, unknown>} params
 * @returns {{ ok: false, code: 'BAD_PARAMS', error: string, next: string } | null}
 */
export function lookParamsProblem(params) {
  const given = (/** @type {Record<string, unknown>} */ record) =>
    Object.keys(record).filter((key) => record[key] !== undefined && record[key] !== null)
  const top = given(params ?? {}).filter((key) => !LOOK_KEYS.includes(key))
  const style = params?.style
  const inner =
    style !== null && typeof style === 'object' && !Array.isArray(style)
      ? given(/** @type {Record<string, unknown>} */ (style))
          .filter((key) => !STYLE_KEYS.includes(key))
          .map((key) => `style.${key}`)
      : []
  const unknown = [...top, ...inner]
  if (unknown.length === 0) return null
  // A style key written beside `path` is the one mistake with an exact fix.
  const misplaced = top.filter((key) => STYLE_KEYS.includes(key))
  return {
    ok: false,
    code: 'BAD_PARAMS',
    error: `page.look takes path, style {text | selector, nth?, props?, viewport?} and maxChars, nothing else: ${unknown
      .slice(0, 4)
      .map((key) => `"${key.slice(0, 40)}"`)
      .join(', ')} would have been ignored.`,
    next:
      misplaced.length > 0
        ? `Put ${misplaced.join(', ')} inside style:{…} and call again.`
        : 'The picture is always the top 1280×800 of the page. For an element below it, or a value — a colour, a size, whether it shows on a phone — call page.look {path, style:{text:"<its words>", props?, viewport?:"mobile"}}.'
  }
}

/**
 * What a screenshot that failed tells the agent to do next (`LOOK_FAILED` on the picture road).
 *
 * 🔒 IT HAD NO NEXT (suite v6 BEFORE): three of the four failures on Joomla followed the agent
 * deleting T4's caches, which the site rebuilds on its next request, and the agent then retried
 * blind or built its own browser. Once more is right for a site that is still starting; a value is
 * better read than photographed.
 */
export const LOOK_FAILED_NEXT =
  'Call page.look once more — a site just rebuilt or restarted may still be starting. For a value (a colour, a size, whether it shows), style:{text:"<its words>"} reads it without a picture. Failing twice: tell the customer the page could not be seen.'

/**
 * `style` as `page.look` takes it: `{text | selector, nth?, props?, viewport?}`, or the words alone
 * as a string; `prop` for one property. Refused before any exec, naming what is wrong (T10).
 * @param {unknown} asked
 * @returns {{ ok: true, req: { text?: string, selector?: string, nth: number, props: string[], viewport: 'desktop' | 'tablet' | 'mobile' } }
 *   | { ok: false, answer: { ok: false, code: 'BAD_STYLE', error: string, next: string } }}
 */
export function styleRequest(asked) {
  const bad = (/** @type {string} */ error) => ({
    ok: /** @type {const} */ (false),
    answer: {
      ok: /** @type {const} */ (false),
      code: /** @type {const} */ ('BAD_STYLE'),
      error,
      next: BAD_STYLE_NEXT
    }
  })
  const s = /** @type {Record<string, unknown>} */ (
    typeof asked === 'string'
      ? { text: asked }
      : asked && typeof asked === 'object' && !Array.isArray(asked)
        ? asked
        : {}
  )
  const text = typeof s.text === 'string' ? s.text.replace(/\s+/g, ' ').trim() : ''
  const selector = typeof s.selector === 'string' ? s.selector.trim() : ''
  if (text === '' && selector === '')
    return bad('style names no element: give text (its visible words) or selector')
  if (text !== '' && selector !== '') return bad('style takes text or selector, not both')
  if (text.length > 200 || selector.length > 200)
    return bad('style text or selector is longer than 200 characters')
  const nthRaw = typeof s.nth === 'string' && /^\d+$/.test(s.nth) ? Number(s.nth) : s.nth
  const nth = nthRaw === undefined || nthRaw === null ? 0 : nthRaw
  if (typeof nth !== 'number' || !Number.isInteger(nth) || nth < 0 || nth > 200)
    return bad('style nth must be a whole number from 0 (the first match)')
  const listed = s.props ?? s.prop ?? []
  const list = (typeof listed === 'string' ? listed.split(/[\s,]+/) : Array.isArray(listed) ? listed : [null])
    .map((p) => (typeof p === 'string' ? p.trim().toLowerCase() : p))
    .filter((p) => p !== '')
  if (list.some((p) => typeof p !== 'string' || !/^(--)?[a-z][a-z0-9-]*$/.test(p)))
    return bad('style props must be CSS property names, e.g. ["color", "background-color"]')
  const props = [...new Set(/** @type {string[]} */ (list))]
  if (props.length > STYLE_MAX_PROPS) return bad(`style reads at most ${STYLE_MAX_PROPS} props in one call`)
  const vp = viewportOf(s.viewport)
  if (vp === null)
    return bad(
      'style viewport is "desktop" (1440×900), "tablet" (768×1024) or "mobile" (390×844), or a size like "390x844"'
    )
  return {
    ok: true,
    req: {
      ...(text !== '' ? { text } : { selector }),
      nth,
      props: props.length > 0 ? props : [...STYLE_DEFAULT_PROPS],
      viewport: vp
    }
  }
}

// ── In the page (serialized; self-contained) ────────────────────────────────────────────────────

/**
 * The selectors of the rules that win each asked property (`resolveStyles`' `by`: its selectors, then
 * ` @media …` and ` @layer …`), for {@link countPaints}: '' for a winner that is no rule (an attribute,
 * the style attribute, the browser default) or a selector the cascade cut (`…`). Runs in the CDP
 * script (embedded by source, so self-contained), in the order of `props`.
 *
 * 🔒 WHY (20/10/2026): `look.set` at scope "page" writes "every element the winning rule paints" on the
 * page, and said how many only after the write, if at all. Staff on real customer sites: "when Tracy
 * fixes one place it often breaks another place". With the count read in the same visit, a rule that
 * paints more than the one element asks before anything is written (`look-set.mjs` `wide`).
 * @param {Record<string, { by?: unknown }>} props
 * @returns {string[]}
 */
export function paintSelectors(props) {
  return Object.values(props).map(function (row) {
    const by = String((row && row.by) || '')
      .replace(/\s@layer\s.+$/, '')
      .replace(/\s@media\s.+$/, '')
      .trim()
    if (by === '' || by === '?' || by.endsWith('\u2026')) return ''
    if (/^(?:its style attribute|an HTML attribute|the browser default|no rule)/.test(by)) return ''
    return by
  })
}

/**
 * How many elements of the page each selector matches, -1 where it cannot be told (none, or one the
 * page's `querySelectorAll` does not take). Runs IN THE PAGE (embedded by source).
 * @param {string[]} list
 * @returns {number[]}
 */
export function countPaints(list) {
  return list.map(function (s) {
    if (!s) return -1
    try {
      return document.querySelectorAll(s).length
    } catch {
      return -1
    }
  })
}

/**
 * IN THE PAGE: the element a style call means, or why there is none (a string). By text: the
 * visible element whose OWN words are exactly those (the pick's rule, and the v6 oracle's), then the
 * same ignoring case, then one whose words start with, equal, or contain them (the smallest); an
 * element inside a link or button that shows the same words becomes that link or button — what a
 * visitor calls "the button". `nth` counts exact matches, or selector matches, in document order.
 * How many there were is left on `window.__tracyLook` for {@link describeTarget}.
 *
 * 🔒 A HIDDEN ELEMENT IS FOUND, AND SAID HIDDEN (flow D, 05/10/2026). When no visible element shows
 * the words, one the page holds but does not show — exactly those words, or ignoring case; never a
 * partial match — is the answer, and {@link describeTarget} says why it is hidden. It was
 * STYLE_TARGET_NOT_FOUND: every "hide it on phones" run checked its own change at `mobile`, was told
 * the button did not exist, and spent a second call (and on Joomla a selector hunt) learning it was
 * `display:none` — the very thing it had just made true.
 * @param {{ text?: string, selector?: string, nth?: number }} q
 * @returns {Element | string}
 */
export function findTarget(q) {
  const norm = (/** @type {unknown} */ s) =>
    String(s == null ? '' : s)
      .replace(/\s+/g, ' ')
      .trim()
  const own = (/** @type {Element} */ el) =>
    norm(
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.nodeValue)
        .join(' ')
    )
  const shown = (/** @type {Element} */ el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const st = getComputedStyle(el)
    return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05
  }
  const area = (/** @type {Element} */ el) => {
    const r = el.getBoundingClientRect()
    return r.width * r.height
  }
  const inner = (/** @type {Element} */ el) => norm(/** @type {HTMLElement} */ (el).innerText)
  const nth = typeof q.nth === 'number' && q.nth >= 0 ? q.nth : 0
  /** @type {Element | null} */
  let el = null
  let matches = 0
  let how = ''
  if (q.selector) {
    /** @type {Element[]} */
    let list = []
    try {
      list = Array.from(document.querySelectorAll(q.selector))
    } catch {
      return `"${String(q.selector).slice(0, 60)}" is not a CSS selector this browser reads`
    }
    matches = list.length
    how = 'selector'
    el = list[nth] ?? null
    if (el === null && list.length === 0) {
      // 🔒 CSS WRITTEN FOR NOTHING ON THE PAGE IS STILL CHECKED (#1710): whether a stylesheet this page
      // loads holds a rule for exactly this selector — a rule saved where the page never prints it
      // (WordPress Additional CSS on a page that drops it, a theme file the page does not link) is not.
      const flat = (/** @type {unknown} */ s) =>
        String(s)
          .replace(/\s+/g, ' ')
          .replace(/\s*([>+~,])\s*/g, '$1')
          .trim()
      const want = flat(q.selector)
      /** @returns {boolean} */
      const holds = (/** @type {any} */ rules, /** @type {number} */ depth) =>
        depth <= 6 &&
        Array.from(rules ?? []).some(
          (/** @type {any} */ r) =>
            (typeof r.selectorText === 'string' && flat(r.selectorText).split(',').includes(want)) ||
            (r.cssRules != null && holds(r.cssRules, depth + 1))
        )
      /** @type {string | null} */
      let where = null
      for (const sheet of Array.from(document.styleSheets ?? [])) {
        const s = /** @type {any} */ (sheet)
        let rules
        try {
          rules = s.cssRules
        } catch {
          continue
        }
        if (!holds(rules, 0)) continue
        where = 'a <style> in the page'
        try {
          if (s.href) {
            const u = new URL(s.href)
            where = u.origin === location.origin ? u.pathname : u.origin + u.pathname
          } else if (s.ownerNode && s.ownerNode.id) where = `<style id="${String(s.ownerNode.id)}">`
        } catch {
          where = 'a stylesheet'
        }
        where = where.slice(0, 70)
        break
      }
      return `the selector "${String(q.selector).slice(0, 60)}" matches 0 elements${where === null ? ', and no stylesheet this page loads has a rule for it' : `; the page loads a rule for it, in ${where}`}`
    }
    if (el === null)
      return `the selector "${String(q.selector).slice(0, 60)}" matches ${list.length} element${list.length === 1 ? '' : 's'}${list.length > 0 ? `, so there is no #${nth} (nth counts from 0: the first is 0)` : ''}`
  } else {
    const want = norm(q.text)
    const every = Array.from(document.body ? document.body.querySelectorAll('*') : []).filter(
      (x) => !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(x.tagName)
    )
    const all = every.filter(shown)
    let exact = all.filter((x) => own(x) === want)
    how = 'exact'
    if (exact.length === 0) {
      exact = all.filter((x) => own(x).toLowerCase() === want.toLowerCase())
      how = 'case'
    }
    // none shown: one the page holds but hides, by exactly those words (never a partial match)
    if (exact.length === 0) {
      const unseen = every.filter((x) => !shown(x))
      exact = unseen.filter((x) => own(x) === want)
      how = 'exact'
      if (exact.length === 0) {
        exact = unseen.filter((x) => own(x).toLowerCase() === want.toLowerCase())
        how = 'case'
      }
      if (exact.length === 0) how = 'exact'
    }
    matches = exact.length
    if (exact.length > 0) {
      el = exact[nth] ?? null
      if (el === null)
        return `the words "${want.slice(0, 60)}" show ${exact.length} time${exact.length === 1 ? '' : 's'}, so there is no #${nth} (nth counts from 0: the first is 0)`
    } else {
      how = 'partial'
      const smallest = (/** @type {Element[]} */ list) => list.sort((a, b) => area(a) - area(b))[0] ?? null
      el =
        all.find((x) => own(x).startsWith(want)) ??
        smallest(all.filter((x) => inner(x) === want)) ??
        smallest(all.filter((x) => own(x).includes(want))) ??
        smallest(all.filter((x) => inner(x).includes(want)))
      if (el === null) return `no element on this page shows the words "${want.slice(0, 60)}"`
    }
    const ctl = el.closest('a, button, [role="button"]')
    if (ctl !== null && ctl !== el) {
      let up = 0
      for (let n = /** @type {Element | null} */ (el); n !== null && n !== ctl; n = n.parentElement) up += 1
      const t = inner(ctl)
      const w = inner(el)
      if (up <= 3 && t.includes(w) && t.length <= w.length + 4) el = ctl
    }
  }
  Reflect.set(window, '__tracyLook', { matches, how })
  return el
}

/**
 * IN THE PAGE, with `this` = the element {@link findTarget} found: what the browser computed for each
 * property (colours also as `#hex`), the element and its ancestors described, and — for
 * `background-color` — which of them PAINTS it: the first one whose background is not transparent,
 * the colour a visitor sees behind the words (`paint`: 0 the element, k its k-th ancestor, -1 none).
 * `hidden` is false, or why a visitor does not see it (`display:none`, on it or on an ancestor).
 *
 * `forSet` (`tracy_site` `look.set`, `look-set.mjs`) adds what a scoped rule is written from: a
 * selector that matches this element and no other on the page (`unique`), the body's classes (the
 * page's own class: `page-id-42`, `item-599`), whether it sits in the site's header or footer
 * (`chrome`: then it is the same element on every page), and every stylesheet in document order,
 * each named as the cascade answer names it (`exec.mjs`), so a rule can be added AFTER the one that
 * wins.
 * @this {Element}
 * @param {string[]} props
 * @param {boolean} [forSet]
 */
export function describeTarget(props, forSet) {
  const el = this
  const name = (/** @type {Element} */ e) => {
    let s = `<${e.tagName.toLowerCase()}`
    if (e.id) s += `#${e.id}`
    // 🔒 SIX CLASSES, NOT TWO (22/10/2026). A layout is often a class (`nav-pills`, `row`, `d-flex`), and the
    // third or fourth class of a menu list was the one that stacked its items: the agent was told
    // `ul.mod-menu.mod-list`, said it had made the menu horizontal six times, and the page did not change.
    // The name is still cut at 78 characters below, so a long class list cannot grow the answer.
    const cls =
      typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 6) : []
    if (cls.length > 0) s += `.${cls.join('.')}`
    return `${s.slice(0, 78)}>`
  }
  const cv = document.createElement('canvas')
  cv.width = 1
  cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = (/** @type {string} */ v) => {
    if (!cx || !v || !CSS.supports('color', v)) return null
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = '#000'
    cx.fillStyle = v
    cx.fillRect(0, 0, 1, 1)
    return Array.from(cx.getImageData(0, 0, 1, 1).data)
  }
  const hex = (/** @type {number[]} */ c) =>
    `#${c
      .slice(0, 3)
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')}${c[3] < 255 ? c[3].toString(16).padStart(2, '0') : ''}`
  const colorish = (/** @type {string} */ p) => /(^|-)color$/.test(p) || p === 'fill' || p === 'stroke'
  const cs = getComputedStyle(el)
  /** @type {Record<string, string>} */
  const computed = {}
  /** @type {Record<string, string>} */
  const hexes = {}
  let paint = 0
  for (const p of props) {
    let v = cs.getPropertyValue(p).trim()
    if (p === 'background-color') {
      let e = /** @type {Element | null} */ (el)
      let k = 0
      while (e !== null && (rgba(getComputedStyle(e).backgroundColor) ?? [0, 0, 0, 0])[3] === 0) {
        e = e.parentElement
        k += 1
      }
      paint = e === null ? -1 : k
      if (e !== null) v = getComputedStyle(e).backgroundColor
    }
    computed[p] = v.slice(0, 200)
    const c = colorish(p) ? rgba(v) : null
    if (c !== null) hexes[p] = hex(c)
  }
  /** @type {string[]} */
  const chain = []
  for (let e = el.parentElement; e !== null && chain.length < 60; e = e.parentElement) chain.push(name(e))
  const r = el.getBoundingClientRect()
  const found = Reflect.get(window, '__tracyLook') ?? {}
  const words = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.nodeValue)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  /** @type {false | string} */
  let hidden = false
  for (let e = /** @type {Element | null} */ (el); e !== null && hidden === false; e = e.parentElement)
    if (getComputedStyle(e).display === 'none')
      hidden = e === el ? 'display:none' : `display:none on ${name(e)}`
  if (hidden === false) {
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') hidden = 'visibility:hidden'
    else if (Number(cs.opacity) <= 0.05) hidden = 'opacity:0'
    else if (r.width < 2 || r.height < 2) hidden = 'no size on the page'
  }
  /** @type {Record<string, unknown>} */
  const out = {
    // which physical side a logical property (`padding-inline`, Tailwind's `px-`) sets: `resolveStyles`
    dir: cs.direction,
    wm: cs.writingMode,
    el: name(el),
    text: (
      words ||
      String(/** @type {HTMLElement} */ (el).innerText ?? '')
        .replace(/\s+/g, ' ')
        .trim()
    ).slice(0, 80),
    matches: found.matches,
    how: found.how,
    hidden,
    computed,
    hex: hexes,
    paint,
    chain
  }
  if (forSet !== true) return out
  // ── look.set: a selector for this element alone, the page's classes, and the sheets in order ──
  const esc = (/** @type {string} */ v) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v)
  const onlyOf = (/** @type {Element} */ target, /** @type {string} */ sel) => {
    try {
      const list = document.querySelectorAll(sel)
      return list.length === 1 && list[0] === target
    } catch {
      return false
    }
  }
  // a class or id a rule can lean on: no state class, nothing generated (long digit runs, a hash
  // tail like `wp-container-…-6c531013`, a per-instance count like `is-style-outline--4`, `:`/`[`).
  // Leaving one out never names another element: every selector is checked unique before use.
  const steady = (/** @type {string} */ v) =>
    /^[A-Za-z_][\w-]*$/.test(v) &&
    !/\d{5,}/.test(v) &&
    !/--\d+$/.test(v) &&
    !/(?:^|[-_])(?=[a-z0-9]*\d[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{6,}$/i.test(v) &&
    !/^(?:is-|has-)?(?:active|current|open|show|shown|hover|focus|visible|hidden|loaded|selected|collapsed|expanded|animated?)$/.test(
      v
    )
  const part = (/** @type {Element} */ e) => {
    if (e.id && steady(e.id) && document.querySelectorAll(`#${esc(e.id)}`).length === 1)
      return `#${esc(e.id)}`
    const cls = (typeof e.className === 'string' ? e.className.trim().split(/\s+/) : [])
      .filter(steady)
      .slice(0, 3)
    return `${e.tagName.toLowerCase()}${cls.map((c) => `.${esc(c)}`).join('')}`
  }
  /** A selector that matches `target` and no other element of the page. */
  const uniqueOf = (/** @type {Element} */ target) => {
    const only = (/** @type {string} */ sel) => onlyOf(target, sel)
    const parts = [part(target)]
    let found = parts[0]
    for (
      let e = target.parentElement;
      !only(found) && e !== null && e !== document.body && e !== document.documentElement && parts.length < 6;
      e = e.parentElement
    ) {
      const p = part(e)
      if (p === e.tagName.toLowerCase()) continue
      parts.unshift(p)
      found = parts.join(' ')
    }
    // the shortest that still names it alone: each wrapper between the first and the element dropped
    // when the selector stays unique without it
    for (let k = parts.length - 2; k > 0 && only(found); k -= 1) {
      const fewer = [...parts.slice(0, k), ...parts.slice(k + 1)]
      if (only(fewer.join(' '))) {
        parts.splice(k, 1)
        found = parts.join(' ')
      }
    }
    if (!only(found)) {
      // the path from <body>, each step by its place among its own kind: always this element alone
      const steps = []
      for (
        let e = /** @type {Element | null} */ (target);
        e !== null && e !== document.body;
        e = e.parentElement
      ) {
        const kin = e.parentElement
          ? Array.from(e.parentElement.children).filter((x) => x.tagName === e.tagName)
          : [e]
        steps.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${kin.indexOf(e) + 1})`)
      }
      found = `body > ${steps.join(' > ')}`
    }
    return found
  }
  const unique = uniqueOf(el)
  // 🔒 A LINK THE PAGE HIDES HERE IS WRITTEN WITH THE COPIES VISITORS SEE (turn latency, 26/10/2026). A
  // template prints its menu twice — the desktop bar and the phone drawer — and a selector the agent
  // wrote (`li.item-193 > a`) matched only the drawer's copy, hidden at this width. look.set wrote it,
  // called it "the only match", the desktop link stayed white, and the agent found and fixed the other
  // copy by hand (saigon-iron-boxing, 25/10). A copy is the same link: same tag, same address, same
  // words; only one the visitor sees is named, at most three.
  if (hidden !== false && typeof el.getAttribute === 'function') {
    const href = el.getAttribute('href')
    const said = (/** @type {Element} */ e) =>
      String(e.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    const words = said(el)
    const seen = (/** @type {Element} */ e) => {
      const box = e.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) return false
      const st = getComputedStyle(e)
      return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05
    }
    if (typeof href === 'string' && href !== '' && words !== '') {
      const copies = Array.from(document.querySelectorAll(el.tagName.toLowerCase()))
        .filter(
          (x) =>
            x !== el &&
            typeof x.getAttribute === 'function' &&
            x.getAttribute('href') === href &&
            said(x) === words &&
            seen(x)
        )
        .slice(0, 3)
      if (copies.length > 0)
        out.copies = copies.map((x) => ({ unique: uniqueOf(x).slice(0, 400), el: name(x) }))
    }
  }
  // 🔒 THE SITE'S OWN BANDS, WHEREVER THE TEMPLATE PUTS THEM (turn latency, 25/10/2026). A header,
  // footer or nav outside the page's content is the same element on every page. T4 wraps its whole
  // layout in one <main>, header section included, so its menu links read as this page's content: on
  // saigon-iron-boxing look.set scoped a header link to the home page (body.item-101) four times in six
  // turns, and the agent searched, undid and rewrote each one by hand. The frameworks' own header and
  // footer sections (T4, T3, Gavick) are the site's bands even inside <main>; an <article>'s own
  // header stays content.
  const band = el.closest('header, footer, nav, [role="banner"], [role="contentinfo"], [role="navigation"]')
  const frameBand = el.closest(
    '#t4-header, #t4-mainnav, #t4-topbar, #t4-footer, #t4-footnav, #t3-header, #t3-mainnav, #t3-topbar, #t3-footer, #t3-footnav, #gkHeader, #gkTop, #gkTopBar, #gkMainMenu, #gkMenuWrap, #gkFooter, #gkFooterNav, #gkFooterNavWrap'
  )
  out.unique = unique.slice(0, 400)
  out.body = String(document.body ? document.body.className : '').slice(0, 400)
  out.chrome =
    (frameBand !== null && el.closest('article') == null) ||
    (band !== null && band.parentElement?.closest('main, article, [role="main"]') == null)
  // every stylesheet in document order, named the way exec.mjs names a winning rule's sheet
  const here = location.origin
  out.sheets = Array.from(document.styleSheets)
    .slice(0, 120)
    .map((sheet) => {
      if (sheet.href) {
        try {
          const u = new URL(sheet.href)
          return (u.origin === here ? u.pathname : u.origin + u.pathname).slice(0, 120)
        } catch {
          return String(sheet.href).slice(0, 120)
        }
      }
      const node = /** @type {Element | null} */ (/** @type {any} */ (sheet).ownerNode ?? null)
      const src = Array.from(
        String(node?.textContent ?? '').matchAll(/\/\*[#@] sourceURL=(\S+?)\s*\*\//g)
      ).at(-1)
      if (src) {
        try {
          const u = new URL(src[1])
          return `${(u.origin === here ? u.pathname : u.origin + u.pathname).slice(0, 120)} (inlined in the page)`
        } catch {
          return src[1].slice(0, 120)
        }
      }
      return node?.id ? `<style id="${String(node.id).slice(0, 60)}">` : 'a <style> in the page'
    })
  // Which Joomla template serves the page and on which framework, read off the stylesheets and scripts
  // it loads (look.set writes a template's own customisation file, `look-set.mjs` `ownStyleSheet`): a
  // T4 page whose CSS is all in T4's bundle still names its template in a script or a carousel sheet.
  const paths = /** @type {string[]} */ (out.sheets).map((name) =>
    String(name).replace(/ \(inlined in the page\)$/, '')
  )
  for (const script of Array.from(document.scripts ?? [])) {
    try {
      const u = new URL(String(script.src || ''), here)
      if (u.origin === here) paths.push(u.pathname)
    } catch {
      // a script with no address of its own
    }
  }
  /** @type {Map<string, number>} */
  const seen = new Map()
  for (const p of paths) {
    const m = /^\/media\/templates\/site\/([^/]+)\//.exec(p) ?? /^\/templates\/([^/]+)\//.exec(p)
    if (m !== null && m[1] !== 'system') seen.set(m[1], (seen.get(m[1]) ?? 0) + 1)
  }
  let template = null
  for (const [name, n] of seen)
    if (template === null || n > /** @type {number} */ (seen.get(template))) template = name
  out.template = template
  out.framework = paths.some((/** @type {string} */ p) => /^\/(?:plugins\/system\/t4|media\/t4)\//.test(p))
    ? 't4'
    : paths.some((/** @type {string} */ p) => /^\/(?:plugins\/system\/t3|media\/t3)\//.test(p))
      ? 't3'
      : null
  return out
}

// ── In the container, beside chromium (serialized; self-contained) ─────────────────────────────────

/**
 * @typedef {{ name: string, value: string, important?: boolean, disabled?: boolean, parsedOk?: boolean,
 *   range?: object }} CdpProperty
 * @typedef {{ cssProperties?: CdpProperty[] }} CdpStyle
 * @typedef {{ rule: { selectorList?: { text?: string, selectors?: { text: string, range?: { startLine?: number },
 *   specificity?: { a: number, b: number, c: number } }[] }, nestingSelectors?: string[],
 *   origin?: string, styleSheetId?: string, style?: CdpStyle, media?: { text?: string, source?: string }[],
 *   layers?: { text?: string }[] }, matchingSelectors?: number[] }} CdpRuleMatch
 * @typedef {{ inlineStyle?: CdpStyle, attributesStyle?: CdpStyle, matchedCSSRules?: CdpRuleMatch[],
 *   inherited?: { inlineStyle?: CdpStyle, matchedCSSRules?: CdpRuleMatch[] }[] }} CdpMatched
 * @typedef {{ value: string, important: boolean, by: string, sheet: string | null, line: number | null,
 *   pos: number, spec: number[] | null, layer: string | null, rank: number[] }} Winner
 */

/**
 * IN THE CONTAINER: from the browser's own cascade (`CSS.getMatchedStylesForNode` of the element —
 * and of the ancestor that paints its background, `painter`), each property's winning declaration,
 * where it stands, and the `var(--token)` chain behind it, each token found where the cascade SETS it
 * for this element (the element's own rules first, then each ancestor's, up to `:root`).
 * `sheet` is a stylesheet id; the script names it (`exec.mjs`).
 *
 * 🔒 A SHORTHAND IS READ SIDE BY SIDE (dskeepwp, 09/10/2026). A design-system slot set a button's
 * `padding-top`/`-right`/`-bottom`/`-left` in a (0,8,0) rule; the agent's own `padding:14px 25px` in a
 * (0,7,0) rule lost on every side and the computed padding stayed `7px 21px` — yet `padding` was
 * answered with the agent's rule as the winner, because only declarations NAMED `padding` were
 * compared, and the agent told the customer the button was bigger. So a shorthand (`padding`,
 * `margin`, `border-radius`, `border-*`, `inset`, `gap`, `font`, `background`, …) is resolved
 * longhand by longhand: `set`/`by` are the rule a change must beat last, `split` says they came from
 * more than one declaration, and `parts` names the winner of each group of longhands when they come
 * from different rules (or some from none).
 * @param {{ props: string[], info: { computed?: Record<string, string>, hex?: Record<string, string>,
 *   paint?: number, chain?: string[], dir?: string, wm?: string }, matched: CdpMatched,
 *   painter?: CdpMatched | null }} input
 */
export function resolveStyles(input) {
  const INHERITED =
    /^(color|font(-.*)?|line-height|letter-spacing|word-spacing|text-(align|indent|transform|shadow|rendering)|white-space|visibility|cursor|direction|list-style(-.*)?|quotes|hyphens|word-break|overflow-wrap|tab-size|caret-color|accent-color|color-scheme|fill|stroke(-.*)?|border-collapse|border-spacing|caption-side|empty-cells|--.*)$/
  const cut = (/** @type {string} */ s, /** @type {number} */ n) =>
    s.length > n ? `${s.slice(0, n - 1)}…` : s
  const info = input.info ?? {}
  /**
   * 🔒 A LOGICAL PROPERTY SETS A PHYSICAL SIDE (dskeepem, 10/10/2026). Tailwind v4 writes `!px-[34px]`
   * as `padding-inline: 34px !important`; `padding` was answered from `.btn-primary`'s
   * `padding: var(--ds-btn-pad-y) var(--ds-btn-pad-x)`, which lost on every side, because only
   * physical names were compared. Which side `inline-start` is depends on the element's own direction
   * and writing mode (`describeTarget`'s `dir`, `wm`): the side at each logical end.
   * @type {Record<string, string>}
   */
  const SIDE = (() => {
    const wm = String(info.wm ?? 'horizontal-tb')
    const rtl = info.dir === 'rtl'
    if (!/^(vertical|sideways)-/.test(wm))
      return {
        'block-start': 'top',
        'block-end': 'bottom',
        'inline-start': rtl ? 'right' : 'left',
        'inline-end': rtl ? 'left' : 'right'
      }
    const lr = wm.endsWith('-lr')
    const up = (wm === 'sideways-lr') !== rtl
    return {
      'block-start': lr ? 'left' : 'right',
      'block-end': lr ? 'right' : 'left',
      'inline-start': up ? 'bottom' : 'top',
      'inline-end': up ? 'top' : 'bottom'
    }
  })()
  const VERTICAL = SIDE['block-start'] === 'left' || SIDE['block-start'] === 'right'
  /** A physical side's logical end: `['block', 'start']` for `top` in a horizontal page. */
  const endOf = (/** @type {string} */ side) =>
    (Object.keys(SIDE).find((k) => SIDE[k] === side) ?? 'block-start').split('-')
  /**
   * The physical name a logical longhand sets (`padding-inline-start` → `padding-left`), or null.
   * @param {string} p
   */
  const physicalOf = (p) => {
    let m
    if ((m = /^(margin|padding)-(block|inline)-(start|end)$/.exec(p)))
      return `${m[1]}-${SIDE[`${m[2]}-${m[3]}`]}`
    if ((m = /^inset-(block|inline)-(start|end)$/.exec(p))) return SIDE[`${m[1]}-${m[2]}`]
    if ((m = /^border-(block|inline)-(start|end)-(width|style|color)$/.exec(p)))
      return `border-${SIDE[`${m[1]}-${m[2]}`]}-${m[3]}`
    if ((m = /^border-(start|end)-(start|end)-radius$/.exec(p))) {
      const two = [SIDE[`block-${m[1]}`], SIDE[`inline-${m[2]}`]]
      const v = two.find((x) => x === 'top' || x === 'bottom')
      const h = two.find((x) => x === 'left' || x === 'right')
      return `border-${v}-${h}-radius`
    }
    if ((m = /^(min-|max-)?(inline|block)-size$/.exec(p)))
      return `${m[1] ?? ''}${(m[2] === 'inline') !== VERTICAL ? 'width' : 'height'}`
    return null
  }
  /** The declarations that can set `p`: its own name, and each shorthand that covers it. */
  const namesFor = (/** @type {string} */ p) => {
    const out = [p]
    if (p.startsWith('--')) return out
    let m
    // the same side by its logical names: `padding-block`, `padding-block-start`, `border-inline-color`…
    if ((m = /^(margin|padding)-(top|right|bottom|left)$/.exec(p))) {
      const [axis, end] = endOf(m[2])
      out.push(`${m[1]}-${axis}`, `${m[1]}-${axis}-${end}`)
    }
    if ((m = /^(top|right|bottom|left)$/.exec(p))) {
      const [axis, end] = endOf(m[1])
      out.push(`inset-${axis}`, `inset-${axis}-${end}`)
    }
    if ((m = /^border-(top|right|bottom|left)-(color|width|style)$/.exec(p))) {
      const [axis, end] = endOf(m[1])
      out.push(
        `border-${axis}`,
        `border-${axis}-${m[2]}`,
        `border-${axis}-${end}`,
        `border-${axis}-${end}-${m[2]}`
      )
    }
    if ((m = /^border-(top|bottom)-(left|right)-radius$/.exec(p))) {
      const block = VERTICAL ? m[2] : m[1]
      const inline = VERTICAL ? m[1] : m[2]
      out.push(`border-${endOf(block)[1]}-${endOf(inline)[1]}-radius`)
    }
    if ((m = /^(min-|max-)?(width|height)$/.exec(p)))
      out.push(`${m[1] ?? ''}${(m[2] === 'width') !== VERTICAL ? 'inline' : 'block'}-size`)
    if (p.startsWith('background-')) out.push('background')
    if (p === 'background-position-x' || p === 'background-position-y') out.push('background-position')
    if (/^font-(family|size|weight|style|variant|stretch)$/.test(p) || p === 'line-height') out.push('font')
    if ((m = /^border-(top|right|bottom|left)-(color|width|style)$/.exec(p)))
      out.push('border', `border-${m[1]}`, `border-${m[2]}`)
    if ((m = /^border-(color|width|style)$/.exec(p))) out.push('border')
    if ((m = /^(margin|padding|inset)-(top|right|bottom|left)$/.exec(p))) out.push(m[1])
    if (/^(top|right|bottom|left)$/.test(p)) out.push('inset')
    if (/^border-(top|bottom)-(left|right)-radius$/.test(p)) out.push('border-radius')
    if (p.startsWith('text-decoration-')) out.push('text-decoration')
    if (p.startsWith('outline-')) out.push('outline')
    if (p === 'row-gap' || p === 'column-gap') out.push('gap')
    if (/^flex-(grow|shrink|basis)$/.test(p)) out.push('flex')
    if (p.startsWith('list-style-')) out.push('list-style')
    if (p === 'overflow-x' || p === 'overflow-y') out.push('overflow')
    return out
  }
  /**
   * The longhands each shorthand sets — the inverse of `namesFor`: a shorthand asked for is read one
   * longhand at a time, since a rule may set one side and not another.
   * @type {Record<string, string[]>}
   */
  const LONGHANDS = (() => {
    const sides = ['top', 'right', 'bottom', 'left']
    const kinds = ['width', 'style', 'color']
    /** @type {Record<string, string[]>} */
    const m = {
      padding: sides.map((s) => `padding-${s}`),
      margin: sides.map((s) => `margin-${s}`),
      inset: [...sides],
      'border-radius': ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(
        (c) => `border-${c}-radius`
      ),
      border: sides.flatMap((s) => kinds.map((k) => `border-${s}-${k}`)),
      outline: kinds.map((k) => `outline-${k}`),
      gap: ['row-gap', 'column-gap'],
      flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
      font: [
        'font-style',
        'font-variant',
        'font-weight',
        'font-stretch',
        'font-size',
        'line-height',
        'font-family'
      ],
      background: [
        'background-color',
        'background-image',
        'background-position-x',
        'background-position-y',
        'background-size',
        'background-repeat',
        'background-attachment',
        'background-origin',
        'background-clip'
      ],
      'background-position': ['background-position-x', 'background-position-y'],
      'text-decoration': ['line', 'style', 'color', 'thickness'].map((k) => `text-decoration-${k}`),
      'list-style': ['type', 'position', 'image'].map((k) => `list-style-${k}`),
      overflow: ['overflow-x', 'overflow-y']
    }
    for (const s of sides) m[`border-${s}`] = kinds.map((k) => `border-${s}-${k}`)
    for (const k of kinds) m[`border-${k}`] = sides.map((s) => `border-${s}-${k}`)
    // the logical shorthands, by the physical sides they set on this element
    for (const axis of ['block', 'inline']) {
      const two = [SIDE[`${axis}-start`], SIDE[`${axis}-end`]]
      m[`padding-${axis}`] = two.map((s) => `padding-${s}`)
      m[`margin-${axis}`] = two.map((s) => `margin-${s}`)
      m[`inset-${axis}`] = [...two]
      m[`border-${axis}`] = two.flatMap((s) => kinds.map((k) => `border-${s}-${k}`))
      for (const k of kinds) m[`border-${axis}-${k}`] = two.map((s) => `border-${s}-${k}`)
      for (const end of ['start', 'end'])
        m[`border-${axis}-${end}`] = kinds.map((k) => `border-${SIDE[`${axis}-${end}`]}-${k}`)
    }
    return m
  })()
  /** A style's declarations as written: those with a source range, or all of them when none has one. */
  const decls = (/** @type {CdpStyle | undefined} */ style) => {
    const all = (style?.cssProperties ?? []).filter(
      (d) => d && d.parsedOk !== false && d.disabled !== true && typeof d.value === 'string' && d.value !== ''
    )
    return all.some((d) => d.range) ? all.filter((d) => d.range) : all
  }
  /** `s` split at its top-level `sep` characters (never inside brackets, parentheses or strings). */
  const topSplit = (/** @type {string} */ s, /** @type {RegExp} */ sep) => {
    /** @type {string[]} */
    const parts = []
    let depth = 0
    let quote = ''
    let from = 0
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i]
      if (quote) {
        if (c === '\\') i += 1
        else if (c === quote) quote = ''
      } else if (c === '"' || c === "'") quote = c
      else if (c === '\\') i += 1
      else if (c === '(' || c === '[') depth += 1
      else if (c === ')' || c === ']') depth -= 1
      else if (depth === 0 && sep.test(c)) {
        parts.push(s.slice(from, i))
        from = i + 1
      }
    }
    parts.push(s.slice(from))
    return parts.map((x) => x.trim()).filter((x) => x !== '')
  }
  /**
   * 🔒 A NESTED RULE IS NAMED WHOLE (dskeepjo, 10/10/2026). CDP names a rule nested in another
   * (`.tracy-native-landing.tracy-native-landing { h1, h2 { color: … } }`) by its own relative selector,
   * `h1` — (0,0,1) — while it matches as `.tracy-native-landing.tracy-native-landing h1`, (0,2,1).
   * look.set aimed past `h1` with `body.item-247 h1`, (0,1,2), and lost (LOOK_SET_NO_EFFECT). The
   * selector is rebuilt from `nestingSelectors` (nearest parent first): `&` stands for the parent — the
   * parent's own text where that means the same, `:is(parent)` where it would not — and a selector
   * with no `&` is the parent's descendant.
   */
  const unnest = (/** @type {string} */ sel, /** @type {string[]} */ parents) => {
    let out = sel
    for (const parent of parents) {
      const list = topSplit(parent, /,/)
      const compound = list.length === 1 && topSplit(list[0], /[\s>+~]/).length === 1
      const whole = list.length === 1 ? list[0] : `:is(${parent})`
      out = topSplit(out, /,/)
        .map((one) => {
          if (!one.includes('&')) return `${whole} ${one}`
          if (compound) return one.replaceAll('&', list[0])
          // `&` first, then a combinator or the end: the parent's own text reads the same
          if (/^&(?=[\s>+~]|$)/.test(one) && list.length === 1 && !one.slice(1).includes('&'))
            return `${list[0]}${one.slice(1)}`
          return one.replaceAll('&', `:is(${parent})`)
        })
        .join(', ')
    }
    return out
  }
  const ruleName = (/** @type {CdpRuleMatch} */ rm) => {
    const sels = rm.rule.selectorList?.selectors ?? []
    const parents = rm.rule.nestingSelectors ?? []
    const picked = (rm.matchingSelectors ?? [])
      .map((k) => sels[k]?.text)
      .filter(Boolean)
      .map((one) => (parents.length > 0 ? unnest(String(one), parents) : String(one)))
    let by = cut(
      (picked.length > 0 ? picked.join(', ') : (rm.rule.selectorList?.text ?? '?')).replace(/\s+/g, ' '),
      100
    )
    const media = (rm.rule.media ?? []).find((x) => x.source === 'mediaRule' && x.text && x.text !== 'all')
    if (media) by += ` @media ${cut(String(media.text), 60)}`
    const layer = (rm.rule.layers ?? [])
      .map((x) => x.text)
      .filter(Boolean)
      .join('.')
    if (layer) by += ` @layer ${cut(layer, 40)}`
    return by
  }
  /** <0, 0, >0 as rank `x` is weaker, as strong, or stronger than `y`. */
  const compareRank = (/** @type {number[]} */ x, /** @type {number[]} */ y) => {
    for (let i = 0; i < Math.max(x.length, y.length); i += 1)
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return 0
  }
  /**
   * The declaration of any of `names` that wins on one element: the cascade order is the browser's
   * (presentational attributes, then matched rules as listed, then the style attribute) for normal
   * declarations; an `!important` one beats them all, and among those the order turns round
   * (`rank`, CSS Cascade 5 §6.1): the browser's own before the style attribute before any rule, and
   * among rules an EARLIER cascade layer before a later one, a layered one before an unlayered one
   * — then, within one layer, the later one.
   *
   * 🔒 THE LAST `!important` WAS NOT THE WINNER (10/10/2026). CDP lists a page's rules layer by layer
   * in normal order (`@layer base, components, utilities`, then the unlayered); the last important
   * declaration in that list is the one that LOSES among important ones whenever two layers set it.
   * @param {CdpMatched | { inlineStyle?: CdpStyle, matchedCSSRules?: CdpRuleMatch[], attributesStyle?: CdpStyle } | undefined} entry
   * @param {string[]} names
   * @returns {Winner | null}
   */
  const winnerIn = (entry, names) => {
    /** @type {Winner[]} */
    const found = []
    const take = (
      /** @type {CdpStyle | undefined} */ style,
      /** @type {(d: CdpProperty) => Winner} */ as
    ) => {
      for (const d of decls(style)) {
        if (!names.includes(d.name)) continue
        // A minified `x:1px!important` arrives with the flag inside the value.
        const bang = /\s*!\s*important\s*$/i.test(d.value)
        found.push(
          as(bang ? { ...d, value: d.value.replace(/\s*!\s*important\s*$/i, ''), important: true } : d)
        )
      }
    }
    // `pos`: where the declaration's block stands in this element's cascade (the attributes, each
    // matched rule, the style attribute) — the same block for every longhand it sets.
    const rules = entry?.matchedCSSRules ?? []
    /** each layer's first place in the list: the order the page declared its layers in */
    /** @type {Map<string, number>} */
    const layerAt = new Map()
    const layerOf = (/** @type {CdpRuleMatch} */ rm) =>
      (rm.rule.layers ?? []).length > 0 ? (rm.rule.layers ?? []).map((x) => x.text ?? '').join('.') : null
    for (const [pos, rm] of rules.entries()) {
      const key = layerOf(rm)
      if (key !== null && !layerAt.has(key)) layerAt.set(key, pos)
    }
    /** @type {(tier: number, layer: string | null, pos: number) => (important: boolean) => number[]} */
    const rankAt = (tier, layer, pos) => (important) =>
      important
        ? [1, tier, layer === null ? 0 : rules.length + 1 - (layerAt.get(layer) ?? 0), pos]
        : [0, 0, 0, pos]
    const ranked = (
      /** @type {Omit<Winner, 'rank'>} */ w,
      /** @type {(important: boolean) => number[]} */ rank
    ) => /** @type {Winner} */ ({ ...w, rank: rank(w.important) })
    take(entry?.attributesStyle, (d) =>
      ranked(
        {
          value: `${d.name}: ${d.value}`,
          important: false,
          by: 'an HTML attribute',
          sheet: null,
          line: null,
          pos: -1,
          spec: null,
          layer: null
        },
        rankAt(1, null, -1)
      )
    )
    for (const [pos, rm] of rules.entries()) {
      const ua = rm.rule.origin === 'user-agent'
      const sels = rm.rule.selectorList?.selectors ?? []
      const line = sels[rm.matchingSelectors?.[0] ?? 0]?.range?.startLine
      // the browser's own specificity of the selectors that matched (exact where the text is cut or nested)
      const specs = (rm.matchingSelectors ?? [])
        .map((k) => sels[k]?.specificity)
        .filter(
          /** @returns {x is { a: number, b: number, c: number }} */
          (x) => !!x && typeof x.a === 'number'
        )
        .map((x) => [x.a, x.b, x.c])
        .sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])
      const layer = layerOf(rm)
      take(rm.rule.style, (d) =>
        ranked(
          {
            value: `${d.name}: ${d.value}`,
            important: d.important === true,
            by: ua ? 'the browser default' : ruleName(rm),
            sheet: ua ? null : (rm.rule.styleSheetId ?? null),
            // line 1 of a minified bundle locates nothing; the selector does
            line: typeof line === 'number' && line > 0 ? line + 1 : null,
            pos,
            spec: ua ? null : (specs[0] ?? null),
            layer: ua ? null : layer
          },
          rankAt(ua ? 3 : 1, ua ? null : layer, pos)
        )
      )
    }
    take(entry?.inlineStyle, (d) =>
      ranked(
        {
          value: `${d.name}: ${d.value}`,
          important: d.important === true,
          by: 'its style attribute',
          sheet: null,
          line: null,
          pos: rules.length,
          spec: null,
          layer: null
        },
        rankAt(2, null, rules.length)
      )
    )
    if (found.length === 0) return null
    // the strongest; of two equally strong (one block), the later declaration
    return found.reduce((best, w) => (compareRank(w.rank, best.rank) >= 0 ? w : best))
  }
  const valueOf = (/** @type {Winner} */ w) => w.value.slice(w.value.indexOf(':') + 2)
  /**
   * The winner of one property for the element: on the element itself, or — for an inherited
   * property, or a value of `inherit` — on the nearest ancestor that sets it (`at`: 0 the element,
   * k its k-th entry up).
   * @param {string} p
   * @param {(CdpMatched | { inlineStyle?: CdpStyle, matchedCSSRules?: CdpRuleMatch[] } | undefined)[]} entries
   * @returns {{ win: Winner | null, at: number }}
   */
  const winnerFor = (p, entries) => {
    for (let k = 0; k < entries.length; k += 1) {
      const w = winnerIn(entries[k], namesFor(p))
      // `inherit` (and `unset` on an inherited property) hands the value to the parent: go on up.
      const passes =
        w !== null && (/^inherit$/i.test(valueOf(w)) || (INHERITED.test(p) && /^unset$/i.test(valueOf(w))))
      if (w !== null && !passes) return { win: w, at: k }
      if (!INHERITED.test(p) && !passes) break
    }
    return { win: null, at: -1 }
  }
  const declText = (/** @type {Winner} */ w) => `${w.value}${w.important ? ' !important' : ''}`
  const chain = info.chain ?? []
  /** @type {Record<string, unknown>} */
  const out = {}
  /** @type {Set<string>} */
  const sheets = new Set()
  for (const p of input.props) {
    const painted = p === 'background-color' && (info.paint ?? 0) > 0 && input.painter
    const base = painted ? /** @type {number} */ (info.paint) : 0
    const top = painted ? /** @type {CdpMatched} */ (input.painter) : input.matched
    const entries = [top, ...(top?.inherited ?? [])]
    const onName = (/** @type {number} */ k) =>
      base + k === 0 ? null : (chain[base + k - 1] ?? 'an ancestor')
    /** @type {Record<string, unknown>} */
    const row = { value: info.computed?.[p] ?? null }
    if (info.hex?.[p]) row.hex = info.hex[p]
    // a logical longhand asked for (`padding-inline-start`) is the physical side it sets here
    const side = physicalOf(p) ?? p
    const longhands = painted ? undefined : (LONGHANDS[p] ?? LONGHANDS[side])
    let { win, at } = longhands === undefined ? winnerFor(side, entries) : { win: null, at: -1 }
    /**
     * A shorthand's longhands grouped by the declaration block that wins them, the lead first: the
     * one a change must beat last (the element's own before an ancestor's, `!important` first, then
     * the latest in the cascade).
     * @type {{ names: string[], wins: Winner[], at: number }[]}
     */
    let groups = []
    if (longhands !== undefined) {
      for (const name of longhands) {
        const one = winnerFor(name, entries)
        const same = groups.find((g) => g.at === one.at && g.wins[0]?.pos === one.win?.pos)
        const into = same ?? { names: [], wins: [], at: one.at }
        if (same === undefined) groups.push(into)
        into.names.push(name)
        if (
          one.win !== null &&
          !into.wins.some((w) => declText(w) === declText(/** @type {Winner} */ (one.win)))
        )
          into.wins.push(one.win)
      }
      const strongest = (/** @type {{ wins: Winner[] }} */ g) =>
        g.wins.reduce(
          (best, w) => (compareRank(w.rank, best) > 0 ? w.rank : best),
          /** @type {number[]} */ ([])
        )
      groups.sort(
        (a, b) =>
          (a.wins.length === 0 ? 1 : 0) - (b.wins.length === 0 ? 1 : 0) ||
          a.at - b.at ||
          compareRank(strongest(b), strongest(a))
      )
      win = groups[0].wins[0] ?? null
      at = groups[0].at
      // one declaration (the shorthand itself, or one that covers it) sets every longhand: as before
      if (groups.length === 1 && groups[0].wins.length <= 1) groups = []
    }
    if (painted) row.on = `painted by ${onName(0)}`
    if (win === null) {
      row.set = null
      row.by = INHERITED.test(p)
        ? 'no rule on it or its ancestors: the browser default'
        : 'no rule sets it: the browser default'
      out[p] = row
      continue
    }
    if (at > 0) row.on = `${painted ? `${row.on}, ` : ''}inherited from ${onName(at)}`
    row.set = cut(groups.length > 0 ? groups[0].wins.map(declText).join('; ') : declText(win), 160)
    row.by = win.by
    if (win.sheet !== null) {
      row.sheet = win.sheet
      sheets.add(win.sheet)
    }
    if (win.line !== null) row.line = win.line
    // what look.set must beat it with: the browser's own specificity, and the cascade layer it stands in
    if (win.spec !== null) row.spec = win.spec
    if (win.layer !== null) row.layer = win.layer
    if (groups.length > 0) row.split = true
    // each group of longhands and its own winner, when they are not all one rule's
    if (groups.length > 1)
      row.parts = groups.map((g) => {
        const w = g.wins[0]
        /** @type {Record<string, unknown>} */
        const part = { props: g.names }
        if (w === undefined) {
          part.set = null
          part.by = INHERITED.test(g.names[0])
            ? 'no rule on it or its ancestors: the browser default'
            : 'no rule sets it: the browser default'
          return part
        }
        part.set = cut(g.wins.map(declText).join('; '), 160)
        part.by = w.by
        if (w.sheet !== null) {
          part.sheet = w.sheet
          sheets.add(w.sheet)
        }
        if (w.line !== null) part.line = w.line
        if (w.spec !== null) part.spec = w.spec
        if (w.layer !== null) part.layer = w.layer
        if (g.at > 0) part.on = `inherited from ${onName(g.at)}`
        return part
      })
    // the var(--token) chain, each token where the cascade sets it for the element that uses it
    /** @type {Record<string, unknown>[]} */
    const tokens = []
    /** @type {Set<string>} */
    const seen = new Set()
    /** @param {string} value @param {number} from @param {number} depth */
    const follow = (value, from, depth) => {
      if (depth > 4) return
      for (const m of value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
        const name = m[1]
        if (seen.has(name) || tokens.length >= 6) continue
        seen.add(name)
        let got = null
        let k = from
        for (; k < entries.length; k += 1) {
          got = winnerIn(entries[k], [name])
          if (got !== null) break
        }
        if (got === null) {
          tokens.push({ name, value: null })
          continue
        }
        /** @type {Record<string, unknown>} */
        const t = { name, value: cut(valueOf(got), 120), by: got.by }
        if (got.sheet !== null) {
          t.sheet = got.sheet
          sheets.add(got.sheet)
        }
        if (got.line !== null) t.line = got.line
        const where = onName(k)
        t.on = where ?? 'the element itself'
        tokens.push(t)
        follow(valueOf(got), k, depth + 1)
      }
    }
    if (groups.length === 0) follow(valueOf(win), at, 0)
    else for (const g of groups) for (const w of g.wins) follow(valueOf(w), g.at, 0)
    if (tokens.length > 0) row.tokens = tokens
    out[p] = row
  }
  return { props: out, sheets: [...sheets] }
}

// ── On the host: the answer ──────────────────────────────────────────────────────────────────────

/**
 * What the answer is for, said once in it: the token is the shared value — changing it moves every
 * element that uses it; the rule is this element's own. A per-element change is the customer's call.
 */
export const STYLE_NEXT =
  "tokens: the var() values this comes from, each where it is set; change the last to change every element sharing it. set/by/in: this element's own rule."

/**
 * Said when the page had not finished loading at the read's last moment (`loaded:false`, exec.mjs):
 * what was read may lack stylesheets still on their way, and nothing here can tell which.
 */
export const STYLE_NOT_LOADED =
  'The page had not finished loading when this was read, so a stylesheet may be missing: read it once more.'

/**
 * Said for a selector no element matches, by what {@link findTarget} found in the page's stylesheets
 * (#1710): CSS written for it that the page does not load is not done, and is never called done.
 */
export const STYLE_RULE_NOWHERE =
  'CSS written for that selector does not reach this page: write it where this page loads it (the LOOK line), or tell the customer it will not show. Never call it done.'
export const STYLE_RULE_LOADED =
  'This page loads that rule; no element on it matches the selector now, so nothing here shows it yet.'

/**
 * Said when a shorthand's longhands are won by different rules (`parts`, `resolveStyles`): a change
 * to the shorthand shows only where it beats each of them.
 */
export const STYLE_PARTS_NEXT =
  "parts: this shorthand's sides are set by different rules; a change shows only where it beats each one (look.set does)."

/**
 * One token as the answer prints it: `--name = value · where it is set`.
 * @param {Record<string, unknown>} t
 * @param {number} max
 */
function tokenLine(t, max) {
  if (t.value === null)
    return `${String(t.name)} is set nowhere on this page: its var() fallback or the default applies`
  // where it is set: the rule, the stylesheet, and the element when it is not the page's root
  const on =
    typeof t.on === 'string' && t.on !== 'the element itself' && !t.on.startsWith('<html')
      ? `on ${t.on}`
      : null
  const where = [t.by, t.sheet ? `${String(t.sheet)}${t.line ? `:${t.line}` : ''}` : null, on]
    .filter(Boolean)
    .join(' · ')
  const line = `${String(t.name)} = ${String(t.value)}${where ? ` · ${where}` : ''}`
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/**
 * The browser's answer (`BROWSER_SCRIPT` mode `style`: `{info, props}` or `{error}`) as the model
 * reads it, within `cap` characters: `style.<prop>` = `{value, hex?, on?, set, by, in, tokens?}`.
 * `set` is the winning declaration as written, `by` its rule, `in` its stylesheet (and line), and
 * `tokens` each `var(--x)` behind it down to where it is SET — the value to change for every element
 * that shares it.
 * @param {unknown} payload
 * @param {{ url: string, path: string, viewport: 'desktop' | 'tablet' | 'mobile', cap?: number }} input
 * @returns {Record<string, unknown>}
 */
export function styleAnswer(payload, input) {
  const p = /** @type {Record<string, any>} */ (payload && typeof payload === 'object' ? payload : {})
  if (typeof p.error === 'string')
    return {
      ok: false,
      code: 'STYLE_TARGET_NOT_FOUND',
      error: `On ${input.path}: ${p.error.slice(0, 180)}`,
      next:
        p.loaded === false
          ? STYLE_NOT_LOADED
          : /no stylesheet this page loads has a rule for it/.test(p.error)
            ? STYLE_RULE_NOWHERE
            : /the page loads a rule for it, in /.test(p.error)
              ? STYLE_RULE_LOADED
              : 'Quote the words exactly as page.text shows them, or give a selector (and nth) instead.'
    }
  const info = p.info ?? {}
  const vp = STYLE_VIEWPORTS[input.viewport] ?? STYLE_VIEWPORTS.desktop
  const cap = input.cap ?? 2000
  const build = (
    /** @type {number} */ selector,
    /** @type {number} */ tokensPer,
    /** @type {number} */ tokenMax
  ) => {
    /** @type {Record<string, unknown>} */
    const style = {}
    let split = false
    for (const [prop, raw] of Object.entries(/** @type {Record<string, any>} */ (p.props ?? {}))) {
      /** @type {Record<string, unknown>} */
      const row = { value: raw.value }
      if (raw.hex) row.hex = raw.hex
      if (raw.on) row.on = raw.on
      row.set = raw.set
      row.by =
        typeof raw.by === 'string' && raw.by.length > selector ? `${raw.by.slice(0, selector - 1)}…` : raw.by
      if (raw.sheet) row.in = `${raw.sheet}${raw.line ? `:${raw.line}` : ''}`
      // a shorthand whose longhands are won by different rules: each group, its rule and sheet
      if (Array.isArray(raw.parts) && raw.parts.length > 1) {
        split = true
        row.parts = raw.parts.map((/** @type {Record<string, any>} */ pt) => {
          const by =
            typeof pt.by === 'string' && pt.by.length > selector ? `${pt.by.slice(0, selector - 1)}…` : pt.by
          const where = pt.sheet ? ` · ${pt.sheet}${pt.line ? `:${pt.line}` : ''}` : ''
          return `${(pt.props ?? []).join(', ')}: ${pt.set ?? 'not set'} · ${by}${where}${pt.on ? ` · ${pt.on}` : ''}`
        })
      }
      const tokens = /** @type {Record<string, unknown>[]} */ (raw.tokens ?? [])
      if (tokens.length > 0) {
        const shown = tokens.slice(0, tokensPer).map((t) => tokenLine(t, tokenMax))
        if (tokens.length > tokensPer) shown.push(`+${tokens.length - tokensPer} more`)
        row.tokens = shown
      }
      style[prop] = row
    }
    /** @type {Record<string, unknown>} */
    const answer = {
      ok: true,
      url: input.url,
      viewport: `${input.viewport} ${vp.width}×${vp.height}`,
      el: info.el ?? null,
      text: info.text ?? null
    }
    if (typeof info.matches === 'number' && info.matches > 1) answer.matches = info.matches
    if (info.how === 'partial') answer.matchedBy = 'partial words'
    // why a visitor does not see it (`display:none`, on it or an ancestor); `true` from an older read
    if (info.hidden) answer.hidden = typeof info.hidden === 'string' ? info.hidden : true
    answer.style = style
    const next = split ? `${STYLE_NEXT} ${STYLE_PARTS_NEXT}` : STYLE_NEXT
    answer.next = p.loaded === false ? `${STYLE_NOT_LOADED} ${next}` : next
    return answer
  }
  for (const [selector, tokensPer, tokenMax] of [
    [100, 4, 200],
    [80, 3, 160],
    [60, 2, 120],
    [40, 1, 100]
  ]) {
    const a = build(selector, tokensPer, tokenMax)
    if (JSON.stringify(a).length <= cap) return a
  }
  const a = build(30, 1, 80)
  a.truncated = true
  return a
}
