#!/usr/bin/env node
/**
 * Generate the motion library both CMS themes ship, from one source.
 *
 * `src/runtime.mjs` is the whole runtime; `src/base.css` and one `src/effects/<id>.css` per
 * catalogue entry are the whole stylesheet. One run, three kinds of output:
 *
 *   WordPress  packages/cms/tracy-wordpress-theme/src/tracy/assets/js/tracy-motion.js
 *              …/assets/css/tracy-motion.css
 *              …/inc/motion-head.php
 *   Joomla     packages/cms/tracy-joomla-template/src/tpl_tracy/media/js/tracy-motion.js
 *              …/media/css/tracy-motion.css
 *              …/motion-head.php
 *   Library    packages/cms/tracy-cms-motion/src/text.generated.ts
 *
 * The two theme copies of each emitted file are byte-identical, and so are the three copies of the
 * head-marker script — the two partials and the `headSnippet` export of the module. The module is
 * how the desk plugin reads the library's text: an ordinary import, never a theme package at run
 * time.
 *
 * WHY A GATE AND NOT A PAIR OF EYES. The seven generated files are committed, so a reader sees
 * plausible files whether or not they match the source, and a stale copy is invisible in review:
 * the diff shows nothing, the site simply runs last week's library while the catalogue promises
 * this week's. The same blindness covers the version. Line 1 of the emitted JS is the only thing
 * that says which library a site is running, and no one reads a minified file's first line by
 * hand. `--check` compares every generated file and that line against the source and exits 1 on
 * any drift.
 *
 * WHY THE VERSION RIDES IN A BANNER. esbuild does not minify a banner, so writing the line there
 * puts it ahead of the minified output where no comment-stripping pass can reach it.
 *
 * Usage:  node scripts/build.mjs            # writes into both theme packages and this one
 *         node scripts/build.mjs --check    # exits 1 when any generated file is stale; writes nothing
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { EFFECTS, SLOTS, VERSION } from '../catalog.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(PKG, '..', '..', '..')
const WORDPRESS = path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme', 'src', 'tracy')
const JOOMLA = path.join(ROOT, 'packages', 'cms', 'tracy-joomla-template', 'src', 'tpl_tracy')

/**
 * Line 1 of the emitted JS. One space, no `v`, no trailing punctuation, nothing else on the line:
 * the site-side reader greps it as `^// tracy-motion ([0-9]+)$`.
 * @param {number} version
 */
export function banner(version) {
  return `// tracy-motion ${String(version)}`
}

/**
 * The head-marker script: one `<script>` element and nothing else, and byte-for-byte what both
 * theme partials hold and what the `headSnippet` export carries. One string, three destinations.
 *
 * It runs synchronously in `<head>`, ahead of the library's stylesheet, because the hide-before-
 * entrance rule is keyed on this marker: set it any later and a visitor sees the page, then sees it
 * blanked, then sees it animate. Three things it does and nothing else — set the marker, leave a
 * reduced-motion visitor alone, and take the marker off again if the library has not started within
 * ~3 s. That last one is why a blocked, missing or unparsable bundle costs a visitor no more than a
 * page with no motion; without it the page stays hidden for good.
 *
 * The file it is written into is a `.php` partial holding no PHP: there is nothing here that
 * depends on the site, so there is nothing for PHP to fill in.
 */
export const HEAD_SNIPPET = `<script>(function(){var h=document.documentElement;if(!window.matchMedia||!window.matchMedia('(prefers-reduced-motion: no-preference)').matches)return;h.classList.add('tracy-motion');window.setTimeout(function(){if(!window.TracyMotionStarted)h.classList.remove('tracy-motion')},3000)})()</script>
`

/**
 * `src/text.generated.ts`: the library's own text, as a module the desk plugin imports like any
 * other. That import is the only way the library's bytes reach the plugin — it never reads a theme
 * package at run time — so `js` here is the emitted bundle byte-for-byte, banner line included,
 * never a re-minified variant that would report a version no build ever produced.
 *
 * The catalogue travels whole. The emitted bundle carries `id` and `slot` and nothing else, but the
 * gallery metadata the browser never sees — `since`, `cssPropsWritten`, `sampleHtml`,
 * `description`, and each slot's `galleryLabel` and `order` — is exactly what the desk needs, and
 * this module is where it stays. Effects are keyed by `id`, which is how both the plugin's host
 * build and its client build look one up.
 *
 * @param {{ css: string, js: string, version: number, effects: readonly object[], slots: readonly object[] }} parts
 */
export function textModule({ css, js, version, effects, slots }) {
  const catalog = { effects: Object.fromEntries(effects.map((effect) => [effect.id, effect])), slots }
  return `${[
    '/* GENERATED by packages/cms/tracy-cms-motion/scripts/build.mjs — do not edit.',
    '   The cms-motion gate compares this file byte-for-byte with a fresh build. */',
    '',
    `export const css = ${JSON.stringify(css)}`,
    '',
    `export const js = ${JSON.stringify(js)}`,
    '',
    `export const version = ${String(version)}`,
    '',
    `export const headSnippet = ${JSON.stringify(HEAD_SNIPPET)}`,
    '',
    `export const catalog = ${JSON.stringify(catalog, null, 2)}`
  ].join('\n')}\n`
}

/**
 * What the browser needs to know about the effects this build carries: the id and the slot it
 * belongs to. Sorted by id so the emitted bytes do not move when the catalogue is reordered.
 * @param {readonly { id: string, slot: string }[]} effects
 */
export function runtimeEffects(effects) {
  const map = {}
  for (const id of effects.map((effect) => effect.id).sort()) {
    map[id] = effects.find((effect) => effect.id === id).slot
  }
  return map
}

/**
 * Refuse a catalogue the emitted file cannot honour: an effect declaring itself newer than the
 * library, one filed under a slot that does not exist, or one missing the `css props written`
 * field the gate reads — named here, where the record is, rather than as a crash further down.
 * @param {readonly { id: string, since: number, slot: string, cssPropsWritten: string }[]} effects
 * @param {number} version
 * @param {readonly { id: string }[]} slots
 */
export function assertCatalog(effects, version, slots) {
  const known = new Set(slots.map((slot) => slot.id))
  for (const effect of effects) {
    if (effect.since > version)
      throw new Error(
        `effect ${effect.id} declares since ${String(effect.since)}, ahead of library version ${String(version)}`
      )
    if (!known.has(effect.slot))
      throw new Error(
        `effect ${effect.id} is filed under slot ${effect.slot}, which is not one of the catalogue's slots`
      )
    if (typeof effect.cssPropsWritten !== 'string')
      throw new Error(`effect ${effect.id} has no css props written field, which the gate reads`)
  }
}

/**
 * The properties an effect is allowed to paint with: the entrance channel first, then the
 * interaction channel. They are the ones a browser can animate off the main thread, so an effect
 * built from them cannot shift layout on a customer's page however badly it is written.
 */
const PAINTABLE = Object.freeze(['transform', 'opacity', 'filter', 'translate', 'scale', 'rotate'])

/** The one prefix the library owns. Every variable it declares or reads sits under it. */
const OWN_VAR = '--tracy-motion-'

/**
 * Properties that drive an effect rather than paint it, and so stand outside the list above.
 * `animation` and `transition` are here alongside their longhands: the shorthand sets the same
 * thing the longhands set, and a gate that took only `animation-duration` would push every
 * effect into writing four lines where one says it better.
 * @param {string} prop
 */
function drivesRatherThanPaints(prop) {
  return prop === 'will-change' || /^(animation|transition)(-[a-z-]+)?$/.test(prop)
}

/**
 * Every declaration in a stylesheet, as `{ prop, value }`, with comments gone.
 *
 * Comments, quoted strings and unquoted `url(...)` tokens are blanked in one left-to-right pass
 * before any brace is looked for, because a `{`, `;` or `:` inside a string is text, not syntax:
 * left alone, a `content: "{"` would open a block the sheet never opened and every declaration
 * before it would fall out of the walk unseen. One pass, not three, so a quote inside a comment
 * cannot open a string and a `/*` inside a string cannot open a comment. A string becomes `""`
 * rather than nothing, so the declaration holding it still parses and still faces the gate.
 *
 * A block holding no further brace holds declarations and nothing else, but the block around it
 * can hold declarations too once the CSS nests, so one pass over the innermost blocks misses them.
 * Each turn takes the innermost block, harvests it, then cuts it and the selector or at-rule
 * prelude in front of it out of the sheet, leaving a `;` — so its parent is innermost next turn
 * and every declaration is reached however deep it sits. That is what stops a wrapper, at-rule or
 * nested rule, from carrying a property past the gate. A custom property whose value itself carries
 * braces is read as a block, not a value; that is the one CSS shape this reader does not follow,
 * and a real parser is the only way to.
 * @param {string} css
 */
export function declarations(css) {
  const found = []
  const innermost = /\{([^{}]*)\}/
  let rest = css.replace(
    /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|url\(\s*[^"'\s)][^)]*\)/g,
    (match) => (match.startsWith('/*') ? '' : '""')
  )
  for (let block = innermost.exec(rest); block !== null; block = innermost.exec(rest)) {
    for (const part of block[1].split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      const prop = part.slice(0, colon).trim()
      if (prop !== '') found.push({ prop, value: part.slice(colon + 1).trim() })
    }
    const prelude =
      Math.max(
        rest.lastIndexOf(';', block.index - 1),
        rest.lastIndexOf('{', block.index - 1),
        rest.lastIndexOf('}', block.index - 1)
      ) + 1
    rest = `${rest.slice(0, prelude)};${rest.slice(block.index + block[0].length)}`
  }
  return found
}

/**
 * The property list a catalogue record claims, read off the front of `cssPropsWritten`. The field
 * is a sentence — a comma list, then an optional clause after a semicolon saying how the effect is
 * driven — and only the list is a claim about CSS.
 * @param {string} cssPropsWritten
 */
export function declaredProps(cssPropsWritten) {
  return cssPropsWritten
    .split(';')[0]
    .split(',')
    .map((prop) => prop.trim())
    .filter((prop) => prop !== '')
}

/**
 * Refuse any sheet the library ships — base or effect — that it cannot stand behind, and answer
 * with the properties it writes.
 *
 * WHY A GATE AND NOT A PAIR OF EYES. These faults read as ordinary CSS. A `width` animation looks
 * like any other line and costs a customer a layout pass on every frame; a `var(--accent)` looks
 * like theming and silently couples the library to whichever design set the site happens to carry,
 * so the sheet changes colour when the site is restyled and no one links the two; and an `@import`
 * looks like housekeeping while the bundler pulls a file no one gated into the emitted stylesheet,
 * or, when the target is remote, leaves the customer's browser fetching a third party's CSS at
 * runtime. The library emits two files from one source; a sheet that reaches past this gate makes
 * that sentence untrue.
 *
 * `sheet` names the sheet in every message, so a refusal reads as the author wrote the line:
 * `effect hero-stagger` for an effect, `base` for the base sheet.
 *
 * @param {string} sheet
 * @param {string} css
 * @returns {Set<string>} the non-custom properties the sheet writes
 */
export function assertLibraryCss(sheet, css) {
  if (/@import\b/i.test(css))
    throw new Error(`${sheet} carries an @import, which would put CSS this gate never read into the build`)

  const written = new Set()
  for (const { prop, value } of declarations(css)) {
    for (const [, name] of value.matchAll(/var\(\s*(--[^\s,)]+)/g)) {
      if (!name.startsWith(OWN_VAR))
        throw new Error(
          `${sheet} reads ${name}, a variable the library does not own; only ${OWN_VAR}* is allowed`
        )
    }
    if (prop.startsWith('--')) {
      if (!prop.startsWith(OWN_VAR))
        throw new Error(
          `${sheet} declares ${prop}, a variable outside ${OWN_VAR}*, which the library does not own`
        )
      continue
    }
    if (!drivesRatherThanPaints(prop) && !PAINTABLE.includes(prop))
      throw new Error(`${sheet} writes ${prop}, which is not one of ${PAINTABLE.join(', ')}`)
    written.add(prop)
  }
  return written
}

/**
 * Refuse an effect whose stylesheet the library cannot stand behind: everything the base sheet
 * faces, and one thing only an effect can get wrong — a catalogue record that has drifted from the
 * CSS beside it, which is invisible by construction, because the two are read at different times
 * by different people. The gallery quotes `cssPropsWritten` to the customer, so drift there is the
 * library lying about itself.
 *
 * @param {{ id: string, cssPropsWritten: string }} effect
 * @param {string} css
 */
export function assertEffectCss(effect, css) {
  const written = assertLibraryCss(`effect ${effect.id}`, css)

  const declared = declaredProps(effect.cssPropsWritten).sort()
  const shipped = [...written].sort()
  if (declared.join(', ') !== shipped.join(', '))
    throw new Error(
      `effect ${effect.id} declares css props written "${declared.join(', ')}" but its CSS writes "${shipped.join(', ')}"`
    )
}

/**
 * The stylesheet source: the base sheet, then one sheet per effect in catalogue order. Every sheet
 * goes through the gate on the way in, so the build cannot emit CSS the gate would have refused and
 * no second reading of these files is needed to enforce it. The base sheet ships into the same file
 * as the effects and so faces the same bans; only the drift check is effect-only, because base has
 * no catalogue record and must not grow a hand-written one here.
 * @param {string} srcDir
 * @param {readonly { id: string, cssPropsWritten: string }[]} effects
 */
export function styleSheet(srcDir, effects) {
  const base = readFileSync(path.join(srcDir, 'src', 'base.css'), 'utf8')
  assertLibraryCss('base', base)
  const parts = [base]
  for (const effect of effects) {
    const css = readFileSync(path.join(srcDir, 'src', 'effects', `${effect.id}.css`), 'utf8')
    assertEffectCss(effect, css)
    parts.push(css)
  }
  return parts.join('\n')
}

/**
 * Everything the build would write, in memory. A key is `<side>/<rel>`, where the side is
 * `wordpress`, `joomla` or `library`; copies that must match hold the same string, which is what
 * makes them byte-identical on disk.
 * @param {{ srcDir?: string, version?: number, effects?: readonly object[], slots?: readonly object[] }} opts
 * @returns {Promise<{ files: Map<string, string>, version: number }>}
 */
export async function plan({ srcDir = PKG, version = VERSION, effects = EFFECTS, slots = SLOTS } = {}) {
  assertCatalog(effects, version, slots)

  const js = await esbuild.build({
    entryPoints: [path.join(srcDir, 'src', 'runtime.mjs')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2019',
    legalComments: 'none',
    banner: { js: banner(version) },
    define: { __TRACY_MOTION_EFFECTS__: JSON.stringify(runtimeEffects(effects)) },
    write: false,
    outfile: 'tracy-motion.js'
  })

  const css = await esbuild.build({
    stdin: { contents: styleSheet(srcDir, effects), loader: 'css', resolveDir: srcDir },
    bundle: true,
    minify: true,
    legalComments: 'none',
    write: false,
    outfile: 'tracy-motion.css'
  })

  const files = new Map([
    ['wordpress/assets/js/tracy-motion.js', js.outputFiles[0].text],
    ['wordpress/assets/css/tracy-motion.css', css.outputFiles[0].text],
    ['wordpress/inc/motion-head.php', HEAD_SNIPPET],
    ['joomla/media/js/tracy-motion.js', js.outputFiles[0].text],
    ['joomla/media/css/tracy-motion.css', css.outputFiles[0].text],
    ['joomla/motion-head.php', HEAD_SNIPPET],
    [
      'library/src/text.generated.ts',
      textModule({
        css: css.outputFiles[0].text,
        js: js.outputFiles[0].text,
        version,
        effects,
        slots
      })
    ]
  ])
  return { files, version }
}

/** @param {string} key @param {{ library: string, wordpress: string, joomla: string }} roots */
function target(key, roots) {
  const [side, ...rest] = key.split('/')
  return path.join(roots[side], ...rest)
}

/**
 * Planned files that are missing or differ on disk.
 * @param {Map<string, string>} files
 * @param {{ library: string, wordpress: string, joomla: string }} roots
 */
export function stale(files, roots) {
  const report = []
  for (const [key, content] of files) {
    const abs = target(key, roots)
    if (!existsSync(abs) || readFileSync(abs, 'utf8') !== content) report.push(key)
  }
  return report
}

async function main() {
  const check = process.argv.includes('--check')
  const roots = { library: PKG, wordpress: WORDPRESS, joomla: JOOMLA }
  const { files, version } = await plan()
  if (check) {
    const report = stale(files, roots)
    if (report.length > 0) {
      for (const key of report) console.error(`build: ${key} is stale`)
      console.error('build: run `pnpm --filter @tracy/cms-motion build`.')
      process.exit(1)
    }
    console.log(`build: motion library ${String(version)}, every generated file matches the source.`)
    return
  }
  for (const [key, content] of files) {
    const abs = target(key, roots)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  console.log(
    `build: motion library ${String(version)}, ${String(EFFECTS.length)} effect(s) → ${String(files.size)} generated files.`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
