/**
 * Which findings of a compiled stylesheet are twins of its Sass/LESS source, one by one (15/10/2026).
 * A compiled finding is a twin, listed but counted at the source, ONLY when the source carries it: the
 * source declaration it was built from (by the `.map`, else by selector and property) holds the same
 * literal, a Sass/LESS expression that computes it, or a plain variable whose value is that literal,
 * or the source also builds from files outside the scan (a framework) and the map does not prove it.
 * A literal only the compiled CSS carries (a stale or hand-edited build) is counted where it is, as
 * out of sync. PURE except the `.map` files `source-map.mjs` reads.
 */
import { lineIndex } from './css-lexer.mjs'
import { parseColour } from './literals.mjs'
import { importGraph } from './preprocessor-imports.mjs'
import { CSS_FUNCS } from './sass.mjs'
import { sourceMapOf } from './source-map.mjs'

/** The value is computed by the preprocessor: a `$`/`@` variable, an interpolation or a Sass/LESS function. */
const isDerived = (value) =>
  /(^|[^\w-])[$@][\w{-]/.test(value) || [...value.matchAll(/([\w.-]+)\(/g)].some((m) => !CSS_FUNCS.test(m[1]))

const norm = (t) =>
  String(t ?? '')
    .toLowerCase()
    .replace(/\s*!important\s*$/, '')
    .replace(/'/g, '"')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/(^|[^\d.])0+\.(\d)/g, '$1.$2')
    .trim()

/** Two findings name the same value: the same colour, or the same radius or font text. */
const same = (f, r) =>
  r.hex && f.hex
    ? f.hex === r.hex && Math.abs((f.alpha ?? 1) - (r.alpha ?? 1)) < 0.02
    : norm(f.text) === norm(r.text)

/** A literal value (a variable's) holds the finding's value. */
function holds(value, r) {
  if (!r.hex) return norm(value) === norm(r.text)
  const tokens = value.match(/#[0-9a-f]{3,8}\b|(rgba?|hsla?)\([^()]*\)|\b[a-z]+\b/gi) ?? []
  return tokens.some((t) => {
    const c = parseColour(t)
    return c && same(c, r)
  })
}

/** Selector list members, spaced the way a build writes them (`[type="submit"]` → `[type=submit]`). */
const members = (sel) =>
  (sel ?? '')
    .toLowerCase()
    .replace(/\[([\w-]+)([~|^$*]?=)["']([\w-]*)["']\]/g, '[$1$2$3]')
    .split(',')
    .map((s) =>
      s
        .replace(/\s*([>+~])\s*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
const tokens = (m) => m.split(/[\s>+~]+/).filter(Boolean)
/**
 * A source selector and a compiled one name the same rule: one member is the same, or (a nested
 * comma list, which the lexer joins only roughly) a compiled member ends where the source does and
 * is made of the source's compound selectors.
 */
const selectorsMatch = (source, compiled) => {
  const s = members(source)
  const c = members(compiled)
  const set = new Set(s)
  if (c.some((m) => set.has(m))) return true
  if (s.length < 2) return false
  const pool = new Set(s.flatMap(tokens))
  const last = tokens(s.at(-1)).at(-1)
  return c.some((m) => {
    const t = tokens(m)
    return t.at(-1) === last && t.every((x) => pool.has(x))
  })
}

/**
 * @param {{ root: string, per: { file: { rel: string, path: string, kind: string }, text: string, decls: object[] }[],
 *   raw: object[], twins: Map<string, string> }} input  twins: compiled CSS → its source (`compiledTwins`)
 * @returns {(r: object) => { twin: string } | { outOfSync: string } | null}
 */
export function twinSync({ root, per, raw, twins }) {
  const pre = new Map(
    per
      .filter((p) => p.file.kind === 'scss' || p.file.kind === 'less')
      .map((p) => [p.file.rel, { decls: p.decls, line: lineIndex(p.text), text: p.text.split('\n') }])
  )
  const byRel = new Map(per.map((p) => [p.file.rel, p]))
  const vars = new Map()
  for (const p of pre.values())
    for (const d of p.decls)
      if (/^[$@][\w-]+$/.test(d.prop))
        vars.set(d.prop, d.value.replace(/\s*!(default|global)\s*/g, '').trim())
  const srcRaw = new Map()
  for (const f of raw) if (pre.has(f.file)) srcRaw.set(f.file, [...(srcRaw.get(f.file) ?? []), f])

  /** A plain variable followed to its value; null when it is defined outside the scan. */
  const resolve = (value, depth = 0) => {
    const m = /^([$@][\w-]+)(\s*!important)?$/.exec(value.trim())
    if (!m) return value.trim()
    const next = vars.get(m[1])
    return next === undefined || depth > 8 ? null : resolve(next, depth + 1)
  }
  /** The source declaration `d` of `file` carries the compiled finding `r`. */
  const carries = (d, file, r) => {
    const v = resolve(d.value)
    if (v === null || isDerived(v)) return true
    if (v !== d.value.trim()) return holds(v, r)
    return (srcRaw.get(file) ?? []).some((f) => f.start >= d.start && f.start <= d.end && same(f, r))
  }
  /** true / false at the mapped source line; null when the map does not hold there (a stale `.map`). */
  const atLine = (file, line, r) => {
    const p = pre.get(file)
    const here = p.decls.filter((d) => p.line(d.start) <= line && line <= p.line(d.end))
    const same = here.filter((d) => d.prop === r.prop)
    if (same.length) return same.some((d) => carries(d, file, r))
    // a line the preprocessor expands (an @include, @extend, mixin call or loop) wrote the value
    if (/@(include|extend|each|for|if|import|use)\b|^\s*[.#][\w-]+\s*\(/.test(p.text[line - 1] ?? ''))
      return true
    return null
  }
  /** The rule of `files` at the compiled selector: carries the value, or not; null when none declares it. */
  const atSelector = (r, files) => {
    let other = null
    for (const file of files)
      for (const d of pre.get(file)?.decls ?? []) {
        if (!selectorsMatch(d.selector, r.selector)) continue
        // an interpolated property (`--t4-#{$name}` in an @each) is written by the preprocessor
        if (/[#@]\{/.test(d.prop)) return { twin: file }
        if (d.prop !== r.prop) continue
        if (carries(d, file, r)) return { twin: file }
        other ??= file
      }
    return other ? { outOfSync: other } : null
  }
  const graph = importGraph(new Map([...pre].map(([rel, p]) => [rel, p.text.join('\n')])))
  const maps = new Map()
  return (r) => {
    const src = twins.get(r.file)
    if (!src) return null
    // a corner a component never sets has no literal a build could leave stale: judged at the source
    if (r.valueType === 'missing') return { twin: src }
    const p = byRel.get(r.file)
    if (!maps.has(r.file)) maps.set(r.file, p ? sourceMapOf(root, p.file.path) : null)
    const map = maps.get(r.file)
    const column = p ? r.start - (p.text.lastIndexOf('\n', r.start - 1) + 1) : 0
    const hit = map?.at(r.line, column)
    // built from a source outside the template (the framework's Sass: T4, Bootstrap): the framework's
    // own line, handled through the framework variables the template maps to roles, never rewritten
    if (hit && !pre.has(hit.source)) return { framework: hit.source }
    const onLine = hit ? atLine(hit.source, hit.line, r) : null
    if (onLine !== null) return onLine ? { twin: hit.source } : { outOfSync: hit.source }
    // by selector, within the files the source is built from; when it also builds from files outside
    // the scan (a framework), a value it does not carry may come from there: no proof, a twin
    const { files, outside } = graph(src)
    const at = atSelector(r, files)
    if (at?.twin || outside) return at?.twin ? at : { twin: src }
    return at ?? { outOfSync: src }
  }
}

/** A finding's sorted verdict with its twin verdict: a stale compiled literal says why it counts. */
export function withSync(sorted, sync) {
  if (!sync) return sorted
  if (sync.framework)
    return {
      class: 'keep',
      role: null,
      reason: `framework: compiled from ${sync.framework}, outside the template; it follows the roles through the framework variables the template maps`,
      framework: sync.framework
    }
  if (sync.external) {
    if (sorted.class === 'keep') return sorted
    const role = sorted.role ?? null
    return {
      class: 'flag',
      role: null,
      candidates: role ? [role] : (sorted.candidates ?? []),
      reason: `not the template's own source (${sync.external}): a rewrite here is lost on the next build or at run time. Change it where it is made, or override it in the template's own stylesheet${role ? ` (best guess ${role})` : ''}`,
      external: sync.external
    }
  }
  if (sync.twin) return { ...sorted, twin: sync.twin }
  const reason =
    sorted.class === 'keep'
      ? sorted.reason
      : `compiled CSS out of sync with source ${sync.outOfSync}: the source does not carry this value. ${sorted.reason}`
  return { ...sorted, reason, outOfSync: sync.outOfSync }
}
