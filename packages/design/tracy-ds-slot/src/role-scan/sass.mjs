/**
 * What a rewrite must not touch in Sass and LESS sources, and which compiled stylesheet is the twin of
 * which source (JA Kinetic dry run, 15/10/2026: `$blue: var(--ds-c-accent, #0d6efd)` fed
 * `tint-color($blue, 80%)` and broke the Sass build; source and compiled CSS were counted twice).
 * PURE except `compiledTwins`, which reads the `.map` files next to the compiled CSS.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

// functions the browser computes: a colour literal inside them may become a role read
export const CSS_FUNCS =
  /^(var|rgba?|hsla?|light-dark|color-mix|calc|min|max|clamp|(repeating-)?(linear|radial|conic)-gradient|drop-shadow|url|env|color|oklch|oklab|lab|lch|hwb|attr|image-set|cross-fade|blur|brightness|contrast|hue-rotate|sepia)$/i

/** The innermost function call around offset `at` of a value, or null. */
export function enclosingFunction(value, at) {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    if (value[i] === ')') depth++
    else if (value[i] === '(') {
      if (depth) {
        depth--
        continue
      }
      return /([\w.-]+)$/.exec(value.slice(0, i))?.[1] ?? ''
    }
  }
  return null
}

/** The colour at `at` is an argument of a preprocessor function (`darken(#dee2e6, 10%)`). */
export const inPreprocessorFunction = (value, at) => {
  const fn = enclosingFunction(value, at)
  return fn !== null && !CSS_FUNCS.test(fn)
}

/** `$`/`@` variables a preprocessor function call reads (`tint-color($blue, 80%)`, `rgba($black, .5)`). */
export function functionInputs(text) {
  const out = new Set()
  for (const m of text.matchAll(/(?<![#\w-])([\w.-]+)\(([^()]*)\)/g)) {
    if (/^var$/i.test(m[1])) continue
    for (const v of m[2].matchAll(/(?<![\w-])([$@][\w-]+)/g)) out.add(v[1])
  }
  return out
}

/**
 * Compiled stylesheet → the source it is built from, for every scanned `.css` that has one: the first
 * source of its `.map` that is a scanned file, else `scss|less/<same path>.scss|less` (`css/x.css` →
 * `scss/x.scss`), else a source of the same name next to it.
 * @param {string} root @param {{ path: string, rel: string, kind: string }[]} files
 * @returns {Map<string, string>}
 */
export function compiledTwins(root, files) {
  const sources = new Set(files.filter((f) => f.kind === 'scss' || f.kind === 'less').map((f) => f.rel))
  const out = new Map()
  for (const f of files.filter((x) => x.kind === 'css')) {
    let map = null
    try {
      map = JSON.parse(readFileSync(`${f.path}.map`, 'utf8'))
    } catch {}
    const fromMap = (map?.sources ?? [])
      .map((s) =>
        relative(root, normalize(join(dirname(f.path), map.sourceRoot ?? '', s)))
          .split('\\')
          .join('/')
      )
      .find((s) => sources.has(s))
    const stem = f.rel.replace(/\.css$/i, '')
    const guess = ['scss', 'less']
      .flatMap((ext) =>
        [stem.replace(/^css\//, `${ext}/`).replace(/\/css\//, `/${ext}/`), stem].map((s) => `${s}.${ext}`)
      )
      .find((s) => sources.has(s))
    const twin = fromMap ?? guess
    if (twin) out.set(f.rel, twin)
  }
  return out
}

const CANDIDATES = {
  radius: ['card-radius', 'btn-radius', 'input-radius', 'pill-radius'],
  font: ['font-body', 'font-display'],
  text: ['fg', 'muted', 'accent-text'],
  fill: ['surface', 'accent', 'ink'],
  line: ['border', 'border-soft'],
  glyph: ['accent', 'fg'],
  custom: ['accent', 'surface', 'fg']
}

/**
 * A finding a rewrite must leave alone in a Sass/LESS source, as `{ role, candidates, reason }` for a
 * flag, or null: a variable definition (`$blue: #0d6efd`) feeds the preprocessor's own maths and
 * colour functions (`tint-color($blue, 80%)`), which a var() breaks, so its uses and the compiled CSS
 * are rewritten instead; a literal inside a preprocessor function (`darken(#dee2e6, 10%)`) is computed
 * at build time.
 * @param {object} f raw finding @param {{ preInputs?: Set<string>, varRoles: Map<string, { role: string | null }> }} ctx
 */
export function preprocessorFlag(f, ctx) {
  if ((f.lang === 'scss' || f.lang === 'less') && /^[$@]/.test(f.prop ?? '')) {
    const fn = ctx.preInputs?.has(f.prop) ? ' and a preprocessor function reads it' : ''
    const guess = f.kind === 'custom' ? (ctx.varRoles.get(f.name)?.role ?? null) : null
    const kind = f.valueType === 'radius' || f.valueType === 'font' ? f.valueType : f.kind
    return {
      role: guess,
      candidates: [...(guess ? [guess] : []), ...(CANDIDATES[kind] ?? CANDIDATES.custom)],
      reason: `Sass/LESS variable ${f.prop}${fn}: never rewritten to var(); rewrite where it is used or the compiled CSS`
    }
  }
  if (f.preFn)
    return {
      role: null,
      candidates: CANDIDATES[f.kind] ?? [],
      reason: 'argument of a Sass/LESS function: computed at build time'
    }
  return null
}
