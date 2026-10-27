/**
 * The ground under a text written in markup, found by walking UP the element tree of its file: the
 * nearest element that paints a background, through simple component wrappers whose source is in the
 * template (`<Band>` whose root wraps its `<slot />` in `bg-ink`). PURE apart from the file texts it
 * is given.
 *
 * Stays conservative: a class the file cannot show (a prop, a lookup, a condition holding a ground), a
 * gradient or picture ground, a ground that changes with the screen width, an element built into a
 * variable, a component from outside the template — each ends the walk as `unknown`, never as a guess.
 */
import { dirname, join, normalize } from 'node:path'
import { classAttr } from './class-attr.mjs'
import { elementAround, elementAt, elementTree, isDetached } from './markup-tree.mjs'

const POSITIONAL =
  /^(auto|cover|contain|center|top|bottom|left|right|left-top|left-bottom|right-top|right-bottom|no-repeat|repeat|repeat-x|repeat-y|repeat-round|repeat-space|fixed|local|scroll|none|clip-.+|origin-.+|blend-.+|size-.+|position-.+|\[(length|position|size):.+\])$/
const PICTURE =
  /^(gradient-.+|linear-.+|radial(-.+)?|conic(-.+)?|\[(url|image|linear-gradient|radial-gradient|conic-gradient)[(:].*\])$/
const RESPONSIVE = /^(sm|md|lg|xl|2xl|max-[\w-]+|min-[\w-]+|@[\w-]+|print|portrait|landscape)$/
const STATE =
  /^(hover|focus|focus-visible|focus-within|active|visited|disabled|group-[\w-]+|peer-[\w-]+|aria-[\w-]+|data-[\w-]+|open|checked|first|last|odd|even|before|after|placeholder|selection|file|marker)$/
const MAX_DEPTH = 4

/**
 * @param {{ texts: Map<string, string>, aliases?: Record<string, string>,
 *   bgOf: (value: string, scheme: string) => { role: string | null, hex: string | null },
 *   cssBg: Map<string, string> }} env
 *   texts: every scanned markup file by its relative path; aliases: import prefixes (`@/` → `src/`);
 *   bgOf: the role of a background value (`ink`, `[#14171a]`, a CSS value); cssBg: single-class rules
 *   of the stylesheets that paint a background (`.band-ink` → `var(--color-ink)`)
 */
export function groundFinder(env) {
  const trees = new Map()
  const treeOf = (rel) => {
    if (!trees.has(rel)) trees.set(rel, elementTree(env.texts.get(rel) ?? ''))
    return trees.get(rel)
  }

  /** The ground one element paints: { role, hex } · { unknown } · 'clear' (transparent) · null (none). */
  const own = (el, scheme) => {
    const info = classAttr(el.attrs)
    let ground = null
    let unknown = info.unknown ? 'a class from a prop or lookup' : null
    let condition = null
    const visit = (token, always) => {
      const m = /^((?:[\w-]+:|\[[^\]]+\]:)*)!?bg-(.+?)(?:\/(\d+|\[[\d.]+\]))?!?$/.exec(token)
      const css = !m && always && env.cssBg.get(token.replace(/^!/, ''))
      if (css) return (ground ??= fromValue(css, scheme))
      if (!m) return
      const variants = m[1].split(':').filter(Boolean)
      const value = m[2]
      if (POSITIONAL.test(value)) return
      if (variants.some((v) => STATE.test(v))) return
      if (variants.includes('dark') !== (scheme === 'dark') && variants.includes('dark')) return
      if (variants.some((v) => RESPONSIVE.test(v) || v.startsWith('[')))
        return (condition = `a ground that changes with the screen (${token})`)
      if (!always) return (condition = `a ground under a condition (${token})`)
      if (PICTURE.test(value)) return (unknown = `a picture or gradient ground (${token})`)
      if (/^(transparent)$/.test(value)) return (ground ??= 'clear')
      if (/^(inherit|current)$/.test(value)) return (unknown = `an inherited ground (${token})`)
      const opacity = m[3] ? Number.parseFloat(m[3].replace(/[[\]]/g, '')) : 100
      if ((opacity <= 1 ? opacity * 100 : opacity) < 90) return (unknown = `a see-through ground (${token})`)
      const r = env.bgOf(value, scheme)
      // a dark: ground beats the plain one on the dark side
      if (ground && ground !== 'clear' && !variants.includes('dark')) return
      ground = r.role
        ? { role: r.role, hex: r.hex }
        : { unknown: `a ground whose role is unclear (${token})` }
    }
    for (const t of info.always) visit(t, true)
    for (const t of info.sometimes) visit(t, false)
    if (condition) return { unknown: condition }
    if (ground && ground !== 'clear') return ground
    if (unknown) return { unknown }
    return ground
  }
  const fromValue = (value, scheme) => {
    const r = env.bgOf(value, scheme)
    return r.role ? { role: r.role, hex: r.hex } : { unknown: `a ground whose role is unclear (${value})` }
  }

  /** Walk up from `el` in file `rel`; `top` is what reaching the top of the file means. */
  const walk = (rel, el, scheme, depth, top) => {
    const text = env.texts.get(rel) ?? ''
    const els = treeOf(rel)
    for (let cur = el; cur; ) {
      const g = /^[A-Z]|\./.test(cur.name) && cur !== el ? wrapper(rel, cur, scheme, depth) : own(cur, scheme)
      if (g && g !== 'clear') return g
      if (isDetached(text, els, cur))
        return { unknown: 'an element built into a variable: where it is drawn is decided at run time' }
      if (cur.parent === -1) return top
      cur = els[cur.parent]
    }
    return top
  }

  /** What a component tag lays under its children: through its own source, when the template has it. */
  const wrapper = (rel, el, scheme, depth) => {
    if (el.name === 'Fragment') return null
    const info = classAttr(el.attrs)
    if (info.present) return { unknown: `component <${el.name}> given a class` }
    if (depth >= MAX_DEPTH) return { unknown: `component <${el.name}> nested too deep` }
    const src = importOf(rel, el.name)
    if (!src) return { unknown: `component <${el.name}> whose source is not in the template` }
    const wtext = env.texts.get(src)
    const els = treeOf(src)
    const sites = src.endsWith('.astro')
      ? els.filter((s) => s.name === 'slot' && !/\bname\s*=/.test(s.attrs))
      : [...wtext.matchAll(/\{\s*(?:props\.)?children\s*\}/g)]
          .map((m) => elementAround(els, m.index))
          .filter(Boolean)
    if (!sites.length) return { unknown: `component <${el.name}> with no plain slot` }
    const found = sites.map((s) => walk(src, s, scheme, depth + 1, 'clear'))
    const key = (g) => (g === 'clear' || g === null ? 'clear' : g.unknown ? '?' : g.role)
    if (found.some((g) => g?.unknown)) return found.find((g) => g?.unknown)
    if (new Set(found.map(key)).size > 1)
      return { unknown: `component <${el.name}> lays different grounds under its slots` }
    return found[0] === null ? 'clear' : found[0]
  }

  const importOf = (rel, name) => {
    const text = env.texts.get(rel) ?? ''
    const m = new RegExp(String.raw`import\s+${name.split('.')[0]}\s+from\s+["']([^"']+)["']`).exec(text)
    if (!m || name.includes('.')) return null
    let p = m[1]
    for (const [prefix, to] of Object.entries(env.aliases ?? {}))
      if (p.startsWith(prefix)) p = to + p.slice(prefix.length)
    if (p.startsWith('.')) p = join(dirname(rel), p)
    p = normalize(p).split('\\').join('/')
    for (const c of [p, `${p}.astro`, `${p}.tsx`, `${p}.jsx`, `${p}/index.astro`, `${p}/index.tsx`])
      if (env.texts.has(c)) return c
    return null
  }

  /**
   * @param {string} rel the file @param {number} offset where the text's class sits @param {string} scheme
   * @returns {{ role: string, hex: string | null } | { unknown: string } | null}
   */
  return (rel, offset, scheme) => {
    const text = env.texts.get(rel)
    if (text === undefined) return null
    const el = elementAt(treeOf(rel), offset)
    // a class inside a JSX value given to another attribute (`icon={<X class=…/>}`): not this element's
    if (!el || /<[A-Za-z]/.test(text.slice(el.attrsAt, offset))) return null
    const g = walk(rel, el, scheme, 0, null)
    return g === 'clear' ? null : g
  }
}
