#!/usr/bin/env node
// affected.mjs — which contract pages can a theme change touch? Deterministic, fail closed.
//
// A fix round needs to know what to measure again. Choosing "the pages that had findings" is not
// safe: on Tracy Base wp7 (25/09) a global CSS round put new findings on 32/38 pages, and measuring
// only the 10 pages with most closed findings would have missed 170/425 new findings (40 %). The
// change decides, not the history:
//
//   CSS under assets/css/   the changed rules (added, removed, or body changed — keyed by at-rule
//                           context + selector) → their selectors, pseudo-classes stripped so a
//                           `:hover` rule still selects → every page on the LIVE site with at least
//                           one matching element (DOM only, no screenshots; 38 pages in 3.3 s).
//                           A selector the browser cannot parse, a changed @font-face/@keyframes/
//                           @property/@import, or a file named tokens.css → FULL.
//   templates/ parts/       the page's served HTML changes, so round.mjs selects by HTML hash
//   patterns/               (a pattern is inserted into content at seed time; content changes the
//                           same way) — see `classifyChanges`.
//   anything else           theme.json, functions.php, inc/*, style.css, assets/js/*, styles/*,
//                           blocks/*, a file this list does not know → FULL.
//
// Measured once: one scoped CSS fix, 4 pages predicted, the full run closed exactly its 15
// findings on those 4 pages and changed no other deterministic page. One fix is not a recall
// figure; the fail-closed classes above are why a miss costs a full run, not a wrong verdict.
//
//   node scripts/visual/affected.mjs --old <a.css> --new <b.css> (--run-root <dossier> | --contract f) --site <origin> [--out f.json]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL, resolveContract } from '../lib/canonical.mjs'
import { darkInitScript, lazyBrowser } from '../lib/browser.mjs'
import { STAGES } from './contract.mjs'

// At-rules whose body is rules scoped by a condition: their rules are rules like any other.
const GROUPING = /^@(media|supports|container|layer|document|scope)\b/i

/**
 * CSS text → Map("<context> ␟ <selector>" → normalised declarations). Throws on unbalanced braces.
 * Non-grouping at-rules with a body (@font-face, @keyframes, @page, @property, @counter-style)
 * are kept whole under their prelude; statement at-rules (@import, @charset) under their text.
 */
export function cssRules(css) {
  const src = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = new Map()
  const put = (key, body) => rules.set(key, (rules.has(key) ? rules.get(key) + ';' : '') + body)
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  let i = 0
  const parse = (context, closing) => {
    let prelude = ''
    while (i < src.length) {
      const c = src[i]
      if (c === '{') {
        i++
        const head = foldSelectorSpace(prelude)
        prelude = ''
        if (GROUPING.test(head)) parse(`${context}${head} `, true)
        else if (head.startsWith('@')) {
          const start = i
          let depth = 1
          while (i < src.length && depth) {
            if (src[i] === '{') depth++
            else if (src[i] === '}') depth--
            i++
          }
          if (depth) throw new Error(`unbalanced braces in ${head}`)
          put(`${context}␟${head}`, norm(src.slice(start, i - 1)))
        } else {
          const start = i
          while (i < src.length && src[i] !== '}' && src[i] !== '{') i++
          if (src[i] !== '}') throw new Error(`unbalanced braces after ${head.slice(0, 80)}`)
          put(`${context}␟${head}`, norm(src.slice(start, i)))
          i++
        }
      } else if (c === '}') {
        if (!closing) throw new Error('unbalanced braces: a } without its {')
        i++
        return
      } else if (c === ';' && norm(prelude).startsWith('@')) {
        put(`${context}␟${norm(prelude)}`, '')
        prelude = ''
        i++
      } else {
        prelude += c
        i++
      }
    }
    if (closing) throw new Error('unbalanced braces: a { never closed')
  }
  parse('', false)
  return rules
}

/** Keys whose declarations differ between two CSS texts (added, removed, changed). */
export function changedRules(oldCss, newCss) {
  const a = cssRules(oldCss)
  const b = cssRules(newCss)
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort()
}

/** Split a selector list at its top-level commas: not inside (), [] or quotes (`:is(a, b)`, `[title="a,b"]`). */
function splitSelectorList(list) {
  const parts = []
  let depth = 0
  let quote = null
  let cur = ''
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (quote) {
      if (c === '\\') cur += c + (list[++i] ?? '')
      else {
        if (c === quote) quote = null
        cur += c
      }
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

// Pseudo-classes whose argument is a selector list that still selects: kept, their argument
// cleaned the same way. Every other pseudo-class or pseudo-element is dropped — `:hover`,
// `::before`, `:not(.x)`, `:nth-child(2n)` — which only ever widens what the selector matches.
const SELECTOR_ARG = /^(is|where|has|matches|-webkit-any|-moz-any)$/i

// Strings and escapes are the parts of a selector where whitespace means something
// (`[title="a  b"]`, `.a\ b`, `.\31 0`). `shield` swaps each for an opaque token so whitespace
// can be folded and pseudo-classes cut around them; `unshield` puts them back unchanged.
const TOKEN = /\uE000(\d+)\uE001/g
function shield(selector) {
  const kept = []
  let text = ''
  for (let i = 0; i < selector.length; ) {
    const c = selector[i]
    let j = i
    if (c === '"' || c === "'") {
      j++
      while (j < selector.length && selector[j] !== c) j += selector[j] === '\\' ? 2 : 1
      j++
    } else if (c === '\\') {
      const hex = /^\\[0-9a-fA-F]{1,6}[ \t\n\r\f]?/.exec(selector.slice(i))
      j += hex ? hex[0].length : 2
    } else {
      text += c
      i++
      continue
    }
    kept.push(selector.slice(i, j))
    text += `\uE000${kept.length - 1}\uE001`
    i = j
  }
  return { text, unshield: (s) => s.replace(TOKEN, (_, n) => kept[Number(n)]) }
}

/** Whitespace folded to one space outside strings and escapes; what a rule key holds as its selector. */
function foldSelectorSpace(selector) {
  const { text, unshield } = shield(selector)
  return unshield(text.replace(/\s+/g, ' ').trim())
}

/**
 * One selector with its pseudo-classes and pseudo-elements removed (see SELECTOR_ARG); `*` when
 * nothing is left. Strings, escapes and attribute selectors are kept byte for byte. The argument of
 * `:has()` is a relative selector — `:has(> .x)` keeps its leading combinator, since `* > .x` would
 * need a grandchild and select fewer pages than the rule reaches.
 */
function selectablePart(selector) {
  const { text, unshield } = shield(selector)
  return unshield(stripPseudo(text, false))
}

// Stands in for a stripped pseudo until its compound is known to hold something else.
const STRIPPED = '\u0001'

function stripPseudo(selector, relative) {
  const src = selector.replace(/\s+/g, ' ').trim()
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '[') {
      // an attribute selector: copied as it is (its strings are already tokens)
      let j = i + 1
      while (j < src.length && src[j] !== ']') j++
      out += src.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (c !== ':') {
      out += c
      i++
      continue
    }
    const m = /^(::?)(-?[a-zA-Z][\w-]*)/.exec(src.slice(i))
    if (!m) {
      out += c
      i++
      continue
    }
    i += m[0].length
    let arg = null
    if (src[i] === '(') {
      let depth = 1
      let j = i + 1
      while (j < src.length && depth) {
        if (src[j] === '(') depth++
        else if (src[j] === ')') depth--
        j++
      }
      arg = src.slice(i + 1, j - 1)
      i = j
    }
    if (arg !== null && m[1] === ':' && SELECTOR_ARG.test(m[2])) {
      const name = /^matches$|any$/i.test(m[2]) ? 'is' : m[2].toLowerCase()
      const isHas = name === 'has'
      out += `:${name}(${splitSelectorList(arg).map((a) => stripPseudo(a, isHas)).join(', ')})`
    } else out += STRIPPED
  }
  // A compound emptied by the stripping (`.a > :hover`, `.menu :hover > .x`, `:focus + .b`)
  // becomes `*`, so each combinator keeps a compound on both sides: dropping it would turn
  // `.menu :hover > .x` into `.menu > .x` and miss the `.x` a grandchild of `.menu`. A stripped
  // pseudo beside anything else in its compound just goes.
  let tidy = out
    .replace(new RegExp(`${STRIPPED}+`, 'g'), STRIPPED)
    .replace(new RegExp(`(^|[\\s>+~(])${STRIPPED}(?=$|[\\s>+~)])`, 'g'), '$1*')
    .replaceAll(STRIPPED, '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
  if (!relative) tidy = tidy.replace(/^([>+~])/, '* $1')
  tidy = tidy.replace(/([>+~])\s*(?=[>+~]|$)/g, '$1 *').trim()
  return tidy || '*'
}

/**
 * Changed rule keys → selectors to query, or `full` with the reason. Pseudo-classes and pseudo-
 * elements are stripped (a :hover or ::before rule selects the element it styles); what remains
 * empty selects `*`. The list is split at its top-level commas only, and whitespace is folded:
 * biome writes a long `:is()` over several lines, and splitting `:is(\n a,\n b\n)` at every comma
 * gave `:is( a` and `b )` — two selectors the browser rejects, so a one-rule change on Tracy Base
 * (dd-2) fell back to FULL: 435 s instead of ~40.
 */
export function selectorsFor(keys) {
  const selectors = new Set()
  for (const k of keys) {
    const sel = k.split('␟')[1]
    if (sel.startsWith('@')) return { full: `a changed ${sel.split(/[\s(]/)[0]} rule can reach any page`, selectors: [] }
    for (const part of splitSelectorList(sel)) selectors.add(selectablePart(part))
  }
  return { full: null, selectors: [...selectors].sort() }
}

/**
 * Changed theme files (relative to the built theme dir) → what selects the pages to measure.
 * `css` files go through selectors; `html` files move the served HTML (round.mjs compares HTML
 * hashes); `full` lists the files that force a full run, each with the reason.
 */
export function classifyChanges(files) {
  const out = { css: [], html: [], full: [] }
  for (const f of files) {
    const rel = f.split(path.sep).join('/')
    if (/^assets\/css\/.*\.css$/.test(rel)) {
      if (/(^|\/)tokens\.css$/.test(rel)) out.full.push({ file: rel, reason: 'root tokens reach every page' })
      else out.css.push(rel)
    } else if (/^(templates|parts)\/[^/]+\.html$/.test(rel) || /^patterns\/[^/]+\.php$/.test(rel)) out.html.push(rel)
    else if (rel === 'theme.json' || rel === 'functions.php' || rel === 'style.css' || /^inc\//.test(rel)) out.full.push({ file: rel, reason: 'global theme input' })
    else out.full.push({ file: rel, reason: 'no page mapping for this file (fail closed)' })
  }
  return out
}

/**
 * The DOM states a changed selector is matched in: one per distinct (width × theme) of the variants
 * the given stages measure. The DOM of a page is not one thing — a theme toggle writes
 * `data-theme="dark"` on <html> (so `html[data-theme=dark] .card` matches nothing in light), and a
 * responsive script moves or builds nodes below a breakpoint — and matching on the light desktop
 * DOM alone missed every page a dark-only or mobile-only rule reaches. The dark state loads the page
 * with the contract's own dark hook, as visual-qa does.
 */
export function matchStatesFor(contract, stageIds = null) {
  const stages = (contract.visual?.stages ?? STAGES).filter((s) => !stageIds || stageIds.includes(s.id))
  const variants = new Map((contract.variants ?? []).map((v) => [v.id, v]))
  const t = contract.design?.theme
  const darkHook = t ? (t.storage?.type === 'cookie' && t.storage.key ? `cookie:${t.storage.key}=dark` : t.attribute ? `attr:${t.attribute}=dark` : null) : null
  const out = new Map()
  for (const s of stages)
    for (const id of s.variants) {
      const v = variants.get(id)
      if (!v) throw new Error(`stage ${s.id} names variant ${id}, which the contract does not declare`)
      const key = `${v.width}-${v.theme}`
      if (!out.has(key)) out.set(key, { id: key, viewport: { width: v.width, height: v.height ?? 900 }, theme: v.theme, hook: v.theme === 'dark' ? darkHook : null })
    }
  for (const st of out.values()) if (st.theme === 'dark' && !st.hook) throw new Error('the contract names no dark hook (design.theme) — a dark state cannot be matched')
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
}

/**
 * Pages of `pages` whose live DOM matches at least one selector in at least one of `states`
 * (matchStatesFor; default the light desktop DOM only, as before). A selector the browser rejects
 * makes the answer FULL (`failClosed`). A page that does not load counts as affected. `launch`
 * lets a test hand in the browser.
 */
export async function pagesMatching({ site, pages, selectors, launch = null, viewport = { width: 1440, height: 900 }, states = null }) {
  const t0 = performance.now()
  const out = { selectors, pages: {}, affected: [], failClosed: false, errors: [], states: [], byState: {} }
  if (!selectors.length) return { ...out, seconds: 0 }
  const list = states?.length ? states : [{ id: `${viewport.width}-light`, viewport, theme: 'light', hook: null }]
  out.states = list.map((s) => s.id)
  const hit = new Set()
  const lb = lazyBrowser(launch ? { launch } : {})
  try {
    for (const st of list) {
      const ctx = await (await lb.get()).newContext({ viewport: st.viewport, colorScheme: st.theme === 'dark' ? 'dark' : 'light' })
      try {
        if (st.hook) await ctx.addInitScript(darkInitScript(st.hook))
        const page = await ctx.newPage()
        for (const p of pages) {
          try {
            await page.goto(new URL(p.path, site).href, { waitUntil: 'domcontentloaded', timeout: 30000 })
          } catch (e) {
            // A page that did not load cannot be cleared: it counts as affected.
            out.errors.push({ page: p.id, state: st.id, error: String(e.message).slice(0, 200) })
            hit.add(p.id)
            continue
          }
          const counts = await page.evaluate((sels) => sels.map((s) => { try { return document.querySelectorAll(s).length } catch { return -1 } }), selectors)
          if (counts.includes(-1)) out.failClosed = true
          const row = (out.pages[p.id] ??= {})
          selectors.forEach((s, i) => (row[s] = row[s] === -1 || counts[i] === -1 ? -1 : Math.max(row[s] ?? 0, counts[i])))
          if (counts.some((c) => c !== 0)) {
            hit.add(p.id)
            ;(out.byState[st.id] ??= []).push(p.id)
          }
        }
      } finally {
        await ctx.close()
      }
    }
  } finally {
    await lb.close()
  }
  out.affected = pages.map((p) => p.id).filter((id) => hit.has(id))
  if (out.failClosed) out.affected = pages.map((p) => p.id)
  out.seconds = Math.round((performance.now() - t0) / 100) / 10
  return out
}

/**
 * The contract pages a changed template or pattern file draws, from the contract's own map: a
 * template reaches the pages served by it (page `template`, else its layout's); a pattern
 * (`patterns/<slug>.php`) the pages whose sections map to it in patterns.map.json.
 *   `unknown`   a pattern with no map, or one no page section maps to — nothing says which pages it
 *               reaches (a template can insert it anywhere), so the caller measures FULL;
 *   `htmlOnly`  a template no contract page is served by — it can only reach a page by becoming its
 *               template, and then that page's served HTML moves (round.mjs compares HTML hashes).
 */
export function dependentPages({ contract, files, patternsMap = null }) {
  const layouts = new Map((contract.layouts ?? []).map((l) => [l.id, l]))
  const templateOf = (p) => p.template ?? layouts.get(p.layout)?.template ?? null
  const slugOf = (t) => patternsMap?.types?.[t]?.pattern?.split('/').pop() ?? null
  const pages = new Set()
  const unknown = []
  const htmlOnly = []
  const why = []
  for (const f of files) {
    const rel = f.split(path.sep).join('/')
    if (/^templates\/[^/]+\.html$/.test(rel)) {
      const hit = contract.pages.filter((p) => templateOf(p) === rel).map((p) => p.id)
      if (!hit.length) htmlOnly.push({ file: rel, reason: 'no contract page is served by this template' })
      hit.forEach((id) => pages.add(id))
      if (hit.length) why.push(`${rel} serves ${hit.length} page(s)`)
    } else if (/^patterns\/[^/]+\.php$/.test(rel)) {
      const slug = path.basename(rel, '.php')
      if (!patternsMap) {
        unknown.push({ file: rel, reason: 'no patterns map: the pages using this pattern are not known' })
        continue
      }
      const hit = contract.pages.filter((p) => (p.sections ?? []).some((t) => slugOf(t) === slug)).map((p) => p.id)
      if (!hit.length) unknown.push({ file: rel, reason: 'no contract page section maps to this pattern' })
      hit.forEach((id) => pages.add(id))
      if (hit.length) why.push(`${rel} is in ${hit.length} page(s)`)
    } else unknown.push({ file: rel, reason: 'not a template or a pattern' })
  }
  return { pages: contract.pages.map((p) => p.id).filter((id) => pages.has(id)), unknown, htmlOnly, why }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
  if (!opt('--old') || !opt('--new') || !opt('--site') || !(opt('--run-root') || opt('--contract'))) {
    console.error('usage: affected.mjs --old <a.css> --new <b.css> (--run-root <dossier> | --contract f) --site <origin> [--out f.json]')
    process.exit(2)
  }
  const contract = JSON.parse(readFileSync(resolveContract({ runRoot: opt('--run-root'), explicit: opt('--contract'), name: CANONICAL.visual }).path, 'utf8'))
  const keys = changedRules(readFileSync(opt('--old'), 'utf8'), readFileSync(opt('--new'), 'utf8'))
  const { full, selectors } = selectorsFor(keys)
  const r = full ? { selectors, affected: contract.pages.map((p) => p.id), failClosed: true, reason: full } : await pagesMatching({ site: opt('--site'), pages: contract.pages, selectors })
  if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify({ changedRules: keys, ...r }, null, 2) + '\n')
  console.log(JSON.stringify({ changedRules: keys.length, selectors: r.selectors, affected: r.affected, failClosed: r.failClosed, seconds: r.seconds ?? 0 }))
}
