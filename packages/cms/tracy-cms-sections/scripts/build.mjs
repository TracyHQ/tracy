#!/usr/bin/env node
/**
 * Generate the page sections both CMS themes ship, from one source.
 *
 * `sections/<name>.html` is WordPress block markup with `tracy-*` role classes and Tailwind
 * utilities; `tailwind.css` maps the utilities onto the 56 OpenDesign token names (inline theme,
 * no preflight); `sections.css` is the hand-written remainder. From that one source the build
 * writes:
 *
 *   WordPress  packages/cms/tracy-wordpress-theme/src/tracy/patterns/section-<name>.php   (pattern, markup as-is)
 *              …/patterns/landing.php                                                     (composite, by pattern slug)
 *              …/assets/css/sections.css                                                  (utilities + remainder, var(--x) → WordPress variable)
 *              …/assets/img/hero-placeholder.svg
 *   Joomla     packages/cms/tracy-joomla-template/src/tpl_tracy/sections/<name>.html      (block comments stripped)
 *              …/sections/landing.html                                                    (composite, hero first, like the WordPress pattern)
 *              …/media/css/sections.css                                                   (utilities + remainder, verbatim)
 *              …/media/images/hero-placeholder.svg
 *
 * WHY ONE SOURCE. The seeder will pour the customer's words into these sections on either CMS,
 * and an agent should find the same section names, the same classes and the same order on both.
 * Block markup is valid HTML, so stripping the `<!-- wp:… -->` comments is the whole Joomla port.
 *
 * WHY TAILWIND HERE AND NOWHERE ON THE SITE. Tailwind runs once, in this build, over the class
 * names the sixteen sections actually use; the customer's site receives plain CSS. A utility
 * without a token behind it (`p-7`, `text-red-500`) compiles to nothing, which keeps the sections
 * on the 56-token contract every design system honours. Same generated + gated shape as the theme
 * builds: one script writes, `--check` compares.
 *
 * Usage:  node scripts/build.mjs            # writes into both theme packages
 *         node scripts/build.mjs --check    # exits 1 when any generated file is stale; writes nothing
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WP_VAR } from '../../tracy-wordpress-theme/scripts/build.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(PKG, '..', '..', '..')
const WORDPRESS = path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme', 'src', 'tracy')
const JOOMLA = path.join(ROOT, 'packages', 'cms', 'tracy-joomla-template', 'src', 'tpl_tracy')

/**
 * The landing order of `vendor/tracy/od-brand-engine/src/engine/artifacts/landing.ts`, then the
 * standalone page sections — the ones a site reaches by its own URL rather than by scrolling the
 * landing page — each section's marker says which it is (`kind`), and that is what keeps the pages
 * out of the landing composite.
 */
export const ORDER = Object.freeze([
  'hero',
  'social-proof',
  'problem',
  'pillars',
  'how-it-works',
  'cta-inline',
  'features',
  'proof',
  'faq',
  'pricing',
  'cta-final',
  'styleguide',
  'contact',
  'team',
  'gallery',
  'listing'
])

/**
 * What a section says about itself: the marker on LINE 2 of `sections/<name>.html`,
 *
 *   <!-- tracy:section {"title":"Hero","kind":"landing","class":".tracy-hero","holds":["eyebrow","headline"]} -->
 *
 * `kind` is `landing` (a band of the landing page) or `page` (a destination with its own URL — a
 * team grid, a gallery, an archive index; pouring one into the landing composite would make the
 * landing page a site map). `title`, `class` and `holds` are what the README table and
 * `regions.json` print. Until 29/09/2026 title and standalone-ness were two hand-typed tables in
 * this file and a README table kept by hand, which had drifted to 13 of 16 rows; a section now
 * declares itself where it lives, and everything that describes it is generated (ADR 0023's
 * vocabulary step: the manifest an agent reads is derived, never kept).
 *
 * The marker is read and REMOVED before anything is written: a pattern or a Joomla snippet carries
 * no trace of it, so a customer's page is exactly what it was before markers existed.
 */
const KINDS = new Set(['landing', 'page'])

/**
 * @typedef {{ title: string, kind: 'landing' | 'page', class: string, holds: string[] }} SectionMeta
 */

/**
 * The marker's fields, and the markup without the marker.
 * @param {string} markup the section source
 * @param {string} name for the error
 * @returns {{ meta: SectionMeta, markup: string }}
 */
export function sectionMeta(markup, name) {
  const lines = markup.split('\n')
  const second = lines[1] ?? ''
  const hit = /^<!-- tracy:section (\{.*\}) -->$/.exec(second)
  if (!hit)
    throw new Error(
      `sections/${name}.html has no marker on line 2 — expected <!-- tracy:section {"title","kind","class","holds"} -->`
    )
  let parsed
  try {
    parsed = JSON.parse(hit[1])
  } catch {
    throw new Error(`sections/${name}.html: the marker on line 2 is not valid JSON`)
  }
  const { title, kind, class: cls, holds } = parsed
  if (typeof title !== 'string' || title === '')
    throw new Error(`sections/${name}.html: marker needs a title`)
  if (!KINDS.has(kind))
    throw new Error(`sections/${name}.html: marker kind must be landing or page, got ${JSON.stringify(kind)}`)
  if (typeof cls !== 'string' || !cls.startsWith('.tracy-'))
    throw new Error(`sections/${name}.html: marker class must name the section's .tracy-* class`)
  if (!Array.isArray(holds) || holds.length === 0 || holds.some((h) => typeof h !== 'string' || h === ''))
    throw new Error(`sections/${name}.html: marker holds must be a non-empty list of strings`)
  lines.splice(1, 1)
  return { meta: { title, kind, class: cls, holds }, markup: lines.join('\n') }
}

/** The README rows the markers produce, in order. @param {string[]} order @param {Record<string, SectionMeta>} metas */
export function readmeTable(order, metas) {
  const rows = order.map((n) => `| \`${n}\` | \`${metas[n].class}\` | ${metas[n].holds.join(' · ')} |`)
  return ['| Section | Class | What it holds |', '|---|---|---|', ...rows].join('\n')
}

const README_BEGIN = '<!-- sections:begin -->'
const README_END = '<!-- sections:end -->'

const WP_IMG = '/wp-content/themes/tracy/assets/img/'
const JOOMLA_IMG = '/media/templates/site/tpl_tracy/images/'
const GENERATED =
  'Generated by packages/cms/tracy-cms-sections/scripts/build.mjs — edit the source there, not this file.'

/**
 * Block markup → plain HTML: drop every `<!-- wp:… -->` / `<!-- /wp:… -->` line and the blank
 * lines that leaves behind.
 * @param {string} markup
 */
export function stripBlocks(markup) {
  return markup
    .replace(/<!-- \/?wp:[\s\S]*? -->\n?/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/^\n/, '')
}

/**
 * Every class name used in the given markup, in first-seen order — the candidates Tailwind compiles.
 * @param {string[]} markups
 */
export function candidatesOf(markups) {
  const seen = new Set()
  for (const markup of markups) {
    for (const match of markup.matchAll(/class="([^"]*)"/g)) {
      for (const token of match[1].split(/\s+/)) if (token) seen.add(token)
    }
  }
  return [...seen]
}

/**
 * The tailwindcss package directory: the package's own dependency when installed, else the copy
 * the workspace already holds in the pnpm store (a worktree with a symlinked node_modules).
 */
function tailwindDir() {
  try {
    return path.dirname(
      createRequire(pathToFileURL(path.join(PKG, 'package.json'))).resolve('tailwindcss/package.json')
    )
  } catch {
    const store = path.join(ROOT, 'node_modules', '.pnpm')
    const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith('tailwindcss@4.')) : undefined
    if (!hit) throw new Error('tailwindcss is not installed: run pnpm install')
    return path.join(store, hit, 'node_modules', 'tailwindcss')
  }
}

/**
 * Compile the utilities the sections use, from the inline-theme input. Pure: the same input and
 * candidates always give the same CSS, which is what lets `--check` compare it byte for byte.
 * @param {string} input - the contents of tailwind.css
 * @param {string[]} candidates
 */
export async function compileUtilities(input, candidates) {
  const dir = tailwindDir()
  const { compile } = await import(pathToFileURL(path.join(dir, 'dist', 'lib.mjs')).href)
  const compiler = await compile(input, {
    base: PKG,
    loadStylesheet: async (id, base) => {
      const file = id.startsWith('tailwindcss/')
        ? path.join(dir, id.slice('tailwindcss/'.length))
        : path.resolve(base, id)
      return { base: path.dirname(file), content: readFileSync(file, 'utf8') }
    }
  })
  const css = compiler.build([...candidates].sort())
  // Where a Tailwind namespace and a token share a name (--text-lg, --radius-md, --font-display),
  // the inline theme still emits `:root { --text-lg: var(--text-lg) }` — a self-reference that
  // would make the token invalid wherever this sheet loads after the design system's. Utilities
  // already carry the token inline, so the block has no job: drop it, and refuse any other :root.
  const stripped = css.replace(/^:root, :host \{[^}]*\}\n/m, '')
  if (/:root/.test(stripped)) throw new Error('tailwind emitted a :root block the build did not expect')
  return stripped
}

/** Classes that are not utilities: role classes and what WordPress itself puts on a block. */
const NOT_A_UTILITY = /^(tracy-|wp-|is-|size-|has-|align)/

/**
 * Candidates that compiled to nothing: a typo, or a value with no token behind it (`p-7`). Each
 * is compiled alone against an empty baseline, so a class hidden inside a variant is caught too.
 * @param {string} input
 * @param {string[]} candidates
 */
export async function silentCandidates(input, candidates) {
  const dir = tailwindDir()
  const { compile } = await import(pathToFileURL(path.join(dir, 'dist', 'lib.mjs')).href)
  const load = async (id, base) => {
    const file = id.startsWith('tailwindcss/')
      ? path.join(dir, id.slice('tailwindcss/'.length))
      : path.resolve(base, id)
    return { base: path.dirname(file), content: readFileSync(file, 'utf8') }
  }
  const baseline = (await compile(input, { base: PKG, loadStylesheet: load })).build([])
  const silent = []
  for (const candidate of candidates) {
    if (NOT_A_UTILITY.test(candidate)) continue
    const compiler = await compile(input, { base: PKG, loadStylesheet: load })
    if (compiler.build([candidate]) === baseline) silent.push(candidate)
  }
  return silent
}

/**
 * Tailwind's own `@layer properties` fallback block (`*, ::before, ::after, ::backdrop { --tw-…: … }`):
 * the registered defaults of its internal variables, `--tw-ring-offset-color: #fff` among them. No
 * design role lives there, so the WordPress copy marks the rule with the packaging role scan's manual
 * keep marker (docs/references/quickstart-release.md §4); every browser ignores the comment.
 */
const TW_PROPERTY_DEFAULTS = /(\*, ::before, ::after, ::backdrop \{\n)/
const TW_KEEP = "/* ds-keep: Tailwind's own registered property defaults, not a design role */"

/** The WordPress copy: comments dropped (they name raw tokens), every var(--x) rewritten. @param {string} css */
function rewriteVars(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\/\n?/g, '')
    .replace(TW_PROPERTY_DEFAULTS, `$1      ${TW_KEEP}\n`)
    .replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g, (_, name) => {
      if (name.startsWith('--tw-')) return `var(${name})`
      const wp = WP_VAR[name]
      if (!wp) throw new Error(`sections css references ${name}, which is not one of the 56 contract tokens`)
      return `var(${wp})`
    })
}

/**
 * Everything the build would write, in memory. Keys are `wordpress/<rel>` or `joomla/<rel>`.
 * @param {{ srcDir: string, order?: readonly string[] }} opts
 * @returns {Promise<{ files: Map<string, string>, order: string[], candidates: string[] }>}
 */
export async function plan({ srcDir, order = ORDER }) {
  const files = new Map()
  const joomlaLanding = []
  const markups = []
  /** @type {Record<string, SectionMeta>} */
  const metas = {}
  for (const name of order) {
    const file = path.join(srcDir, 'sections', `${name}.html`)
    if (!existsSync(file))
      throw new Error(`section ${name} is in the order but sections/${name}.html is missing`)
    const source = readFileSync(file, 'utf8')
    if (!source.startsWith('<!-- wp:'))
      throw new Error(`sections/${name}.html does not start with a block comment`)
    const { meta, markup } = sectionMeta(source, name)
    metas[name] = meta
    markups.push(markup)
    const title = meta.title
    files.set(
      `wordpress/patterns/section-${name}.php`,
      `<?php\n/**\n * Title: ${title}\n * Slug: tracy/section-${name}\n * Categories: tracy\n * Description: ${title} section of the Tracy section library. ${GENERATED}\n *\n * @package tracy\n */\n?>\n${markup}`
    )
    const html = stripBlocks(markup).replaceAll(WP_IMG, JOOMLA_IMG)
    files.set(`joomla/sections/${name}.html`, `<!-- ${GENERATED} -->\n${html}`)
    if (meta.kind === 'landing') joomlaLanding.push(html)
  }
  const standalone = order.filter((n) => metas[n].kind === 'page')
  const landingOrder = order.filter((n) => metas[n].kind === 'landing')
  files.set(
    'wordpress/patterns/landing.php',
    `<?php\n/**\n * Title: Landing page\n * Slug: tracy/landing\n * Categories: tracy\n * Description: The whole landing page, section by section, in the order the design library shows it. ${GENERATED}\n *\n * @package tracy\n */\n?>\n${landingOrder.map((n) => `<!-- wp:pattern {"slug":"tracy/section-${n}"} /-->`).join('\n')}\n`
  )
  files.set('joomla/sections/landing.html', `<!-- ${GENERATED} -->\n${joomlaLanding.join('')}`)

  const candidates = candidatesOf(markups)
  const input = readFileSync(path.join(srcDir, 'tailwind.css'), 'utf8')
  const silent = await silentCandidates(input, candidates)
  if (silent.length > 0) {
    throw new Error(
      `these classes compiled to nothing — a typo, or a value outside the 56-token contract: ${silent.join(', ')}`
    )
  }
  const utilities = await compileUtilities(input, candidates)
  const remainder = readFileSync(path.join(srcDir, 'sections.css'), 'utf8')
  const css = `/* ${GENERATED} */\n${utilities}\n\n${remainder}`
  files.set('joomla/media/css/sections.css', css)
  files.set('wordpress/assets/css/sections.css', rewriteVars(css))

  // The shape map: what a T4 template (or anything else that is not these two CMS) needs in order
  // to lay a section out in its OWN framework. It lives in the package rather than in either theme
  // because it belongs to neither, and it is DERIVED so it cannot drift from the sections.
  files.set(
    'self/regions.json',
    `${JSON.stringify(
      {
        schemaVersion: 'tracy-cms-regions/v1',
        note: GENERATED,
        what: 'the platform-neutral shape of each section — parts and arrangement, no class names and no framework. `head` is the section intro in document order; `body.cols` is columns per breakpoint; `body.item.parts` are the content slots of one item. A field the markup does not state is absent, never guessed. Bespoke sections (hero, the CTA bands) declare only `root`: their arrangement is a per-design-system choice, and for the hero that choice already lives in vendor/od-design-system/archetypes.json.',
        order: [...order],
        standalone,
        sections: Object.fromEntries(
          order.map((n, i) => [
            n,
            {
              title: metas[n].title,
              kind: metas[n].kind,
              class: metas[n].class,
              holds: [...metas[n].holds],
              standalone: metas[n].kind === 'page',
              ...shapeOf(markups[i])
            }
          ])
        )
      },
      null,
      1
    )}\n`
  )

  // The README's section table is generated from the same markers, between two comments, so the
  // prose around it stays a person's and the rows cannot drift (they had: 13 rows for 16 sections).
  const readme = path.join(srcDir, 'README.md')
  if (existsSync(readme)) {
    const text = readFileSync(readme, 'utf8')
    const begin = text.indexOf(README_BEGIN)
    const end = text.indexOf(README_END)
    if (begin === -1 || end === -1 || end < begin)
      throw new Error(`README.md must carry ${README_BEGIN} … ${README_END} around the section table`)
    files.set(
      'self/README.md',
      `${text.slice(0, begin + README_BEGIN.length)}\n${readmeTable(order, metas)}\n${text.slice(end)}`
    )
  }

  const svg = readFileSync(path.join(srcDir, 'assets', 'hero-placeholder.svg'), 'utf8')
  files.set('wordpress/assets/img/hero-placeholder.svg', svg)
  files.set('joomla/media/images/hero-placeholder.svg', svg)
  return { files, order: [...order], candidates, standalone, sections: metas }
}

/**
 * The platform-neutral SHAPE of a section: what it is made of and how it is arranged, with no
 * class names and no framework in it.
 *
 * WHY NOT JUST SHIP THE MARKUP. The sections are WordPress block markup carrying `wp-block-*`
 * classes and Tailwind utilities (`grid gap-6 sm:grid-cols-2 lg:grid-cols-3`). Joomla gets the same
 * markup with the block comments stripped, which is fine because `tpl_tracy` is built for it. A T4
 * template is not: it is Bootstrap 5, and carrying these classes across would be wrong twice —
 * once about the framework, once about CLAUDE.md rule 4, which forbids bringing a second reset or
 * Tailwind into a page someone else owns.
 *
 * What DOES travel is the decision: a pricing section is an eyebrow, a heading and a lead over a
 * three-column grid of cards, each card an eyebrow, a price, a meta line, a list and an action.
 * That renders as `.row.row-cols-lg-3` in Bootstrap and as a block grid in WordPress, and both are
 * the same design. So this reads the shape back out of the markup — derived, never hand-kept, so
 * it cannot drift from the sections it describes.
 *
 * Absent is absent: where the markup does not say, the field is omitted rather than guessed.
 * @param {string} markup
 */
export function shapeOf(markup) {
  /** A role name is the class with its `tracy-` prefix and its section prefix removed. */
  const role = (cls) => {
    // `tracy-actions` IS a role — the action row of an item — even though it is a wrapper. Excluding
    // it made a pricing card report a part called `div`, which tells a reader nothing.
    if (cls.includes('tracy-actions')) return 'actions'
    // The button INSIDE an action row is not a second part: `actions` already says an action lives
    // here, and listing both made a pricing card read as `… list, actions, btn`.
    if (cls.some((c) => c.startsWith('tracy-btn'))) return null
    const hit = cls.find((c) => c.startsWith('tracy-') && !/^tracy-(section|grid|card)/.test(c))
    if (!hit) return null
    const bare = hit.slice('tracy-'.length)
    return bare.includes('__') ? bare.slice(bare.indexOf('__') + 2) : bare
  }

  const shape = {}

  const root = markup.match(/"tagName":"([a-z]+)"/)
  shape.root = root ? root[1] : 'div'

  // The head: the reading measure, then the roles of its children in document order.
  const head = markup.match(/class="[^"]*tracy-section__head([^"]*)"[^>]*>([\s\S]*?)\n<\/div>/)
  if (head) {
    const measure = head[1].match(/max-w-\[([^\]]+)\]/)
    if (measure) shape.measure = measure[1]
    const parts = []
    for (const el of head[2].matchAll(/<(h[1-6]|p)[^>]*class="([^"]*)"/g)) {
      parts.push(role(el[2].split(/\s+/)) ?? el[1])
    }
    if (parts.length) shape.head = parts
  }

  // The body: a grid, and what one item of it is made of.
  const grid = markup.match(/class="[^"]*\b(?:tracy-grid|tracy-[a-z-]+__(?:grid|list))\b([^"]*)"/)
  if (grid) {
    const util = grid[1]
    const cols = {}
    const phone = util.match(/(?:^|\s)grid-cols-(\d+)/)
    const tablet = util.match(/sm:grid-cols-(\d+)/)
    const desktop = util.match(/lg:grid-cols-(\d+)/)
    cols.phone = phone ? Number(phone[1]) : 1
    if (tablet) cols.tablet = Number(tablet[1])
    if (desktop) cols.desktop = Number(desktop[1])
    const gap = util.match(/(?:^|\s)gap-(\d+)/)
    shape.body = { kind: 'grid', cols }
    if (gap) shape.body.gap = `--space-${gap[1]}`

    // One item, and the roles inside it. The first is representative: the others are variants.
    const item = markup
      .slice(grid.index)
      .match(
        /<(?:div|article)[^>]*class="([^"]*(?:tracy-card|tracy-entry|tracy-shot|tracy-person)[^"]*)"[^>]*>([\s\S]*?)\n<\/(?:div|article)>/
      )
    if (item) {
      const parts = []
      for (const el of item[2].matchAll(/<(h[1-6]|p|ul|figure|div)[^>]*class="([^"]*)"/g)) {
        const r = role(el[2].split(/\s+/))
        // A bare tag with no role class is structure, not a part: naming it `div` would put a
        // wrapper in a list that is supposed to describe content.
        const kind = r ?? (el[1] === 'ul' ? 'list' : el[1] === 'figure' ? 'media' : null)
        if (kind && !parts.includes(kind)) parts.push(kind)
      }
      // An item with no readable parts is not an item — reporting `{role: card, parts: []}` claims
      // a shape the markup never gave, which is worse than reporting nothing.
      if (parts.length) shape.body.item = { role: role(item[1].split(/\s+/)) ?? 'card', parts }
    }
  }

  return shape
}

/** @param {string} key @param {{ wordpress: string, joomla: string }} roots */
function target(key, roots) {
  const [side, ...rest] = key.split('/')
  if (side === 'self') return path.join(PKG, ...rest)
  return path.join(side === 'wordpress' ? roots.wordpress : roots.joomla, ...rest)
}

/**
 * Planned files that differ on disk, plus generated patterns or snippets no section produced.
 * @param {Map<string, string>} files
 * @param {{ wordpress: string, joomla: string }} roots
 */
export function stale(files, roots) {
  const report = []
  for (const [key, content] of files) {
    const abs = target(key, roots)
    if (!existsSync(abs) || readFileSync(abs, 'utf8') !== content) report.push(key)
  }
  const patterns = path.join(roots.wordpress, 'patterns')
  if (existsSync(patterns)) {
    for (const name of readdirSync(patterns)) {
      const key = `wordpress/patterns/${name}`
      if (/^section-.*\.php$/.test(name) && !files.has(key)) report.push(key)
    }
  }
  const sections = path.join(roots.joomla, 'sections')
  if (existsSync(sections)) {
    for (const name of readdirSync(sections)) {
      const key = `joomla/sections/${name}`
      if (name.endsWith('.html') && !files.has(key)) report.push(key)
    }
  }
  return report
}

async function main() {
  const check = process.argv.includes('--check')
  const roots = { wordpress: WORDPRESS, joomla: JOOMLA }
  const { files, order, candidates } = await plan({ srcDir: PKG })
  if (check) {
    const report = stale(files, roots)
    if (report.length > 0) {
      for (const key of report) console.error(`build: ${key} is stale`)
      console.error('build: run `pnpm --filter @tracy/cms-sections build`.')
      process.exit(1)
    }
    console.log(`build: ${String(order.length)} sections, both themes match the source.`)
    return
  }
  for (const [key, content] of files) {
    const abs = target(key, roots)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  console.log(
    `build: ${String(order.length)} sections, ${String(candidates.length)} class names → ${String(files.size)} files in both themes.`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
